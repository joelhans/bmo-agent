import { describe, expect, test } from "bun:test";
import {
	createSessionTracker,
	estimateTokens,
	estimateTokensForMessages,
	formatTokenCount,
	truncateToFit,
} from "./context.ts";
import type { ChatMessage } from "./llm.ts";

describe("estimateTokens", () => {
	test("empty message returns overhead only", () => {
		expect(estimateTokens({ role: "user", content: "" })).toBe(4);
	});

	test("short message", () => {
		// "hello" = 5 chars → ceil(5 / 3.5) + 4 = 2 + 4 = 6
		expect(estimateTokens({ role: "user", content: "hello" })).toBe(6);
	});

	test("longer message scales with content", () => {
		const content = "a".repeat(350);
		// 350 chars → ceil(350 / 3.5) + 4 = 100 + 4 = 104
		expect(estimateTokens({ role: "user", content })).toBe(104);
	});

	test("handles null content", () => {
		expect(estimateTokens({ role: "assistant", content: null })).toBe(4);
	});

	test("includes tool_calls in estimate", () => {
		const msg: ChatMessage = {
			role: "assistant",
			content: null,
			tool_calls: [{ id: "call_1", function: { name: "run_command", arguments: '{"command":"ls"}' } }],
		};
		const estimate = estimateTokens(msg);
		expect(estimate).toBeGreaterThan(4);
	});

	test("includes tool_call_id in estimate", () => {
		const msg: ChatMessage = { role: "tool", content: "output", tool_call_id: "call_1" };
		const withId = estimateTokens(msg);
		const without = estimateTokens({ role: "tool", content: "output" });
		expect(withId).toBeGreaterThan(without);
	});
});

describe("estimateTokensForMessages", () => {
	test("empty array returns conversation overhead", () => {
		expect(estimateTokensForMessages([])).toBe(3);
	});

	test("single message adds to conversation overhead", () => {
		const msgs: ChatMessage[] = [{ role: "system", content: "hello" }];
		// 3 + ceil(5/3.5) + 4 = 3 + 2 + 4 = 9
		expect(estimateTokensForMessages(msgs)).toBe(9);
	});
});

describe("truncateToFit", () => {
	test("does not truncate when within budget", () => {
		const msgs: ChatMessage[] = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "hello" },
		];
		const dropped = truncateToFit(msgs, 200_000, 4096);
		expect(dropped).toBe(0);
		expect(msgs).toHaveLength(3);
	});

	test("drops user+assistant pairs from front", () => {
		const msgs: ChatMessage[] = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "a".repeat(1000) },
			{ role: "assistant", content: "b".repeat(1000) },
			{ role: "user", content: "c".repeat(100) },
			{ role: "assistant", content: "d".repeat(100) },
		];
		// Tiny budget forces truncation
		const dropped = truncateToFit(msgs, 200, 50);
		expect(dropped).toBeGreaterThan(0);
		// System prompt always preserved
		expect(msgs[0].role).toBe("system");
	});

	test("never drops system prompt", () => {
		const msgs: ChatMessage[] = [{ role: "system", content: "a".repeat(5000) }];
		const dropped = truncateToFit(msgs, 100, 50);
		expect(dropped).toBe(0);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].role).toBe("system");
	});

	test("drops orphan assistant message at index 1", () => {
		const msgs: ChatMessage[] = [
			{ role: "system", content: "sys" },
			{ role: "assistant", content: "a".repeat(2000) },
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "yo" },
		];
		const dropped = truncateToFit(msgs, 200, 50);
		expect(dropped).toBeGreaterThan(0);
		expect(msgs[0].role).toBe("system");
	});

	test("drops tool-call group together", () => {
		const msgs: ChatMessage[] = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "a".repeat(500) },
			{
				role: "assistant",
				content: null,
				tool_calls: [{ id: "c1", function: { name: "run_command", arguments: `{"command":"${"x".repeat(500)}"}` } }],
			},
			{ role: "tool", content: "b".repeat(500), tool_call_id: "c1" },
			{ role: "assistant", content: "done" },
			{ role: "user", content: "ok" },
			{ role: "assistant", content: "bye" },
		];
		const dropped = truncateToFit(msgs, 300, 50);
		expect(dropped).toBeGreaterThan(0);
		// No orphan tool messages should remain
		expect(msgs[0].role).toBe("system");
		for (let i = 1; i < msgs.length; i++) {
			if (msgs[i].role === "tool") {
				// If a tool message exists, the preceding message must have tool_calls
				expect(msgs[i - 1].tool_calls).toBeDefined();
			}
		}
	});

	test("drops orphan tool message at index 1", () => {
		const msgs: ChatMessage[] = [
			{ role: "system", content: "sys" },
			{ role: "tool", content: "a".repeat(2000), tool_call_id: "c1" },
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "yo" },
		];
		const dropped = truncateToFit(msgs, 200, 50);
		expect(dropped).toBeGreaterThan(0);
		expect(msgs[0].role).toBe("system");
	});
});

