import { describe, expect, test } from "bun:test";
import { assembleSystemPrompt } from "./prompt.ts";

describe("assembleSystemPrompt", () => {
	const prompt = assembleSystemPrompt("/opt/bmo", "/home/user/.local/share/bmo", "/home/user/project");

	test("includes identity line", () => {
		expect(prompt).toContain("You are bmo");
	});

	test("includes BMO_HOME from args", () => {
		expect(prompt).toContain("/opt/bmo");
	});

	test("includes data directory from args", () => {
		expect(prompt).toContain("/home/user/.local/share/bmo");
	});

	test("includes working directory from args", () => {
		expect(prompt).toContain("/home/user/project");
	});

	test("includes path prefixes section", () => {
		expect(prompt).toContain("Path prefixes");
		expect(prompt).toContain("bmo://");
	});

	test("includes model tiering section", () => {
		expect(prompt).toContain("Model tiering");
		expect(prompt).toContain("Reasoning tier");
		expect(prompt).toContain("Coding tier");
	});

	test("includes behavioral rules", () => {
		expect(prompt).toContain("Behavioral rules");
		expect(prompt).toContain("Prefer doing over suggesting");
	});

	test("does not include self-improvement content", () => {
		expect(prompt).not.toContain("Self‑improvement loop");
		expect(prompt).not.toContain("self‑improving");
		expect(prompt).not.toContain("reload_tools");
	});

	test("does not include tool format content", () => {
		expect(prompt).not.toContain("JS module tool format");
		expect(prompt).not.toContain("External tool descriptor");
		expect(prompt).not.toContain("Executable contract");
	});

	test("does not include skills content", () => {
		expect(prompt).not.toContain("Skills format");
		expect(prompt).not.toContain("load_skill");
	});

	test("does not include lifecycle content", () => {
		expect(prompt).not.toContain("Lifecycle");
		expect(prompt).not.toContain("IMPROVEMENTS.md");
		expect(prompt).not.toContain("OPPORTUNITIES.md");
	});
});
