import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createLoadSkillTool, createSkillsRegistry, parseFrontMatter } from "./skills.ts";

// ---------------------------------------------------------------------------
// parseFrontMatter
// ---------------------------------------------------------------------------

describe("parseFrontMatter", () => {
	test("parses valid front-matter with all fields", () => {
		const content = `---
name: ripgrep_mastery
description: Best practices for using ripgrep
triggers: [search, grep, rg]
---
# Body content here

Some instructions.`;

		const result = parseFrontMatter(content);
		expect(result).not.toBeNull();
		expect(result?.meta.name).toBe("ripgrep_mastery");
		expect(result?.meta.description).toBe("Best practices for using ripgrep");
		expect(result?.meta.triggers).toEqual(["search", "grep", "rg"]);
		expect(result?.body).toContain("# Body content here");
	});

	test("returns null when no front-matter delimiters", () => {
		expect(parseFrontMatter("# Just markdown")).toBeNull();
	});

	test("returns null when name is missing", () => {
		const content = `---
description: No name field
---
Body`;
		expect(parseFrontMatter(content)).toBeNull();
	});

	test("handles empty triggers array", () => {
		const content = `---
name: test_skill
description: A test
triggers: []
---
Body`;
		const result = parseFrontMatter(content);
		expect(result).not.toBeNull();
		expect(result?.meta.triggers).toEqual([]);
	});

	test("handles missing optional fields", () => {
		const content = `---
name: minimal
---
Body`;
		const result = parseFrontMatter(content);
		expect(result).not.toBeNull();
		expect(result?.meta.description).toBe("");
		expect(result?.meta.triggers).toEqual([]);
	});

	test("handles description with colons", () => {
		const content = `---
name: test
description: Use rg: it is fast
---
Body`;
		const result = parseFrontMatter(content);
		expect(result?.meta.description).toBe("Use rg: it is fast");
	});

	test("skips comment lines in front-matter", () => {
		const content = `---
name: test
# this is a comment
description: A test
---
Body`;
		const result = parseFrontMatter(content);
		expect(result?.meta.name).toBe("test");
		expect(result?.meta.description).toBe("A test");
	});
});

// ---------------------------------------------------------------------------
// SkillsRegistry (filesystem-based tests)
// ---------------------------------------------------------------------------

const tmpDir = join(import.meta.dir, "..", ".test-skills-tmp");

beforeAll(async () => {
	await mkdir(tmpDir, { recursive: true });
	await writeFile(
		join(tmpDir, "ripgrep.md"),
		`---
name: ripgrep_mastery
description: Best practices for ripgrep
triggers: [search, grep]
---
# Ripgrep Mastery

Use rg effectively.`,
	);
	await writeFile(
		join(tmpDir, "git_tips.md"),
		`---
name: git_tips
description: Git workflow tips
triggers: [git, version control]
---
# Git Tips

Commit often.`,
	);
	await writeFile(join(tmpDir, "no_frontmatter.md"), "# No front-matter\nJust markdown.");
	await writeFile(join(tmpDir, "not_markdown.txt"), "Not a markdown file.");
});

afterAll(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("createSkillsRegistry", () => {
	test("scan indexes .md files with valid front-matter", async () => {
		const registry = createSkillsRegistry(tmpDir);
		await registry.scan();
		const skills = registry.list();
		expect(skills).toHaveLength(2);
		const names = skills.map((s) => s.name).sort();
		expect(names).toEqual(["git_tips", "ripgrep_mastery"]);
	});

	test("scan skips files without valid front-matter", async () => {
		const registry = createSkillsRegistry(tmpDir);
		await registry.scan();
		const names = registry.list().map((s) => s.name);
		expect(names).not.toContain("no_frontmatter");
	});

	test("scan skips non-.md files", async () => {
		const registry = createSkillsRegistry(tmpDir);
		await registry.scan();
		const names = registry.list().map((s) => s.name);
		expect(names).not.toContain("not_markdown");
	});

	test("scan handles missing directory gracefully", async () => {
		const registry = createSkillsRegistry("/nonexistent/path");
		await registry.scan();
		expect(registry.list()).toEqual([]);
	});

	test("loadContent returns full file content", async () => {
		const registry = createSkillsRegistry(tmpDir);
		await registry.scan();
		const content = await registry.loadContent("ripgrep_mastery");
		expect(content).not.toBeNull();
		expect(content).toContain("# Ripgrep Mastery");
		expect(content).toContain("Use rg effectively.");
	});

	test("loadContent returns null for unknown skill name", async () => {
		const registry = createSkillsRegistry(tmpDir);
		await registry.scan();
		const content = await registry.loadContent("nonexistent");
		expect(content).toBeNull();
	});

	test("scan clears previous entries on re-scan", async () => {
		const registry = createSkillsRegistry(tmpDir);
		await registry.scan();
		expect(registry.list()).toHaveLength(2);
		// Scan again — same result (no duplicates)
		await registry.scan();
		expect(registry.list()).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// createLoadSkillTool
// ---------------------------------------------------------------------------

describe("createLoadSkillTool", () => {
	test("returns content for valid skill name", async () => {
		const registry = createSkillsRegistry(tmpDir);
		await registry.scan();
		const tool = createLoadSkillTool(registry);
		const result = await tool.execute({ name: "ripgrep_mastery" });
		expect(result.output).toContain("# Ripgrep Mastery");
		expect(result.isError).toBeFalsy();
	});

	test("returns error with skill list for invalid name", async () => {
		const registry = createSkillsRegistry(tmpDir);
		await registry.scan();
		const tool = createLoadSkillTool(registry);
		const result = await tool.execute({ name: "nonexistent" });
		expect(result.isError).toBe(true);
		expect(result.output).toContain('Skill "nonexistent" not found');
		expect(result.output).toContain("ripgrep_mastery");
		expect(result.output).toContain("git_tips");
	});

	test("returns error noting no skills when registry is empty", async () => {
		const registry = createSkillsRegistry("/nonexistent");
		await registry.scan();
		const tool = createLoadSkillTool(registry);
		const result = await tool.execute({ name: "anything" });
		expect(result.isError).toBe(true);
		expect(result.output).toContain("No skills are currently available");
	});
});

test("calls onSkillLoaded callback when skill is found", async () => {
	const registry = createSkillsRegistry(tmpDir);
	await registry.scan();
	const loadedSkills: string[] = [];
	const tool = createLoadSkillTool(registry, {
		onSkillLoaded: (name) => loadedSkills.push(name),
	});
	await tool.execute({ name: "ripgrep_mastery" });
	expect(loadedSkills).toEqual(["ripgrep_mastery"]);
});

test("does not call onSkillLoaded callback when skill not found", async () => {
	const registry = createSkillsRegistry(tmpDir);
	await registry.scan();
	const loadedSkills: string[] = [];
	const tool = createLoadSkillTool(registry, {
		onSkillLoaded: (name) => loadedSkills.push(name),
	});
	await tool.execute({ name: "nonexistent" });
	expect(loadedSkills).toEqual([]);
});
