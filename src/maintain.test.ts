import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BmoConfig, DEFAULT_CONFIG } from "./config.ts";
import type { ChatMessage, LlmClient, LlmEvent } from "./llm.ts";
import { runMaintenance } from "./maintain.ts";
import type { ResolvedPaths } from "./paths.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

const mockLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	flush: async () => {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runMaintenance", () => {
	let tempDir: string;
	let paths: ResolvedPaths;
	let config: BmoConfig;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "bmo-maintain-test-"));

		// Create required directories
		const dataDir = join(tempDir, "data");
		const bmoHome = join(tempDir, "bmo");
		const toolsDir = join(bmoHome, "tools");
		const skillsDir = join(bmoHome, "skills");
		const sessionsDir = join(dataDir, "sessions");
		const snapshotsDir = join(dataDir, "snapshots");
		const summariesDir = join(dataDir, "summaries");
		const configFile = join(dataDir, "config.json");
		const docsDir = join(bmoHome, "docs");

		await mkdir(dataDir, { recursive: true });
		await mkdir(bmoHome, { recursive: true });
		await mkdir(toolsDir, { recursive: true });
		await mkdir(skillsDir, { recursive: true });
		await mkdir(sessionsDir, { recursive: true });
		await mkdir(snapshotsDir, { recursive: true });
		await mkdir(summariesDir, { recursive: true });
		await mkdir(docsDir, { recursive: true });

		paths = {
			bmoHome,
			dataDir,
			toolsDir,
			skillsDir,
			sessionsDir,
			snapshotsDir,
			summariesDir,
			configFile,
			docsDir,
			bmoSource: null,
		};

		config = structuredClone(DEFAULT_CONFIG);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("runs agent loop with tiered models config", async () => {
		// This test verifies that runMaintenance correctly passes the tiered
		// models config to runAgentLoop (the bug that was fixed)

		// Mock LLM that immediately calls complete_maintenance
		const llm = createMockLlm([
			toolCallResponse("c1", "complete_maintenance", '{"summary":"Test maintenance completed"}'),
			textResponse("Maintenance finished."),
		]);

		const result = await runMaintenance({
			config,
			logger: mockLogger,
			sessionId: "maint-test-001",
			llm,
			paths,
		});

		// Should succeed (complete_maintenance was called)
		expect(result.success).toBe(true);
		expect(result.summary).toContain("Test maintenance completed");
		expect(result.cost).toBeGreaterThan(0);
	});

	test("returns failure when complete_maintenance not called", async () => {
		// LLM that just responds with text (doesn't call complete_maintenance)
		const llm = createMockLlm([textResponse("I'm not going to call complete_maintenance.")]);

		const result = await runMaintenance({
			config,
			logger: mockLogger,
			sessionId: "maint-test-002",
			llm,
			paths,
		});

		expect(result.success).toBe(false);
		expect(result.summary).toContain("no summary provided");
	});

	test("uses reasoning model for maintenance", async () => {
		// Track which model was used
		let usedModel: string | undefined;

		const llm: LlmClient = {
			async *stream(_messages: ChatMessage[], model: string): AsyncGenerator<LlmEvent> {
				usedModel = model;
				yield { type: "text", text: "test" };
				yield { type: "usage", promptTokens: 10, completionTokens: 5 };
				yield { type: "done", finishReason: "stop" };
			},
		};

		await runMaintenance({
			config,
			logger: mockLogger,
			sessionId: "maint-test-003",
			llm,
			paths,
		});

		// Should use the reasoning model (maintenance is a complex task)
		expect(usedModel).toBe(config.models.reasoning);
	});

	test("saves session data after completion", async () => {
		const llm = createMockLlm([
			toolCallResponse("c1", "complete_maintenance", '{"summary":"Session save test"}'),
			textResponse("Done."),
		]);

		await runMaintenance({
			config,
			logger: mockLogger,
			sessionId: "maint-test-004",
			llm,
			paths,
		});

		// Check that session file was created
		const { readdir } = await import("node:fs/promises");
		const sessions = await readdir(paths.sessionsDir);
		const sessionFiles = sessions.filter((f) => f.endsWith(".json") && f.includes("maint-test-004"));
		expect(sessionFiles.length).toBe(1);
	});
});