describe("formatTokenCount", () => {
	test("small numbers shown as-is", () => {
		expect(formatTokenCount(800)).toBe("800");
	});

	test("thousands shown as k", () => {
		expect(formatTokenCount(1200)).toBe("1.2k");
	});

	test("millions shown as M", () => {
		expect(formatTokenCount(1_200_000)).toBe("1.2M");
	});
});

describe("createSessionTracker", () => {
	test("starts with zero stats", () => {
		const tracker = createSessionTracker();
		const stats = tracker.getStats();
		expect(stats.totalCost).toBe(0);
		expect(stats.totalPromptTokens).toBe(0);
		expect(stats.totalCompletionTokens).toBe(0);
	});

	test("accumulates usage across multiple calls", () => {
		const tracker = createSessionTracker();
		tracker.recordUsage("openai/gpt-4o", 1000, 500);
		tracker.recordUsage("openai/gpt-4o", 2000, 1000);
		const stats = tracker.getStats();
		expect(stats.totalPromptTokens).toBe(3000);
		expect(stats.totalCompletionTokens).toBe(1500);
	});

	test("calculates cost correctly for known model", () => {
		const tracker = createSessionTracker();
		// gpt-4o: $2.50/1M prompt, $10.00/1M completion
		tracker.recordUsage("openai/gpt-4o", 1_000_000, 1_000_000);
		const stats = tracker.getStats();
		expect(stats.totalCost).toBeCloseTo(12.5, 2);
	});

	test("uses conservative default pricing for unknown model", () => {
		const tracker = createSessionTracker();
		// Default: $15.00/1M prompt, $75.00/1M completion
		tracker.recordUsage("unknown/model", 1_000_000, 1_000_000);
		const stats = tracker.getStats();
		expect(stats.totalCost).toBeCloseTo(90.0, 2);
	});

	test("isOverBudget returns false when under limit", () => {
		const tracker = createSessionTracker();
		tracker.recordUsage("openai/gpt-4o-mini", 1000, 500);
		expect(tracker.isOverBudget(2.0)).toBe(false);
	});

	test("isOverBudget returns true when at or over limit", () => {
		const tracker = createSessionTracker();
		// Cost = (1M/1M)*2.50 + (500K/1M)*10.00 = 2.50 + 5.00 = 7.50
		tracker.recordUsage("openai/gpt-4o", 1_000_000, 500_000);
		expect(tracker.isOverBudget(2.0)).toBe(true);
	});

	test("formatStatus produces expected format", () => {
		const tracker = createSessionTracker();
		tracker.recordUsage("openai/gpt-4o", 1200, 300);
		const status = tracker.formatStatus("abc123", "openai/gpt-4o-mini", 200_000, 2.0);
		expect(status).toContain("bmo v0.1.0");
		expect(status).toContain("session: abc123");
		expect(status).toContain("openai/gpt-4o-mini");
		expect(status).toContain("tokens:");
		expect(status).toContain("$");
		expect(status).toContain("/$2.00");
	});

	test("lastPromptTokens reflects most recent call only", () => {
		const tracker = createSessionTracker();
		tracker.recordUsage("openai/gpt-4o", 500, 100);
		tracker.recordUsage("openai/gpt-4o", 1200, 300);
		const stats = tracker.getStats();
		expect(stats.lastPromptTokens).toBe(1200);
		expect(stats.lastCompletionTokens).toBe(300);
	});

	test("initializes with provided usage data", () => {
		const tracker = createSessionTracker({
			totalPromptTokens: 1000,
			totalCompletionTokens: 500,
			totalCost: 0.05,
		});
		const stats = tracker.getStats();
		expect(stats.totalPromptTokens).toBe(1000);
		expect(stats.totalCompletionTokens).toBe(500);
		expect(stats.totalCost).toBeCloseTo(0.05, 4);

		// Additional usage accumulates from the initial values
		tracker.recordUsage("openai/gpt-4o", 2000, 1000);
		const updated = tracker.getStats();
		expect(updated.totalPromptTokens).toBe(3000);
		expect(updated.totalCompletionTokens).toBe(1500);
		expect(updated.totalCost).toBeGreaterThan(0.05);
	});
});
