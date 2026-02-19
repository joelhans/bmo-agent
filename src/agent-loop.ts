import type { BmoConfig } from "./config.ts";
import { type SessionTracker, truncateToFit } from "./context.ts";
import type { ChatMessage, LlmClient, ToolCallInfo } from "./llm.ts";
import type { Logger } from "./logger.ts";
import {
	buildSelfImproveRegistry,
	detectFrictionSignals,
	runSelfImproveCheck,
	type SelfImproveContext,
	type SelfImproveDisplay,
} from "./self-improve.ts";
import type { ToolCallRecord } from "./telemetry.ts";
import { type ModelTier, selectIterationTier } from "./tiering.ts";
import type { ToolRegistry } from "./tools.ts";
import { formatToolCallSummary } from "./tools.ts";

// ---------------------------------------------------------------------------
// Display interface (implemented by TUI ChatView)
// ---------------------------------------------------------------------------

export interface AgentDisplay {
	addMessage(role: "user" | "assistant" | "system", content: string): void;
	beginAssistantMessage(): void;
	appendToAssistantMessage(text: string): void;
	addToolCall(summary: string): void;
	addSkillLoaded(name: string): void;
	addToolResult(result: string, isError?: boolean): void;
	setStatus(text: string): void;
	setInputEnabled(enabled: boolean): void;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AgentLoopOptions {
	logger: Logger;
	llm: LlmClient;
	registry: ToolRegistry;
	messages: ChatMessage[];
	session: SessionTracker;
	models: { reasoning: string; coding: string; micro?: string };
	contextConfig: {
		reasoning: { maxTokens: number; responseHeadroom: number };
		coding: { maxTokens: number; responseHeadroom: number };
		micro?: { maxTokens: number; responseHeadroom: number };
	};
	defaultTier: ModelTier;
	display: AgentDisplay;
	defaultStatus: string;
	toolCallRecords?: ToolCallRecord[];
	sessionId?: string;
	onModelChange?: (tier: ModelTier, model: string) => void;
	// Self-improvement options
	selfImproveConfig?: BmoConfig["selfImprovement"];
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 20;

export async function runAgentLoop(opts: AgentLoopOptions): Promise<{ lastResponseWasError: boolean }> {
	const { logger, llm, registry, messages, session, models, contextConfig, defaultTier, display, defaultStatus } = opts;

	display.setInputEnabled(false);
	display.setStatus(`${defaultStatus} | thinking...`);

	// Track state for tier selection
	let lastToolCalls: Array<{ name: string; success: boolean }> = [];
	let lastAssistantText = "";
	let hadError = false;
	let currentTier = defaultTier;

	// Track error info for self-improvement
	let lastFailedTool: string | undefined;
	let lastFailedArgs: string | undefined;
	let lastErrorMessage: string | undefined;

	// Get the user message (last user message in the conversation)
	const userMessage = findLastUserMessage(messages);

	try {
		for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
			// Select tier for this iteration:
			// - iteration 0: use defaultTier (already selected by selectInitialTier in TUI)
			// - iteration 1+: use selectIterationTier based on what just happened
			const tier =
				iteration === 0
					? defaultTier
					: selectIterationTier({
							iteration,
							lastToolCalls,
							lastAssistantText,
							hadError,
						});

			const model = models[tier];
			const context = contextConfig[tier];

			// Log tier switches
			if (tier !== currentTier) {
				logger.info(`tier switch: ${currentTier} → ${tier} (${model})`);
				currentTier = tier;
				opts.onModelChange?.(tier, model);
			}

			const dropped = truncateToFit(messages, context.maxTokens, context.responseHeadroom);
			if (dropped > 0) {
				logger.info(`context: dropped ${dropped} messages to fit within token budget`);
			}

			// Fetch schemas fresh each iteration — tools may have been added/removed by reload_tools
			const schemas = registry.getSchemas();

			// Accumulate streaming response
			let textContent = "";
			const toolCalls = new Map<number, { id: string; name: string; args: string }>();
			let finishReason = "stop";

			display.beginAssistantMessage();

			for await (const event of llm.stream(messages, model, schemas.length > 0 ? schemas : undefined)) {
				if (event.type === "text") {
					textContent += event.text;
					display.appendToAssistantMessage(event.text);
				} else if (event.type === "tool_call_start") {
					toolCalls.set(event.index, { id: event.id, name: event.name, args: "" });
				} else if (event.type === "tool_call_args") {
					const tc = toolCalls.get(event.index);
					if (tc) tc.args += event.args;
				} else if (event.type === "usage") {
					session.recordUsage(model, event.promptTokens, event.completionTokens);
					logger.info(
						`tokens: prompt=${event.promptTokens} completion=${event.completionTokens}` +
							` cost=$${session.getStats().totalCost.toFixed(4)} [${tier}]`,
					);
				} else if (event.type === "done") {
					finishReason = event.finishReason;
				}
			}

			// Update state for next iteration's tier selection
			lastAssistantText = textContent;

			// No tool calls — text-only response, turn complete
			if (toolCalls.size === 0) {
				messages.push({ role: "assistant", content: textContent || null });
				logger.info(`assistant: ${(textContent || "").slice(0, 200)}${(textContent || "").length > 200 ? "..." : ""}`);

				// === Self-improvement check on turn complete ===
				await maybeSelfImprove(opts, {
					hadError,
					lastFailedTool,
					lastFailedArgs,
					lastErrorMessage,
					userMessage,
					assistantResponse: textContent,
				});

				return { lastResponseWasError: false };
			}

			// Build tool_calls array for the assistant message
			const toolCallInfos: ToolCallInfo[] = [...toolCalls.values()].map((tc) => ({
				id: tc.id,
				function: { name: tc.name, arguments: tc.args },
			}));

			messages.push({
				role: "assistant",
				content: textContent || null,
				tool_calls: toolCallInfos,
			});

			logger.info(`assistant: ${toolCallInfos.length} tool call(s) [${finishReason}]`);

			// Execute each tool call and track success/failure for next iteration
			lastToolCalls = [];
			hadError = false;
			lastFailedTool = undefined;
			lastFailedArgs = undefined;
			lastErrorMessage = undefined;

			for (const tc of toolCallInfos) {
				const summary = formatToolCallSummary(tc.function.name, tc.function.arguments);

				// Use distinct display for load_skill
				if (tc.function.name === "load_skill") {
					try {
						const args = JSON.parse(tc.function.arguments) as { name?: string };
						display.addSkillLoaded(args.name ?? "unknown");
					} catch {
						display.addSkillLoaded("unknown");
					}
				} else {
					display.addToolCall(summary);
				}
				logger.info(`tool call: ${summary}`);

				const tool = registry.get(tc.function.name);
				if (!tool) {
					const errorMsg = `Unknown tool: ${tc.function.name}`;
					messages.push({ role: "tool", content: errorMsg, tool_call_id: tc.id });
					display.addToolResult(errorMsg, true);
					logger.error(errorMsg);
					opts.toolCallRecords?.push({
						timestamp: new Date().toISOString(),
						toolName: tc.function.name,
						durationMs: 0,
						success: false,
					});
					lastToolCalls.push({ name: tc.function.name, success: false });
					hadError = true;
					lastFailedTool = tc.function.name;
					lastFailedArgs = tc.function.arguments;
					lastErrorMessage = errorMsg;
					continue;
				}

				let args: Record<string, unknown>;
				try {
					args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
				} catch {
					const errorMsg = `Invalid JSON arguments: ${tc.function.arguments.slice(0, 100)}`;
					messages.push({ role: "tool", content: errorMsg, tool_call_id: tc.id });
					display.addToolResult(errorMsg, true);
					logger.error(errorMsg);
					opts.toolCallRecords?.push({
						timestamp: new Date().toISOString(),
						toolName: tc.function.name,
						durationMs: 0,
						success: false,
					});
					lastToolCalls.push({ name: tc.function.name, success: false });
					hadError = true;
					lastFailedTool = tc.function.name;
					lastFailedArgs = tc.function.arguments;
					lastErrorMessage = errorMsg;
					continue;
				}

				const startMs = performance.now();
				try {
					const result = await tool.execute(args);
					const durationMs = Math.round(performance.now() - startMs);
					messages.push({ role: "tool", content: result.output, tool_call_id: tc.id });
					display.addToolResult(result.output, result.isError);
					logger.info(`tool result: ${result.output.slice(0, 200)}${result.output.length > 200 ? "..." : ""}`);
					opts.toolCallRecords?.push({
						timestamp: new Date().toISOString(),
						toolName: tc.function.name,
						durationMs,
						success: !result.isError,
					});
					lastToolCalls.push({ name: tc.function.name, success: !result.isError });
					if (result.isError) {
						hadError = true;
						lastFailedTool = tc.function.name;
						lastFailedArgs = tc.function.arguments;
						lastErrorMessage = result.output;
					}
				} catch (err: unknown) {
					const durationMs = Math.round(performance.now() - startMs);
					const errorMsg = `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`;
					messages.push({ role: "tool", content: errorMsg, tool_call_id: tc.id });
					display.addToolResult(errorMsg, true);
					logger.error(errorMsg);
					opts.toolCallRecords?.push({
						timestamp: new Date().toISOString(),
						toolName: tc.function.name,
						durationMs,
						success: false,
					});
					lastToolCalls.push({ name: tc.function.name, success: false });
					hadError = true;
					lastFailedTool = tc.function.name;
					lastFailedArgs = tc.function.arguments;
					lastErrorMessage = errorMsg;
				}
			}

			display.setStatus(`${defaultStatus} | thinking...`);
		}

		// Max iterations reached
		const msg = `Tool call loop reached maximum iterations (${MAX_ITERATIONS}).`;
		display.addMessage("system", msg);
		logger.warn(msg);
		return { lastResponseWasError: true };
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error(`LLM error: ${errorMessage}`);
		display.addMessage("system", `Error: ${errorMessage}`);
		return { lastResponseWasError: true };
	} finally {
		display.setInputEnabled(true);
		display.setStatus(defaultStatus);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findLastUserMessage(messages: ChatMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "user" && typeof msg.content === "string") {
			return msg.content;
		}
	}
	return "";
}

interface SelfImproveCheckContext {
	hadError: boolean;
	lastFailedTool?: string;
	lastFailedArgs?: string;
	lastErrorMessage?: string;
	userMessage: string;
	assistantResponse: string;
}

async function maybeSelfImprove(opts: AgentLoopOptions, ctx: SelfImproveCheckContext): Promise<void> {
	const { selfImproveConfig, registry, llm, models, display, logger, toolCallRecords } = opts;

	// Check if self-improvement is enabled and micro model is available
	if (!selfImproveConfig?.enabled || !models.micro) {
		return;
	}

	// Determine if we should trigger self-improvement
	const shouldTriggerOnError = selfImproveConfig.onErrors && ctx.hadError;
	const shouldTriggerOnCorrection = selfImproveConfig.onCorrections && detectFrictionSignals(ctx.userMessage);

	if (!shouldTriggerOnError && !shouldTriggerOnCorrection) {
		return;
	}

	logger.info(`self-improve: triggered (error=${shouldTriggerOnError}, correction=${shouldTriggerOnCorrection})`);

	// Build subset registry for self-improvement agent
	const selfImproveRegistry = buildSelfImproveRegistry(registry);

	// Build context for self-improvement agent
	const improveContext: SelfImproveContext = {
		failedToolName: ctx.lastFailedTool,
		failedToolArgs: ctx.lastFailedArgs,
		errorMessage: ctx.lastErrorMessage,
		userMessage: ctx.userMessage,
		assistantResponse: ctx.assistantResponse,
		toolInventory: selfImproveRegistry.listNames(),
	};

	// Create display adapter for self-improvement
	const improveDisplay: SelfImproveDisplay = {
		addMessage: (role, content) => display.addMessage(role, content),
		addToolCall: (summary) => display.addToolCall(summary),
		addToolResult: (result, isError) => display.addToolResult(result, isError),
	};

	// Run self-improvement check
	const result = await runSelfImproveCheck(
		llm,
		models.micro,
		selfImproveRegistry,
		improveContext,
		improveDisplay,
		logger,
		toolCallRecords,
	);

	logger.info(`self-improve: ${result.action} — ${result.description}`);
}
