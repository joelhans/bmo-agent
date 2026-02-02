import { type SessionTracker, truncateToFit } from "./context.ts";
import type { ChatMessage, LlmClient, ToolCallInfo } from "./llm.ts";
import type { Logger } from "./logger.ts";
import type { ToolCallRecord } from "./telemetry.ts";
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
	model: string;
	contextConfig: { maxTokens: number; responseHeadroom: number };
	display: AgentDisplay;
	defaultStatus: string;
	toolCallRecords?: ToolCallRecord[];
	sessionId?: string;
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 20;

export async function runAgentLoop(opts: AgentLoopOptions): Promise<{ lastResponseWasError: boolean }> {
	const { logger, llm, registry, messages, session, model, contextConfig, display, defaultStatus } = opts;

	display.setInputEnabled(false);
	display.setStatus(`${defaultStatus} | thinking...`);

	try {
		for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
			const dropped = truncateToFit(messages, contextConfig.maxTokens, contextConfig.responseHeadroom);
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
							` cost=$${session.getStats().totalCost.toFixed(4)}`,
					);
				} else if (event.type === "done") {
					finishReason = event.finishReason;
				}
			}

			// No tool calls — text-only response
			if (toolCalls.size === 0) {
				messages.push({ role: "assistant", content: textContent || null });
				logger.info(`assistant: ${(textContent || "").slice(0, 200)}${(textContent || "").length > 200 ? "..." : ""}`);
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

			// Execute each tool call
			for (const tc of toolCallInfos) {
				const summary = formatToolCallSummary(tc.function.name, tc.function.arguments);
				display.addToolCall(summary);
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
