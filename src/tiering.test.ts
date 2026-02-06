import { describe, expect, test } from "bun:test";
import { selectInitialTier, selectIterationTier } from "./tiering.ts";

describe("selectInitialTier", () => {
	test("returns reasoning for simple messages (new default)", () => {
		expect(selectInitialTier({ userMessage: "fix the typo in main.ts", lastResponseWasError: false })).toBe(
			"reasoning",
		);
		expect(selectInitialTier({ userMessage: "add a button to the header", lastResponseWasError: false })).toBe(
			"reasoning",
		);
		expect(selectInitialTier({ userMessage: "hello", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for architect keyword", () => {
		expect(selectInitialTier({ userMessage: "architect a new auth system", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning for design keyword", () => {
		expect(selectInitialTier({ userMessage: "design the database schema", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning for debug keyword", () => {
		expect(selectInitialTier({ userMessage: "debug the auth flow", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for refactor keyword", () => {
		expect(selectInitialTier({ userMessage: "refactor the session module", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning for why does keyword", () => {
		expect(selectInitialTier({ userMessage: "why does this fail?", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for what's wrong keyword", () => {
		expect(selectInitialTier({ userMessage: "what's wrong with this code?", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning for explain why keyword", () => {
		expect(selectInitialTier({ userMessage: "explain why the test fails", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning for how should i structure keyword", () => {
		expect(selectInitialTier({ userMessage: "how should i structure the API?", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning for review keyword", () => {
		expect(selectInitialTier({ userMessage: "review this pull request", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning when lastResponseWasError is true", () => {
		expect(selectInitialTier({ userMessage: "try again", lastResponseWasError: true })).toBe("reasoning");
	});

	test("returns reasoning for maintenance keyword", () => {
		expect(selectInitialTier({ userMessage: "run maintenance check", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for introspect keyword", () => {
		expect(selectInitialTier({ userMessage: "introspect on recent sessions", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning for battery check keyword", () => {
		expect(selectInitialTier({ userMessage: "do a battery check", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for self-improvement keyword", () => {
		expect(selectInitialTier({ userMessage: "self-improvement pass", lastResponseWasError: false })).toBe("reasoning");
	});

	test("case insensitive matching", () => {
		expect(selectInitialTier({ userMessage: "Debug the auth flow", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "REFACTOR this module", lastResponseWasError: false })).toBe("reasoning");
	});
});

describe("selectIterationTier", () => {
	test("returns reasoning for iteration 0 (initial planning)", () => {
		expect(selectIterationTier({ iteration: 0, hadError: false })).toBe("reasoning");
	});

	test("returns reasoning after errors", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: true,
				lastToolCalls: [{ name: "run_command", success: false }],
				lastAssistantText: "Let me try that",
			}),
		).toBe("reasoning");
	});

	test("returns reasoning when no context available", () => {
		expect(selectIterationTier({ iteration: 1, hadError: false })).toBe("reasoning");
		expect(selectIterationTier({ iteration: 1, hadError: false, lastToolCalls: [] })).toBe("reasoning");
	});

	test("returns coding after simple successful file ops with short text", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: true }],
				lastAssistantText: "Done.",
			}),
		).toBe("coding");
	});

	test("returns reasoning when assistant text contains planning language", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: true }],
				lastAssistantText: "First, I need to check the file structure, then I'll update the config.",
			}),
		).toBe("reasoning");
	});

	test("returns reasoning when assistant text is long (complex response)", () => {
		const longText = "A".repeat(350);
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: true }],
				lastAssistantText: longText,
			}),
		).toBe("reasoning");
	});

	test("returns reasoning for multi-tool calls", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [
					{ name: "run_command", success: true },
					{ name: "run_command", success: true },
					{ name: "safe_read", success: true },
				],
				lastAssistantText: "Done with all three.",
			}),
		).toBe("reasoning");
	});

	test("returns reasoning when tool call failed", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: false }],
				lastAssistantText: "That failed.",
			}),
		).toBe("reasoning");
	});

	test("planning indicators are case-insensitive", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: true }],
				lastAssistantText: "NEXT, I'll update the file.",
			}),
		).toBe("reasoning");

		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: true }],
				lastAssistantText: "Let Me check that.",
			}),
		).toBe("reasoning");
	});
});
