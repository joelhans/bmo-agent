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

	test("includes self-improvement tool creation instructions", () => {
		expect(prompt).toContain("Write an .mjs module to BMO_HOME/tools/");
		expect(prompt).toContain("reload_tools");
	});

	test("instructs calling tools directly by name after reload", () => {
		expect(prompt).toContain("calling the tool DIRECTLY BY NAME");
		expect(prompt).toContain("NOT via run_command");
	});

	test("clarifies bmo:// is not a shell-resolvable path", () => {
		expect(prompt).toContain("shell does NOT understand bmo://");
		expect(prompt).toContain("always use the absolute BMO_HOME path");
	});

	test("includes self-improvement loop content", () => {
		expect(prompt).toContain("Self\u2011improvement loop");
		expect(prompt).toContain("self\u2011improving");
		expect(prompt).toContain("hypothesis");
	});

	test("includes lifecycle content", () => {
		expect(prompt).toContain("Lifecycle");
		expect(prompt).toContain("IMPROVEMENTS.md");
		expect(prompt).toContain("OPPORTUNITIES.md");
	});

	test("includes git commit policy", () => {
		expect(prompt).toContain("Git commit policy");
		expect(prompt).toContain("Never auto\u2011commit");
	});

	test("includes heuristics sections", () => {
		expect(prompt).toContain("Heuristics for building or changing tools");
		expect(prompt).toContain("Heuristics for writing skills");
	});

	test("includes user signal capture instructions", () => {
		expect(prompt).toContain("log_learning_event");
		expect(prompt).toContain("correction");
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

describe("assembleSystemPrompt with maintenanceNotice", () => {
	test("includes maintenance notice when provided", () => {
		const prompt = assembleSystemPrompt({
			...baseOpts,
			maintenanceNotice: "MAINTENANCE DUE: 5 sessions since last check.",
		});
		expect(prompt).toContain("MAINTENANCE DUE: 5 sessions since last check.");
	});

	test("does not include maintenance section when undefined", () => {
		const prompt = assembleSystemPrompt(baseOpts);
		expect(prompt).not.toContain("MAINTENANCE DUE");
	});
});

describe("assembleSystemPrompt with inventorySummary", () => {
	test("includes inventory summary when provided", () => {
		const prompt = assembleSystemPrompt({
			...baseOpts,
			inventorySummary:
				"Capability inventory (auto-generated)\nTools (3 built-in): run_command, load_skill, reload_tools",
		});
		expect(prompt).toContain("Capability inventory (auto-generated)");
		expect(prompt).toContain("Tools (3 built-in)");
	});

	test("does not include inventory section when undefined", () => {
		const prompt = assembleSystemPrompt(baseOpts);
		expect(prompt).not.toContain("Capability inventory");
	});
});

describe("assembleSystemPrompt with telemetrySummary", () => {
	test("includes telemetry summary when provided", () => {
		const prompt = assembleSystemPrompt({
			...baseOpts,
			telemetrySummary: "Tool telemetry\n  run_command: 342 calls, 95% ok, ~1200ms avg",
		});
		expect(prompt).toContain("Tool telemetry");
		expect(prompt).toContain("run_command: 342 calls, 95% ok");
	});

	test("does not include telemetry section when undefined", () => {
		const prompt = assembleSystemPrompt(baseOpts);
		expect(prompt).not.toContain("Tool telemetry");
	});
});

describe("assembleSystemPrompt with bmoSource", () => {
	test("includes BMO_SOURCE in environment when provided", () => {
		const prompt = assembleSystemPrompt({
			...baseOpts,
			bmoSource: "/home/user/src/bmo",
		});
		expect(prompt).toContain("BMO_SOURCE: /home/user/src/bmo");
	});

	test("does not include BMO_SOURCE environment line when undefined", () => {
		const prompt = assembleSystemPrompt(baseOpts);
		expect(prompt).not.toContain("- BMO_SOURCE:");
	});
});
