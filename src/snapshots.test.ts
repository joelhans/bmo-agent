import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BmoConfig, DEFAULT_CONFIG } from "./config.ts";
import type { SkillsRegistry } from "./skills.ts";
import { createSnapshot, saveSnapshot } from "./snapshots.ts";
import type { ToolRegistry } from "./tools.ts";

function mockToolRegistry(names: string[], dynamicNames: string[]): ToolRegistry {
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
			return dynamicNames;
		},
		clearDynamic() {},
	};
}

function mockSkillsRegistry(skills: Array<{ name: string }>): SkillsRegistry {
	return {
		async scan() {},
		list() {
			return skills.map((s) => ({ name: s.name, description: "", triggers: [], filePath: "" }));
		},
		async loadContent() {
			return null;
		},
	};
}

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "bmo-snapshot-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("createSnapshot", () => {
	test("builds snapshot with correct fields", () => {
		const registry = mockToolRegistry(["run_command", "load_skill", "reload_tools", "file_stats"], ["file_stats"]);
		const skills = mockSkillsRegistry([{ name: "ripgrep_mastery" }]);
		const config = { ...DEFAULT_CONFIG };

		const snapshot = createSnapshot("20260201120000-test", registry, skills, config);

		expect(snapshot.sessionId).toBe("20260201120000-test");
		expect(snapshot.snapshotId).toBeTruthy();
		expect(snapshot.createdAt).toBeTruthy();
		expect(snapshot.toolInventory).toEqual(["run_command", "load_skill", "reload_tools", "file_stats"]);
		expect(snapshot.skillInventory).toEqual(["ripgrep_mastery"]);
		expect(snapshot.metrics.totalTools).toBe(4);
		expect(snapshot.metrics.builtinTools).toBe(3);
		expect(snapshot.metrics.dynamicTools).toBe(1);
		expect(snapshot.metrics.totalSkills).toBe(1);
	});

	test("sanitizes config — no apiKeyEnv values", () => {
		const registry = mockToolRegistry(["run_command"], []);
		const skills = mockSkillsRegistry([]);
		const config: BmoConfig = {
			...DEFAULT_CONFIG,
			providers: {
				openai: { baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
				anthropic: { baseUrl: "https://api.anthropic.com/v1", apiKeyEnv: "ANTHROPIC_API_KEY" },
			},
		};

		const snapshot = createSnapshot("20260201120000-test", registry, skills, config);

		const providers = snapshot.config.providers as Record<string, Record<string, unknown>>;
		expect(providers.openai.apiKeyEnv).toBeUndefined();
		expect(providers.anthropic.apiKeyEnv).toBeUndefined();
		expect(providers.openai.baseUrl).toBe("https://api.openai.com/v1");
	});
});

describe("saveSnapshot", () => {
	test("writes snapshot JSON to disk", async () => {
		const registry = mockToolRegistry(["run_command"], []);
		const skills = mockSkillsRegistry([]);
		const snapshot = createSnapshot("20260201120000-test", registry, skills, DEFAULT_CONFIG);

		await saveSnapshot(tempDir, snapshot);

		const filePath = join(tempDir, `${snapshot.snapshotId}.json`);
		const raw = await readFile(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		expect(parsed.snapshotId).toBe(snapshot.snapshotId);
		expect(parsed.sessionId).toBe("20260201120000-test");
	});
});
