import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSkillsRegistry } from "./skills.ts";
import { createReloadToolsTool, formatLoadResult, initialLoad, loadDynamicTools } from "./tool-loader.ts";
import { createToolRegistry } from "./tools.ts";

// ---------------------------------------------------------------------------
// Temp directories with test .mjs tool modules
// ---------------------------------------------------------------------------

const tmpToolsDir = join(import.meta.dir, "..", ".test-tools-tmp");
const tmpSkillsDir = join(import.meta.dir, "..", ".test-skills-loader-tmp");

beforeAll(async () => {
	await mkdir(tmpToolsDir, { recursive: true });
	await mkdir(tmpSkillsDir, { recursive: true });

	// Valid tool module
	await writeFile(
		join(tmpToolsDir, "echo_test.mjs"),
		`
export const schema = {
	type: "object",
	properties: { text: { type: "string" } },
	required: ["text"],
};
export const description = "Echoes text back";
export async function run({ text }) {
	return { ok: true, result: "echoed: " + text };
}
`,
	);

	// Tool missing schema export
	await writeFile(
		join(tmpToolsDir, "no_schema.mjs"),
		`
export async function run() {
	return { ok: true, result: "no schema" };
}
`,
	);

	// Tool missing run export
	await writeFile(
		join(tmpToolsDir, "no_run.mjs"),
		`
export const schema = { type: "object", properties: {} };
`,
	);

	// Tool with unmet requires
	await writeFile(
		join(tmpToolsDir, "needs_dep.mjs"),
		`
export const schema = { type: "object", properties: {} };
export const requires = ["nonexistent_binary_xyz_999"];
export async function run() {
	return { ok: true, result: "ok" };
}
`,
	);

	// Tool that returns ok: false
	await writeFile(
		join(tmpToolsDir, "failing_tool.mjs"),
		`
export const schema = { type: "object", properties: {} };
export const description = "Always fails";
export async function run() {
	return { ok: false, error: "intentional failure" };
}
`,
	);

	// Not a .mjs file (should be skipped)
	await writeFile(join(tmpToolsDir, "readme.txt"), "Not a tool module.");

	// A skill for integration test
	await writeFile(
		join(tmpSkillsDir, "test_skill.md"),
		`---
name: test_skill
description: A test skill
triggers: [test]
---
# Test Skill Body`,
	);
});

