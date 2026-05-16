import type { ChatMessage, LlmClient } from "./llm.ts";
import type { Logger } from "./logger.ts";
import type { ToolCallRecord } from "./telemetry.ts";
import type { ToolRegistry } from "./tools.ts";
import { createToolRegistry, formatToolCallSummary } from "./tools.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelfImproveContext {
	failedToolName?: string;
	failedToolArgs?: string;
	errorMessage?: string;
	userMessage: string;
	assistantResponse: string;
	toolInventory: string[];
}

export interface SelfImproveResult {
	action: "fixed_tool" | "created_tool" | "logged_learning" | "no_action";
	description: string;
	toolsModified?: string[];
}

export interface SelfImproveDisplay {
	addMessage(role: "system" | "assistant", content: string): void;
	addToolCall(summary: string): void;
	addToolResult(result: string, isError?: boolean): void;
}

// ---------------------------------------------------------------------------
// Correction detection heuristics
// ---------------------------------------------------------------------------

const CORRECTION_SIGNALS = /\b(no|not that|actually|instead|wrong|I said|that's not|don't do)\b/i;
const PREFERENCE_SIGNALS = /\b(I prefer|always do|never do|use .+ instead of)\b/i;

export function detectFrictionSignals(userMessage: string): boolean {
	return CORRECTION_SIGNALS.test(userMessage) || PREFERENCE_SIGNALS.test(userMessage);
}

// ---------------------------------------------------------------------------
// Self-improvement registry builder
// ---------------------------------------------------------------------------

// Tools the self-improvement sub-agent is allowed to use
const SELF_IMPROVE_TOOLS = ["write_file", "safe_read", "reload_tools", "search_code", "log_learning_event"];

/**
 * Build a subset registry containing only the tools the self-improvement agent needs.
 * This prevents the sub-agent from using potentially dangerous or recursive tools.
 */
export function buildSelfImproveRegistry(mainRegistry: ToolRegistry): ToolRegistry {
	const subRegistry = createToolRegistry();

	for (const toolName of SELF_IMPROVE_TOOLS) {
		const tool = mainRegistry.get(toolName);
		if (tool) {
			subRegistry.register(tool);
		}
	}

	return subRegistry;
}

// ---------------------------------------------------------------------------
// Self-improvement sub-agent
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 5;

