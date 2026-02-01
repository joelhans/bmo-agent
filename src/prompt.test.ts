import { describe, expect, test } from "bun:test";
import { assembleSystemPrompt } from "./prompt.ts";

const baseOpts = { bmoHome: "/opt/bmo", dataDir: "/home/user/.local/share/bmo", cwd: "/home/user/project" };

describe("assembleSystemPrompt", () => {
	const prompt = assembleSystemPrompt(baseOpts);

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

	test("includes built-in tools section", () => {
		expect(prompt).toContain("run_command");
		expect(prompt).toContain("load_skill");
		expect(prompt).toContain("reload_tools");
	});

	test("includes tool format section", () => {
		expect(prompt).toContain("JS module tool format");
		expect(prompt).toContain(".mjs");
	});

	test("includes skills format section", () => {
		expect(prompt).toContain("Skills format");
		expect(prompt).toContain("front-matter");
	});

	test("includes creating tools section", () => {
		expect(prompt).toContain("Creating tools");
	});

	test("does not include self-improvement loop content", () => {
		expect(prompt).not.toContain("Self\u2011improvement loop");
		expect(prompt).not.toContain("self\u2011improving");
		expect(prompt).not.toContain("hypothesis");
	});

	test("does not include lifecycle content", () => {
		expect(prompt).not.toContain("Lifecycle");
		expect(prompt).not.toContain("IMPROVEMENTS.md");
		expect(prompt).not.toContain("OPPORTUNITIES.md");
	});
});

describe("assembleSystemPrompt with skills", () => {
	test("includes skill list when skills provided", () => {
		const prompt = assembleSystemPrompt({
			...baseOpts,
			skills: [
				{ name: "ripgrep_mastery", description: "Best practices for ripgrep" },
				{ name: "git_tips", description: "Git workflow tips" },
			],
		});
		expect(prompt).toContain("Available skills (use load_skill to read full content):");
		expect(prompt).toContain("- ripgrep_mastery: Best practices for ripgrep");
		expect(prompt).toContain("- git_tips: Git workflow tips");
	});

	test("does not include skill section when no skills", () => {
		const prompt = assembleSystemPrompt({ ...baseOpts, skills: [] });
		expect(prompt).not.toContain("Available skills");
	});

	test("does not include skill section when skills omitted", () => {
		const prompt = assembleSystemPrompt(baseOpts);
		expect(prompt).not.toContain("Available skills");
	});
});

describe("assembleSystemPrompt with dynamic tools", () => {
	test("includes dynamic tool list when tools provided", () => {
		const prompt = assembleSystemPrompt({
			...baseOpts,
			dynamicTools: ["file_stats", "search_index"],
		});
		expect(prompt).toContain("Dynamic tools loaded:");
		expect(prompt).toContain("- file_stats");
		expect(prompt).toContain("- search_index");
	});

	test("does not include tool section when no dynamic tools", () => {
		const prompt = assembleSystemPrompt({ ...baseOpts, dynamicTools: [] });
		expect(prompt).not.toContain("Dynamic tools loaded");
	});

	test("does not include tool section when dynamicTools omitted", () => {
		const prompt = assembleSystemPrompt(baseOpts);
		expect(prompt).not.toContain("Dynamic tools loaded");
	});
});
