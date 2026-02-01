import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CapabilityInventory,
	formatInventoryForPrompt,
	generateInventory,
	loadInventory,
	saveInventory,
} from "./inventory.ts";
import type { SkillsRegistry } from "./skills.ts";
import type { ToolRegistry } from "./tools.ts";

// ---------------------------------------------------------------------------
// Mock registries
// ---------------------------------------------------------------------------

function mockToolRegistry(names: string[]): ToolRegistry {
	return {
		register() {},
		get() {
			return undefined;
		},
		getSchemas() {
			return [];
		},
		listNames() {
			return names;
		},
		listDynamicNames() {
			return names.filter((n) => !["run_command", "load_skill", "reload_tools"].includes(n));
		},
		clearDynamic() {},
	};
}

function mockSkillsRegistry(skills: Array<{ name: string; description: string }>): SkillsRegistry {
	return {
		async scan() {},
		list() {
			return skills.map((s) => ({ ...s, triggers: [], filePath: "" }));
		},
		async loadContent() {
			return null;
		},
	};
}

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "bmo-inventory-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("generateInventory", () => {
	test("builds inventory from registries", async () => {
		const registry = mockToolRegistry(["run_command", "load_skill", "reload_tools", "file_stats"]);
		const skills = mockSkillsRegistry([{ name: "ripgrep_mastery", description: "rg tips" }]);

		const inv = await generateInventory(registry, skills, tempDir);

		expect(inv.tools).toEqual(["run_command", "load_skill", "reload_tools", "file_stats"]);
		expect(inv.skills).toEqual(["ripgrep_mastery"]);
		expect(inv.knownLimitations.length).toBeGreaterThan(0);
		expect(inv.generatedAt).toBeTruthy();
	});

	test("handles missing IMPROVEMENTS.md gracefully", async () => {
		const registry = mockToolRegistry(["run_command"]);
		const skills = mockSkillsRegistry([]);

		const inv = await generateInventory(registry, skills, tempDir);

		expect(inv.recentChanges).toEqual([]);
	});

	test("parses recent changes from IMPROVEMENTS.md", async () => {
		await mkdir(join(tempDir, "docs"), { recursive: true });
		await writeFile(
			join(tempDir, "docs", "IMPROVEMENTS.md"),
			`# Improvements

## Added search_code tool (2026-02-01)
Rationale: faster code search.

## Added file_stats tool (2026-02-01)
Rationale: quick file stats.
`,
			"utf-8",
		);

		const registry = mockToolRegistry(["run_command"]);
		const skills = mockSkillsRegistry([]);

		const inv = await generateInventory(registry, skills, tempDir);

		expect(inv.recentChanges).toHaveLength(2);
		expect(inv.recentChanges[0]).toContain("search_code");
		expect(inv.recentChanges[1]).toContain("file_stats");
	});
});

describe("formatInventoryForPrompt", () => {
	test("formats a full inventory", () => {
		const inv: CapabilityInventory = {
			generatedAt: "2026-02-01T12:00:00.000Z",
			tools: ["run_command", "load_skill", "reload_tools", "file_stats"],
			skills: ["ripgrep_mastery", "git_tips"],
			knownLimitations: ["sandbox filesystem enforcement is advisory"],
			recentChanges: ["+file_stats tool (2026-02-01)"],
		};

		const output = formatInventoryForPrompt(inv);

		expect(output).toContain("Capability inventory (auto-generated)");
		expect(output).toContain("Tools (3 built-in, 1 dynamic)");
		expect(output).toContain("Skills (2): ripgrep_mastery, git_tips");
		expect(output).toContain("Known limitations: sandbox filesystem enforcement is advisory");
		expect(output).toContain("Recent changes: +file_stats tool (2026-02-01)");
	});

	test("formats inventory with no dynamic tools", () => {
		const inv: CapabilityInventory = {
			generatedAt: "2026-02-01T12:00:00.000Z",
			tools: ["run_command", "load_skill", "reload_tools"],
			skills: [],
			knownLimitations: [],
			recentChanges: [],
		};

		const output = formatInventoryForPrompt(inv);

		expect(output).toContain("Tools (3 built-in):");
		expect(output).not.toContain("dynamic");
		expect(output).toContain("Skills: none");
		expect(output).not.toContain("Recent changes");
	});
});

describe("saveInventory / loadInventory", () => {
	test("round-trips inventory to disk", async () => {
		const inv: CapabilityInventory = {
			generatedAt: "2026-02-01T12:00:00.000Z",
			tools: ["run_command", "file_stats"],
			skills: ["ripgrep_mastery"],
			knownLimitations: ["sandbox filesystem enforcement is advisory"],
			recentChanges: ["+file_stats"],
		};

		await saveInventory(tempDir, inv);
		const loaded = await loadInventory(tempDir);

		expect(loaded).not.toBeNull();
		expect(loaded?.tools).toEqual(inv.tools);
		expect(loaded?.skills).toEqual(inv.skills);
		expect(loaded?.knownLimitations).toEqual(inv.knownLimitations);
		expect(loaded?.recentChanges).toEqual(inv.recentChanges);
	});

	test("loadInventory returns null when file missing", async () => {
		const loaded = await loadInventory(tempDir);
		expect(loaded).toBeNull();
	});
});