afterAll(async () => {
	await rm(tmpToolsDir, { recursive: true, force: true });
	await rm(tmpSkillsDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// loadDynamicTools
// ---------------------------------------------------------------------------

describe("loadDynamicTools", () => {
	test("loads valid .mjs tool module", async () => {
		const registry = createToolRegistry();
		const result = await loadDynamicTools(tmpToolsDir, registry);
		expect(result.loaded).toContain("echo_test");
		expect(registry.get("echo_test")).toBeDefined();
		expect(registry.get("echo_test")?.description).toBe("Echoes text back");
	});

	test("reports error for module missing schema", async () => {
		const registry = createToolRegistry();
		const result = await loadDynamicTools(tmpToolsDir, registry);
		const error = result.errors.find((e) => e.name === "no_schema");
		expect(error).toBeDefined();
		expect(error?.error).toContain("schema");
	});

	test("reports error for module missing run", async () => {
		const registry = createToolRegistry();
		const result = await loadDynamicTools(tmpToolsDir, registry);
		const error = result.errors.find((e) => e.name === "no_run");
		expect(error).toBeDefined();
		expect(error?.error).toContain("run");
	});

	test("reports unavailable for module with unmet requires", async () => {
		const registry = createToolRegistry();
		const result = await loadDynamicTools(tmpToolsDir, registry);
		const unavail = result.unavailable.find((u) => u.name === "needs_dep");
		expect(unavail).toBeDefined();
		expect(unavail?.reason).toContain("nonexistent_binary_xyz_999");
	});

	test("skips non-.mjs files", async () => {
		const registry = createToolRegistry();
		const result = await loadDynamicTools(tmpToolsDir, registry);
		const allNames = [...result.loaded, ...result.errors.map((e) => e.name), ...result.unavailable.map((u) => u.name)];
		expect(allNames).not.toContain("readme");
	});

	test("handles missing tools directory gracefully", async () => {
		const registry = createToolRegistry();
		const result = await loadDynamicTools("/nonexistent/path", registry);
		expect(result.loaded).toEqual([]);
		expect(result.errors).toEqual([]);
		expect(result.unavailable).toEqual([]);
	});

	test("loaded tool execute wraps run() correctly for ok: true", async () => {
		const registry = createToolRegistry();
		await loadDynamicTools(tmpToolsDir, registry);
		const tool = registry.get("echo_test");
		expect(tool).toBeDefined();
		const result = await tool?.execute({ text: "hello" });
		expect(result.output).toBe("echoed: hello");
		expect(result.isError).toBeFalsy();
	});

	test("loaded tool execute wraps run() correctly for ok: false", async () => {
		const registry = createToolRegistry();
		await loadDynamicTools(tmpToolsDir, registry);
		const tool = registry.get("failing_tool");
		expect(tool).toBeDefined();
		const result = await tool?.execute({});
		expect(result.output).toBe("intentional failure");
		expect(result.isError).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// formatLoadResult
// ---------------------------------------------------------------------------

describe("formatLoadResult", () => {
	test("formats loaded tools", () => {
		const result = formatLoadResult({ loaded: ["echo_test", "math"], unavailable: [], errors: [] }, 2);
		expect(result).toContain("Loaded 2 tool(s): echo_test, math");
		expect(result).toContain("Skills indexed: 2");
	});

	test("formats unavailable tools with reasons", () => {
		const result = formatLoadResult(
			{ loaded: [], unavailable: [{ name: "foo", reason: "Missing: bar" }], errors: [] },
			0,
		);
		expect(result).toContain("Unavailable: foo — Missing: bar");
	});

	test("formats errors", () => {
		const result = formatLoadResult(
			{ loaded: [], unavailable: [], errors: [{ name: "bad", error: "import failed" }] },
			0,
		);
		expect(result).toContain("Error: bad — import failed");
	});

	test("shows no dynamic tools message when empty", () => {
		const result = formatLoadResult({ loaded: [], unavailable: [], errors: [] }, 0);
		expect(result).toContain("No dynamic tools found");
	});
});

// ---------------------------------------------------------------------------
// createReloadToolsTool
// ---------------------------------------------------------------------------

describe("createReloadToolsTool", () => {
	test("clears dynamic tools and reloads", async () => {
		const registry = createToolRegistry();
		const skillsRegistry = createSkillsRegistry(tmpSkillsDir);

		// Register a built-in
		registry.register(
			{
				name: "builtin_test",
				description: "test",
				parameters: { type: "object", properties: {} },
				async execute() {
					return { output: "ok" };
				},
			},
			{ builtin: true },
		);

		// Load dynamic tools
		await loadDynamicTools(tmpToolsDir, registry);
		expect(registry.get("echo_test")).toBeDefined();

		// Create reload tool and execute
		const reloadTool = createReloadToolsTool(tmpToolsDir, registry, skillsRegistry);
		const result = await reloadTool.execute({});

		// Built-in should survive
		expect(registry.get("builtin_test")).toBeDefined();
		// Dynamic tools should be reloaded
		expect(registry.get("echo_test")).toBeDefined();
		// Summary should include info
		expect(result.output).toContain("echo_test");
		expect(result.output).toContain("Skills indexed: 1");
	});
});

// ---------------------------------------------------------------------------
// initialLoad
// ---------------------------------------------------------------------------

describe("initialLoad", () => {
	test("scans skills and loads tools", async () => {
		const registry = createToolRegistry();
		const skillsRegistry = createSkillsRegistry(tmpSkillsDir);

		const result = await initialLoad(tmpToolsDir, registry, skillsRegistry);

		expect(result.loaded).toContain("echo_test");
		expect(skillsRegistry.list()).toHaveLength(1);
		expect(skillsRegistry.list()[0].name).toBe("test_skill");
	});
});
