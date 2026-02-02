import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LearningEvent } from "./session.ts";
import {
	formatTelemetryForPrompt,
	loadTelemetry,
	mergeLearnings,
	mergeToolCalls,
	saveTelemetry,
	type TelemetryStore,
	type ToolCallRecord,
} from "./telemetry.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyStore(): TelemetryStore {
	return { updatedAt: new Date().toISOString(), toolStats: {}, recentLearnings: [] };
}

function makeRecord(toolName: string, durationMs: number, success: boolean): ToolCallRecord {
	return { timestamp: new Date().toISOString(), toolName, durationMs, success };
}

function makeLearning(type: LearningEvent["type"], description: string): LearningEvent {
	return { timestamp: new Date().toISOString(), type, description, context: "test" };
}

// ---------------------------------------------------------------------------
// mergeToolCalls
// ---------------------------------------------------------------------------

describe("mergeToolCalls", () => {
	test("adds stats for a new tool", () => {
		const store = emptyStore();
		mergeToolCalls(store, [makeRecord("run_command", 100, true)]);

		expect(store.toolStats.run_command).toBeDefined();
		expect(store.toolStats.run_command?.totalCalls).toBe(1);
		expect(store.toolStats.run_command?.successCount).toBe(1);
		expect(store.toolStats.run_command?.failureCount).toBe(0);
		expect(store.toolStats.run_command?.avgDurationMs).toBe(100);
	});

	test("accumulates stats across multiple records", () => {
		const store = emptyStore();
		mergeToolCalls(store, [
			makeRecord("run_command", 100, true),
			makeRecord("run_command", 200, true),
			makeRecord("run_command", 300, false),
		]);

		const stats = store.toolStats.run_command;
		expect(stats).toBeDefined();
		expect(stats?.totalCalls).toBe(3);
		expect(stats?.successCount).toBe(2);
		expect(stats?.failureCount).toBe(1);
		expect(stats?.totalDurationMs).toBe(600);
		expect(stats?.avgDurationMs).toBe(200);
	});

	test("tracks multiple tools independently", () => {
		const store = emptyStore();
		mergeToolCalls(store, [makeRecord("run_command", 100, true), makeRecord("echo_tool", 50, true)]);

		expect(Object.keys(store.toolStats)).toHaveLength(2);
		expect(store.toolStats.run_command?.totalCalls).toBe(1);
		expect(store.toolStats.echo_tool?.totalCalls).toBe(1);
	});

	test("updates lastUsed to most recent timestamp", () => {
		const store = emptyStore();
		const early: ToolCallRecord = { timestamp: "2025-01-01T00:00:00Z", toolName: "t", durationMs: 10, success: true };
		const late: ToolCallRecord = { timestamp: "2025-06-01T00:00:00Z", toolName: "t", durationMs: 10, success: true };
		mergeToolCalls(store, [late, early]);

		expect(store.toolStats.t?.lastUsed).toBe("2025-06-01T00:00:00Z");
	});

	test("handles empty records array", () => {
		const store = emptyStore();
		mergeToolCalls(store, []);
		expect(Object.keys(store.toolStats)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// mergeLearnings
// ---------------------------------------------------------------------------

describe("mergeLearnings", () => {
	test("appends learning events with session ID", () => {
		const store = emptyStore();
		mergeLearnings(store, [makeLearning("correction", "tabs not spaces")], "session-1");

		expect(store.recentLearnings).toHaveLength(1);
		expect(store.recentLearnings[0]?.sessionId).toBe("session-1");
		expect(store.recentLearnings[0]?.description).toBe("tabs not spaces");
	});

	test("caps at 100 entries", () => {
		const store = emptyStore();
		// Add 98 existing
		for (let i = 0; i < 98; i++) {
			store.recentLearnings.push({ ...makeLearning("pattern", `old-${i}`), sessionId: "old" });
		}

		// Add 5 new — should cap at 100
		const newEvents = Array.from({ length: 5 }, (_, i) => makeLearning("correction", `new-${i}`));
		mergeLearnings(store, newEvents, "session-2");

		expect(store.recentLearnings).toHaveLength(100);
		// The oldest entries should have been trimmed
		expect(store.recentLearnings[0]?.description).toBe("old-3");
		expect(store.recentLearnings[99]?.description).toBe("new-4");
	});

	test("handles empty events array", () => {
		const store = emptyStore();
		mergeLearnings(store, [], "session-1");
		expect(store.recentLearnings).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// formatTelemetryForPrompt
// ---------------------------------------------------------------------------

describe("formatTelemetryForPrompt", () => {
	test("returns empty string for empty store", () => {
		const store = emptyStore();
		expect(formatTelemetryForPrompt(store)).toBe("");
	});

	test("formats tool stats in compact mode", () => {
		const store = emptyStore();
		mergeToolCalls(store, [
			makeRecord("run_command", 1200, true),
			makeRecord("run_command", 1000, true),
			makeRecord("run_command", 900, false),
		]);

		const output = formatTelemetryForPrompt(store);
		expect(output).toContain("Tool telemetry");
		expect(output).toContain("run_command: 3 calls, 67% ok");
	});

	test("limits to top 5 tools in compact mode", () => {
		const store = emptyStore();
		for (let i = 0; i < 7; i++) {
			mergeToolCalls(store, [makeRecord(`tool_${i}`, 100, true)]);
		}

		const output = formatTelemetryForPrompt(store);
		expect(output).toContain("... and 2 more tools");
	});

	test("shows all tools in verbose mode", () => {
		const store = emptyStore();
		for (let i = 0; i < 7; i++) {
			mergeToolCalls(store, [makeRecord(`tool_${i}`, 100, true)]);
		}

		const output = formatTelemetryForPrompt(store, true);
		expect(output).not.toContain("... and");
		expect(output).toContain("tool_6");
	});

	test("includes learning summary in compact mode (last 3)", () => {
		const store = emptyStore();
		mergeLearnings(
			store,
			[
				makeLearning("correction", "first"),
				makeLearning("preference", "second"),
				makeLearning("pattern", "third"),
				makeLearning("correction", "fourth"),
			],
			"s1",
		);

		const output = formatTelemetryForPrompt(store);
		expect(output).toContain("Recent learnings: 4 total");
		// Should show last 3
		expect(output).toContain("[preference] second");
		expect(output).toContain("[pattern] third");
		expect(output).toContain("[correction] fourth");
		// Should not show first
		expect(output).not.toContain("[correction] first");
	});

	test("shows more learnings in verbose mode", () => {
		const store = emptyStore();
		const events = Array.from({ length: 10 }, (_, i) => makeLearning("pattern", `learning-${i}`));
		mergeLearnings(store, events, "s1");

		const output = formatTelemetryForPrompt(store, true);
		// verbose shows last 20 — all 10 should be present
		expect(output).toContain("[pattern] learning-0");
		expect(output).toContain("[pattern] learning-9");
	});

	test("includes type breakdown in learnings summary", () => {
		const store = emptyStore();
		mergeLearnings(
			store,
			[makeLearning("correction", "c1"), makeLearning("correction", "c2"), makeLearning("preference", "p1")],
			"s1",
		);

		const output = formatTelemetryForPrompt(store);
		expect(output).toContain("2 corrections");
		expect(output).toContain("1 preferences");
	});
});

// ---------------------------------------------------------------------------
// loadTelemetry / saveTelemetry round-trip
// ---------------------------------------------------------------------------

describe("loadTelemetry / saveTelemetry", () => {
	let tmpDir: string;

	beforeAll(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "bmo-telemetry-test-"));
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns empty store when file does not exist", async () => {
		const store = await loadTelemetry(tmpDir);
		expect(store.toolStats).toEqual({});
		expect(store.recentLearnings).toEqual([]);
	});

	test("round-trips store through save and load", async () => {
		const store = emptyStore();
		mergeToolCalls(store, [makeRecord("run_command", 500, true), makeRecord("run_command", 300, false)]);
		mergeLearnings(store, [makeLearning("correction", "use tabs")], "session-1");

		await saveTelemetry(tmpDir, store);
		const loaded = await loadTelemetry(tmpDir);

		expect(loaded.toolStats.run_command?.totalCalls).toBe(2);
		expect(loaded.toolStats.run_command?.successCount).toBe(1);
		expect(loaded.toolStats.run_command?.failureCount).toBe(1);
		expect(loaded.recentLearnings).toHaveLength(1);
		expect(loaded.recentLearnings[0]?.description).toBe("use tabs");
		expect(loaded.recentLearnings[0]?.sessionId).toBe("session-1");
	});
});
