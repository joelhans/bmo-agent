import { describe, expect, test } from "bun:test";
import { selectTier } from "./tiering.ts";

describe("selectTier", () => {
	test("returns coding for simple messages", () => {
		expect(selectTier({ userMessage: "fix the typo in main.ts", lastResponseWasError: false })).toBe("coding");
		expect(selectTier({ userMessage: "add a button to the header", lastResponseWasError: false })).toBe("coding");
		expect(selectTier({ userMessage: "hello", lastResponseWasError: false })).toBe("coding");
	});

	test("returns reasoning for architect keyword", () => {
		expect(selectTier({ userMessage: "architect a new auth system", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for design keyword", () => {
		expect(selectTier({ userMessage: "design the database schema", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for debug keyword", () => {
		expect(selectTier({ userMessage: "debug the auth flow", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for refactor keyword", () => {
		expect(selectTier({ userMessage: "refactor the session module", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for why does keyword", () => {
		expect(selectTier({ userMessage: "why does this fail?", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for what's wrong keyword", () => {
		expect(selectTier({ userMessage: "what's wrong with this code?", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for explain why keyword", () => {
		expect(selectTier({ userMessage: "explain why the test fails", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for how should i structure keyword", () => {
		expect(selectTier({ userMessage: "how should i structure the API?", lastResponseWasError: false })).toBe(
			"reasoning",
		);
	});

	test("returns reasoning for review keyword", () => {
		expect(selectTier({ userMessage: "review this pull request", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning when lastResponseWasError is true", () => {
		expect(selectTier({ userMessage: "try again", lastResponseWasError: true })).toBe("reasoning");
	});

	test("returns reasoning for maintenance keyword", () => {
		expect(selectTier({ userMessage: "run maintenance check", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for introspect keyword", () => {
		expect(selectTier({ userMessage: "introspect on recent sessions", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for battery check keyword", () => {
		expect(selectTier({ userMessage: "do a battery check", lastResponseWasError: false })).toBe("reasoning");
	});

	test("returns reasoning for self-improvement keyword", () => {
		expect(selectTier({ userMessage: "self-improvement pass", lastResponseWasError: false })).toBe("reasoning");
	});

	test("case insensitive matching", () => {
		expect(selectTier({ userMessage: "Debug the auth flow", lastResponseWasError: false })).toBe("reasoning");
		expect(selectTier({ userMessage: "REFACTOR this module", lastResponseWasError: false })).toBe("reasoning");
	});
});
