import { describe, expect, test } from "bun:test";
import type { AgentDisplay } from "./agent-loop.ts";
import { runAgentLoop } from "./agent-loop.ts";
import { createSessionTracker } from "./context.ts";
import type { ChatMessage, LlmClient, LlmEvent } from "./llm.ts";
import type { ToolCallRecord } from "./telemetry.ts";
import type { ToolRegistry } from "./tools.ts";
import { createToolRegistry } from "./tools.ts";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockDisplay(): AgentDisplay & { log: string[] } {
	const log: string[] = [];
	return {
		log,
		addMessage(_role, content) {
			log.push(`msg:${content}`);
		},
		beginAssistantMessage() {
			log.push("begin");
		},
		appendToAssistantMessage(text) {
			log.push(`append:${text}`);
		},
		addToolCall(summary) {
			log.push(`tool_call:${summary}`);
		},
		addToolResult(result, isError) {
			log.push(`tool_result:${isError ? "ERR:" : ""}${result.slice(0, 100)}`);
		},
		setStatus(text) {
			log.push(`status:${text.slice(0, 50)}`);
		},
		setInputEnabled(enabled) {
			log.push(`input:${enabled}`);
		},
	};
}

function createMockLlm(responses: Array<() => LlmEvent[]>): LlmClient {
	let callIndex = 0;
	return {
		async *stream(_messages: ChatMessage[], _model: string): AsyncGenerator<LlmEvent> {
			const events = responses[callIndex]?.() ?? [{ type: "done" as const, finishReason: "stop" }];
			callIndex++;
			for (const event of events) {
				yield event;
			}
		},
	};
}

function textResponse(text: string): () => LlmEvent[] {
	return () => [
		{ type: "text", text },
		{ type: "usage", promptTokens: 100, completionTokens: 50 },
		{ type: "done", finishReason: "stop" },
	];
}

function toolCallResponse(id: string, name: string, args: string): () => LlmEvent[] {
	return () => [
		{ type: "tool_call_start", index: 0, id, name },
		{ type: "tool_call_args", index: 0, args },
		{ type: "usage", promptTokens: 100, completionTokens: 50 },
		{ type: "done", finishReason: "tool_calls" },
	];
}

function createTestRegistry(): ToolRegistry {
	const registry = createToolRegistry();
	registry.register({
		name: "echo_tool",
		description: "Echoes input",
		parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
		async execute(args) {
			return { output: `echoed: ${args.text}` };
		},
	});
	return registry;
}