export async function runSelfImproveCheck(
	llm: LlmClient,
	model: string,
	registry: ToolRegistry,
	context: SelfImproveContext,
	display: SelfImproveDisplay,
	logger: Logger,
	toolCallRecords?: ToolCallRecord[],
): Promise<SelfImproveResult> {
	const systemPrompt = buildSystemPrompt(context);

	const messages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: "Analyze and act. Be fast and minimal." },
	];

	display.addMessage("system", "[Self-improvement agent activated]");

	let actionTaken: SelfImproveResult = {
		action: "no_action",
		description: "No action needed",
	};

	try {
		for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
			const schemas = registry.getSchemas();

			// Stream response
			let textContent = "";
			const toolCalls = new Map<number, { id: string; name: string; args: string }>();

			for await (const event of llm.stream(messages, model, schemas.length > 0 ? schemas : undefined)) {
				if (event.type === "text") {
					textContent += event.text;
				} else if (event.type === "tool_call_start") {
					toolCalls.set(event.index, { id: event.id, name: event.name, args: "" });
				} else if (event.type === "tool_call_args") {
					const tc = toolCalls.get(event.index);
					if (tc) tc.args += event.args;
				}
			}

			// No tool calls — text-only response, done
			if (toolCalls.size === 0) {
				if (textContent) {
					display.addMessage("assistant", textContent);
					messages.push({ role: "assistant", content: textContent });

					// Try to extract action from response
					actionTaken = parseActionFromText(textContent);
				}
				break;
			}

			// Execute tool calls
			const toolCallInfos = [...toolCalls.values()].map((tc) => ({
				id: tc.id,
				function: { name: tc.name, arguments: tc.args },
			}));

			messages.push({
				role: "assistant",
				content: textContent || null,
				tool_calls: toolCallInfos,
			});

			for (const tc of toolCallInfos) {
				const summary = formatToolCallSummary(tc.function.name, tc.function.arguments);
				display.addToolCall(summary);
				logger.info(`self-improve tool call: ${summary}`);

				const tool = registry.get(tc.function.name);
				if (!tool) {
					const errorMsg = `Unknown tool: ${tc.function.name}`;
					messages.push({ role: "tool", content: errorMsg, tool_call_id: tc.id });
					display.addToolResult(errorMsg, true);
					continue;
				}

				let args: Record<string, unknown>;
				try {
					args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
				} catch {
					const errorMsg = `Invalid JSON arguments: ${tc.function.arguments.slice(0, 100)}`;
					messages.push({ role: "tool", content: errorMsg, tool_call_id: tc.id });
					display.addToolResult(errorMsg, true);
					continue;
				}

				const startMs = performance.now();
				try {
					const result = await tool.execute(args);
					const durationMs = Math.round(performance.now() - startMs);
					messages.push({ role: "tool", content: result.output, tool_call_id: tc.id });
					display.addToolResult(result.output, result.isError);

					toolCallRecords?.push({
						timestamp: new Date().toISOString(),
						toolName: tc.function.name,
						durationMs,
						success: !result.isError,
					});

					// Track what was done
					if (tc.function.name === "write_file" && !result.isError) {
						const path = args.path as string;
						if (path.includes("/tools/")) {
							actionTaken = {
								action: path.includes("/.") ? "no_action" : "created_tool",
								description: `Modified tool: ${path.split("/").pop()}`,
								toolsModified: [path.split("/").pop() || "unknown"],
							};
						}
					} else if (tc.function.name === "reload_tools" && !result.isError) {
						// Keep existing action, reload_tools is follow-up
					} else if (tc.function.name === "log_learning_event" && !result.isError) {
						actionTaken = { action: "logged_learning", description: "Logged learning event" };
					}
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : String(err);
					const errorMsg = `Tool execution failed: ${msg}`;
					const durationMs = Math.round(performance.now() - startMs);
					messages.push({ role: "tool", content: errorMsg, tool_call_id: tc.id });
					display.addToolResult(errorMsg, true);

					toolCallRecords?.push({
						timestamp: new Date().toISOString(),
						toolName: tc.function.name,
						durationMs,
						success: false,
					});
				}
			}
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(`self-improve: ${msg}`);
		display.addMessage("system", `[Self-improvement error: ${msg}]`);
	}

	display.addMessage("system", `[Self-improvement complete: ${actionTaken.description}]`);
	return actionTaken;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSystemPrompt(context: SelfImproveContext): string {
	const parts = [
		"You are a self-improvement sub-agent. Your job: fix problems NOW in under 5 tool calls.",
		"",
		"Context:",
	];

	if (context.failedToolName) {
		parts.push(`- Failed tool: ${context.failedToolName}`);
		if (context.failedToolArgs) {
			parts.push(`- Args: ${context.failedToolArgs.slice(0, 200)}`);
		}
		if (context.errorMessage) {
			parts.push(`- Error: ${context.errorMessage.slice(0, 300)}`);
		}
	}

	parts.push(`- User said: ${context.userMessage.slice(0, 400)}`);
	parts.push(`- Available tools: ${context.toolInventory.join(", ")}`);
	parts.push("");
	parts.push("Options:");
	parts.push("1. Tool failed? → Read it (safe_read), fix it (write_file), reload (reload_tools)");
	parts.push("2. Missing capability? → Create new tool (write_file .mjs in $BMO_HOME/tools/), reload");
	parts.push("3. User correction/preference? → Log it (log_learning_event)");
	parts.push("4. Can't fix quickly? → Explain why in text, no tools");
	parts.push("");
	parts.push("Be fast. Be minimal. Act or explain.");

	return parts.join("\n");
}

function parseActionFromText(text: string): SelfImproveResult {
	const lower = text.toLowerCase();

	if (lower.includes("fixed") || lower.includes("updated")) {
		return { action: "fixed_tool", description: text.slice(0, 100) };
	}
	if (lower.includes("created") || lower.includes("built")) {
		return { action: "created_tool", description: text.slice(0, 100) };
	}
	if (lower.includes("logged") || lower.includes("learning event")) {
		return { action: "logged_learning", description: text.slice(0, 100) };
	}
	if (lower.includes("no action") || lower.includes("not needed") || lower.includes("can't fix")) {
		return { action: "no_action", description: text.slice(0, 100) };
	}

	// Default: extract first sentence
	const firstSentence = text.split(/[.!?]/)[0] || text.slice(0, 100);
	return { action: "no_action", description: firstSentence };
}
