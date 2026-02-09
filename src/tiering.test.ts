import { describe, expect, test } from "bun:test";
import { selectInitialTier, selectIterationTier } from "./tiering.ts";

describe("selectInitialTier", () => {
	// Coding tier for simple tasks
	test("returns coding for simple read commands", () => {
		expect(selectInitialTier({ userMessage: "read package.json", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "cat main.ts", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "show me the config", lastResponseWasError: false })).toBe("coding");
	});

	test("returns coding for list/ls commands", () => {
		expect(selectInitialTier({ userMessage: "list the files", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "ls src/", lastResponseWasError: false })).toBe("coding");
	});

	test("returns coding for simple file operations", () => {
		expect(selectInitialTier({ userMessage: "create a file called test.txt", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "delete the old backup", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "rename foo to bar", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "copy config.json to backup/", lastResponseWasError: false })).toBe("coding");
	});

	test("returns coding for run/execute commands", () => {
		expect(selectInitialTier({ userMessage: "run the tests", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "execute npm install", lastResponseWasError: false })).toBe("coding");
	});

	test("returns coding for short simple messages", () => {
		expect(selectInitialTier({ userMessage: "hello", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "thanks", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "ok", lastResponseWasError: false })).toBe("coding");
	});

	test("returns coding for what's in / contents of", () => {
		expect(selectInitialTier({ userMessage: "what is in the src folder?", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "what's in package.json", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "contents of README.md", lastResponseWasError: false })).toBe("coding");
	});

	// Reasoning tier for complex tasks
	test("returns reasoning for architect keyword", () => {
		expect(selectInitialTier({ userMessage: "architect a new auth system", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for design keyword", () => {
		expect(selectInitialTier({ userMessage: "design the database schema", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for debug keyword", () => {
		expect(selectInitialTier({ userMessage: "debug the auth flow", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for refactor keyword", () => {
		expect(selectInitialTier({ userMessage: "refactor the session module", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for why questions", () => {
		expect(selectInitialTier({ userMessage: "why does this fail?", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "why is the test slow?", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "why are there errors?", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "why did it break?", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for what's wrong keyword", () => {
		expect(selectInitialTier({ userMessage: "what's wrong with this code?", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for explain keywords", () => {
		expect(selectInitialTier({ userMessage: "explain why the test fails", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "explain how the auth works", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for how should i structure keyword", () => {
		expect(selectInitialTier({ userMessage: "how should i structure the API?", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for review keyword", () => {
		expect(selectInitialTier({ userMessage: "review this pull request", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for analyze/compare/trade-off keywords", () => {
		expect(selectInitialTier({ userMessage: "analyze this code", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "compare these approaches", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "what are the trade-offs?", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning when lastResponseWasError is true", () => {
		expect(selectInitialTier({ userMessage: "try again", lastResponseWasError: true })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "read file.txt", lastResponseWasError: true })).toBe("reasoning");
	});

	test("returns reasoning for maintenance keyword", () => {
		expect(selectInitialTier({ userMessage: "run maintenance check", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for introspect keyword", () => {
		expect(selectInitialTier({ userMessage: "introspect on recent sessions", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for battery check keyword", () => {
		expect(selectInitialTier({ userMessage: "do a battery check", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for self-improvement keyword", () => {
		expect(selectInitialTier({ userMessage: "self-improvement pass", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for long messages without coding keywords", () => {
		const longMessage = "I have a complex situation with the authentication flow that involves multiple services and I'm not sure about the best approach to handle the token refresh logic";
		expect(selectInitialTier({ userMessage: longMessage, lastResponseWasError: false })).toBe("reasoning");
	});

	test("case insensitive matching", () => {
		expect(selectInitialTier({ userMessage: "Investigate the auth flow", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "REFACTOR this module", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "READ the config file", lastResponseWasError: false })).toBe("coding");
		expect(selectInitialTier({ userMessage: "LIST all files", lastResponseWasError: false })).toBe("coding");
	});

	test("reasoning keywords take priority over coding keywords", () => {
		// "why does" should trigger reasoning even if "read" is present
		expect(selectInitialTier({ userMessage: "why does read fail?", lastResponseWasError: false })).toBe("reasoning");
		expect(selectInitialTier({ userMessage: "debug why the list command fails", lastResponseWasError: false })).toBe("reasoning");
	});
});

describe("selectIterationTier", () => {
	// Note: selectIterationTier is now only called for iteration > 0
	// iteration 0 uses defaultTier directly in the agent loop

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

	test("returns coding for safe_read (in SIMPLE_FILE_TOOLS)", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "safe_read", success: true }],
				lastAssistantText: "Here's the file content.",
			}),
		).toBe("coding");
	});

	test("returns coding for search_code (in SIMPLE_FILE_TOOLS)", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "search_code", success: true }],
				lastAssistantText: "Found the matches.",
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

	test("returns reasoning when assistant text is long (over 500 chars)", () => {
		const longText = "A".repeat(550);
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: true }],
				lastAssistantText: longText,
			}),
		).toBe("reasoning");
	});

	test("returns coding when assistant text is under 500 chars", () => {
		const mediumText = "A".repeat(400);
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: true }],
				lastAssistantText: mediumText,
			}),
		).toBe("coding");
	});

	test("returns coding for up to 4 simple tool calls", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [
					{ name: "run_command", success: true },
					{ name: "safe_read", success: true },
					{ name: "search_code", success: true },
					{ name: "list_files_filtered", success: true },
				],
				lastAssistantText: "Done with all four.",
			}),
		).toBe("coding");
	});

	test("returns reasoning for more than 4 tool calls", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [
					{ name: "run_command", success: true },
					{ name: "safe_read", success: true },
					{ name: "search_code", success: true },
					{ name: "list_files_filtered", success: true },
					{ name: "smart_grep", success: true },
				],
				lastAssistantText: "Done with all five.",
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

	test("returns reasoning for non-simple tools", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "some_complex_tool", success: true }],
				lastAssistantText: "Done.",
			}),
		).toBe("reasoning");
	});

	test("planning indicators are case-insensitive", () => {
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [{ name: "run_command", success: true }],
				lastAssistantText: "First, I'll update the file.",
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

	test("returns coding for empty tool calls array (no tools = simple continuation)", () => {
		// Empty array means no tool calls were made, which indicates a simple text response
		// that doesn't need reasoning escalation
		expect(
			selectIterationTier({
				iteration: 1,
				hadError: false,
				lastToolCalls: [],
				lastAssistantText: "Done.",
			}),
		).toBe("coding");
	});
});