const baseOpts = {
	logger: { info: () => {}, warn: () => {}, error: () => {}, flush: async () => {} },
	session: createSessionTracker(),
	model: "openai/gpt-4o-mini",
	contextConfig: { maxTokens: 200_000, responseHeadroom: 4096 },
	defaultStatus: "status",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAgentLoop", () => {
	test("text-only response pushes assistant message", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([textResponse("Hello!")]);

		const result = await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
		});

		expect(result.lastResponseWasError).toBe(false);
		expect(messages).toHaveLength(2);
		expect(messages[1].role).toBe("assistant");
		expect(messages[1].content).toBe("Hello!");
		expect(display.log).toContain("append:Hello!");
	});

	test("single tool call followed by text response", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([toolCallResponse("c1", "echo_tool", '{"text":"hi"}'), textResponse("Done.")]);

		const result = await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
		});

		expect(result.lastResponseWasError).toBe(false);
		// Messages: system, assistant (tool_calls), tool result, assistant (text)
		expect(messages).toHaveLength(4);
		expect(messages[1].tool_calls).toHaveLength(1);
		expect(messages[2].role).toBe("tool");
		expect(messages[2].content).toContain("echoed: hi");
		expect(messages[3].content).toBe("Done.");
	});

	test("multi-round tool calls", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([
			toolCallResponse("c1", "echo_tool", '{"text":"first"}'),
			toolCallResponse("c2", "echo_tool", '{"text":"second"}'),
			textResponse("All done."),
		]);

		const result = await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
		});

		expect(result.lastResponseWasError).toBe(false);
		// system, asst+tc, tool, asst+tc, tool, asst(text)
		expect(messages).toHaveLength(6);
		expect(messages[5].content).toBe("All done.");
	});

	test("unknown tool returns error result", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([toolCallResponse("c1", "nonexistent", '{"x":1}'), textResponse("ok")]);

		const result = await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
		});

		expect(result.lastResponseWasError).toBe(false);
		expect(messages[2].role).toBe("tool");
		expect(messages[2].content).toContain("Unknown tool");
	});

	test("invalid JSON arguments returns error result", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([toolCallResponse("c1", "echo_tool", "not json"), textResponse("ok")]);

		const result = await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
		});

		expect(result.lastResponseWasError).toBe(false);
		expect(messages[2].role).toBe("tool");
		expect(messages[2].content).toContain("Invalid JSON");
	});

	test("LLM error returns lastResponseWasError true", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm: LlmClient = {
			async *stream() {
				yield { type: "text" as const, text: "" };
				throw new Error("API failure");
			},
		};

		const result = await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
		});

		expect(result.lastResponseWasError).toBe(true);
		expect(display.log.some((l) => l.includes("API failure"))).toBe(true);
	});

	test("re-enables input after completion", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([textResponse("Hi")]);

		await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
		});

		expect(display.log).toContain("input:true");
	});

	test("pushes tool call records for successful calls", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([toolCallResponse("c1", "echo_tool", '{"text":"hi"}'), textResponse("Done.")]);
		const toolCallRecords: ToolCallRecord[] = [];

		await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
			toolCallRecords,
		});

		expect(toolCallRecords).toHaveLength(1);
		expect(toolCallRecords[0]?.toolName).toBe("echo_tool");
		expect(toolCallRecords[0]?.success).toBe(true);
		expect(toolCallRecords[0]?.durationMs).toBeGreaterThanOrEqual(0);
		expect(toolCallRecords[0]?.timestamp).toBeTruthy();
	});

	test("pushes tool call records for unknown tool (failure)", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([toolCallResponse("c1", "nonexistent", '{"x":1}'), textResponse("ok")]);
		const toolCallRecords: ToolCallRecord[] = [];

		await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
			toolCallRecords,
		});

		expect(toolCallRecords).toHaveLength(1);
		expect(toolCallRecords[0]?.toolName).toBe("nonexistent");
		expect(toolCallRecords[0]?.success).toBe(false);
		expect(toolCallRecords[0]?.durationMs).toBe(0);
	});

	test("pushes tool call records for invalid JSON args (failure)", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([toolCallResponse("c1", "echo_tool", "not json"), textResponse("ok")]);
		const toolCallRecords: ToolCallRecord[] = [];

		await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
			toolCallRecords,
		});

		expect(toolCallRecords).toHaveLength(1);
		expect(toolCallRecords[0]?.toolName).toBe("echo_tool");
		expect(toolCallRecords[0]?.success).toBe(false);
		expect(toolCallRecords[0]?.durationMs).toBe(0);
	});

	test("does not push records when toolCallRecords is not provided", async () => {
		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([toolCallResponse("c1", "echo_tool", '{"text":"hi"}'), textResponse("Done.")]);

		// No toolCallRecords — should not throw
		const result = await runAgentLoop({
			...baseOpts,
			llm,
			registry: createTestRegistry(),
			messages,
			display,
		});

		expect(result.lastResponseWasError).toBe(false);
	});

	test("pushes tool call records for execution errors", async () => {
		const registry = createToolRegistry();
		registry.register({
			name: "failing_tool",
			description: "Always fails",
			parameters: { type: "object", properties: {}, required: [] },
			async execute() {
				throw new Error("boom");
			},
		});

		const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
		const display = createMockDisplay();
		const llm = createMockLlm([toolCallResponse("c1", "failing_tool", "{}"), textResponse("ok")]);
		const toolCallRecords: ToolCallRecord[] = [];

		await runAgentLoop({
			...baseOpts,
			llm,
			registry,
			messages,
			display,
			toolCallRecords,
		});

		expect(toolCallRecords).toHaveLength(1);
		expect(toolCallRecords[0]?.toolName).toBe("failing_tool");
		expect(toolCallRecords[0]?.success).toBe(false);
		expect(toolCallRecords[0]?.durationMs).toBeGreaterThanOrEqual(0);
	});
});
