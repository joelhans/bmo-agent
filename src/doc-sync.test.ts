import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeMarkdownEntries, pullDocsFromSource, pushDocsToSource } from "./doc-sync.ts";

// ---------------------------------------------------------------------------
// mergeMarkdownEntries
// ---------------------------------------------------------------------------

describe("mergeMarkdownEntries", () => {
	test("both empty → null", () => {
		expect(mergeMarkdownEntries("", "")).toBeNull();
	});

	test("local has entries, source empty → null", () => {
		const local = "## Entry A\nSome content\n";
		expect(mergeMarkdownEntries(local, "")).toBeNull();
	});

	test("source has entries, local empty → merged content", () => {
		const source = "## Entry A\nSome content\n";
		const result = mergeMarkdownEntries("", source);
		expect(result).not.toBeNull();
		expect(result).toContain("## Entry A");
		expect(result).toContain("Some content");
	});

	test("both have same entries → null", () => {
		const content = "## Entry A\nContent A\n\n## Entry B\nContent B\n";
		expect(mergeMarkdownEntries(content, content)).toBeNull();
	});

	test("source has additional entries → merged with source entries appended", () => {
		const local = "## Entry A\nContent A\n";
		const source = "## Entry A\nContent A\n\n## Entry B\nContent B\n";
		const result = mergeMarkdownEntries(local, source);
		expect(result).not.toBeNull();
		expect(result).toContain("## Entry A");
		expect(result).toContain("## Entry B");
		// Local entry should come first
		const idxA = (result ?? "").indexOf("## Entry A");
		const idxB = (result ?? "").indexOf("## Entry B");
		expect(idxA).toBeLessThan(idxB);
	});

	test("local has additional entries → null", () => {
		const local = "## Entry A\nContent A\n\n## Entry B\nContent B\n";
		const source = "## Entry A\nContent A\n";
		expect(mergeMarkdownEntries(local, source)).toBeNull();
	});

	test("both have unique entries → merged with both sets, local entries first", () => {
		const local = "## Entry A\nContent A\n";
		const source = "## Entry B\nContent B\n";
		const result = mergeMarkdownEntries(local, source);
		expect(result).not.toBeNull();
		expect(result).toContain("## Entry A");
		expect(result).toContain("## Entry B");
		const idxA = (result ?? "").indexOf("## Entry A");
		const idxB = (result ?? "").indexOf("## Entry B");
		expect(idxA).toBeLessThan(idxB);
	});

	test("preamble preserved from first argument (local)", () => {
		const local = "# My Preamble\n\nSome intro text.\n\n## Entry A\nContent A\n";
		const source = "# Different Preamble\n\n## Entry B\nContent B\n";
		const result = mergeMarkdownEntries(local, source);
		expect(result).not.toBeNull();
		expect(result).toContain("# My Preamble");
		expect(result).not.toContain("# Different Preamble");
		expect(result).toContain("## Entry A");
		expect(result).toContain("## Entry B");
	});

	test("duplicate heading keys are deduplicated", () => {
		const local = "## Entry A\nLocal version\n";
		const source = "## Entry A\nSource version\n";
		const result = mergeMarkdownEntries(local, source);
		// Same key — no new entries
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// pullDocsFromSource / pushDocsToSource
// ---------------------------------------------------------------------------

describe("pullDocsFromSource", () => {
	let tmpDir: string;
	let localDocsDir: string;
	let sourceDir: string;
	let sourceDocsDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "doc-sync-pull-"));
		localDocsDir = join(tmpDir, "local", "docs");
		sourceDir = join(tmpDir, "source");
		sourceDocsDir = join(sourceDir, "docs");
		await mkdir(localDocsDir, { recursive: true });
		await mkdir(sourceDocsDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("source dir missing docs → no-op", async () => {
		const emptySource = join(tmpDir, "empty-source");
		// Don't create docs dir
		await pullDocsFromSource(localDocsDir, emptySource);
		// Should not throw
	});

	test("file exists only in source → copied to local", async () => {
		await writeFile(join(sourceDocsDir, "IMPROVEMENTS.md"), "## Entry A\nContent\n");
		await pullDocsFromSource(localDocsDir, sourceDir);
		const content = await readFile(join(localDocsDir, "IMPROVEMENTS.md"), "utf-8");
		expect(content).toContain("## Entry A");
	});

	test("file exists only in local → no change", async () => {
		const original = "## Local Entry\nContent\n";
		await writeFile(join(localDocsDir, "IMPROVEMENTS.md"), original);
		await pullDocsFromSource(localDocsDir, sourceDir);
		const content = await readFile(join(localDocsDir, "IMPROVEMENTS.md"), "utf-8");
		expect(content).toBe(original);
	});

	test("both have files → merged correctly", async () => {
		await writeFile(join(localDocsDir, "IMPROVEMENTS.md"), "## Local Entry\nLocal content\n");
		await writeFile(join(sourceDocsDir, "IMPROVEMENTS.md"), "## Source Entry\nSource content\n");
		await pullDocsFromSource(localDocsDir, sourceDir);
		const content = await readFile(join(localDocsDir, "IMPROVEMENTS.md"), "utf-8");
		expect(content).toContain("## Local Entry");
		expect(content).toContain("## Source Entry");
	});

	test("no changes → no file writes", async () => {
		const same = "## Entry A\nContent\n";
		await writeFile(join(localDocsDir, "IMPROVEMENTS.md"), same);
		await writeFile(join(sourceDocsDir, "IMPROVEMENTS.md"), same);
		// Get mtime before pull
		const { mtimeMs: before } = await Bun.file(join(localDocsDir, "IMPROVEMENTS.md")).stat();
		// Small delay to detect mtime changes
		await Bun.sleep(10);
		await pullDocsFromSource(localDocsDir, sourceDir);
		const { mtimeMs: after } = await Bun.file(join(localDocsDir, "IMPROVEMENTS.md")).stat();
		expect(after).toBe(before);
	});
});

describe("pushDocsToSource", () => {
	let tmpDir: string;
	let localDocsDir: string;
	let sourceDir: string;
	let sourceDocsDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "doc-sync-push-"));
		localDocsDir = join(tmpDir, "local", "docs");
		sourceDir = join(tmpDir, "source");
		sourceDocsDir = join(sourceDir, "docs");
		await mkdir(localDocsDir, { recursive: true });
		// Init a git repo in sourceDir so git commands don't fail
		await mkdir(sourceDocsDir, { recursive: true });
		const init = Bun.spawn(["git", "init", sourceDir], { stdout: "pipe", stderr: "pipe" });
		await init.exited;
		// Initial commit so git diff --cached works
		await writeFile(join(sourceDir, ".gitkeep"), "");
		const add = Bun.spawn(["git", "-C", sourceDir, "add", "."], { stdout: "pipe", stderr: "pipe" });
		await add.exited;
		const commit = Bun.spawn(["git", "-C", sourceDir, "commit", "-m", "init"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		await commit.exited;
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("local dir missing docs → no-op", async () => {
		const emptyLocal = join(tmpDir, "empty-local");
		await pushDocsToSource(emptyLocal, sourceDir);
		// Should not throw
	});

	test("file exists only in local → copied to source", async () => {
		await writeFile(join(localDocsDir, "IMPROVEMENTS.md"), "## Entry A\nContent\n");
		await pushDocsToSource(localDocsDir, sourceDir);
		const content = await readFile(join(sourceDocsDir, "IMPROVEMENTS.md"), "utf-8");
		expect(content).toContain("## Entry A");
	});

	test("file exists only in source → no change", async () => {
		const original = "## Source Entry\nContent\n";
		await writeFile(join(sourceDocsDir, "IMPROVEMENTS.md"), original);
		await pushDocsToSource(localDocsDir, sourceDir);
		const content = await readFile(join(sourceDocsDir, "IMPROVEMENTS.md"), "utf-8");
		expect(content).toBe(original);
	});

	test("both have files → merged correctly", async () => {
		await writeFile(join(localDocsDir, "IMPROVEMENTS.md"), "## Local Entry\nLocal content\n");
		await writeFile(join(sourceDocsDir, "IMPROVEMENTS.md"), "## Source Entry\nSource content\n");
		await pushDocsToSource(localDocsDir, sourceDir);
		const content = await readFile(join(sourceDocsDir, "IMPROVEMENTS.md"), "utf-8");
		expect(content).toContain("## Source Entry");
		expect(content).toContain("## Local Entry");
	});

	test("no changes → no file writes", async () => {
		const same = "## Entry A\nContent\n";
		await writeFile(join(localDocsDir, "IMPROVEMENTS.md"), same);
		await writeFile(join(sourceDocsDir, "IMPROVEMENTS.md"), same);
		const { mtimeMs: before } = await Bun.file(join(sourceDocsDir, "IMPROVEMENTS.md")).stat();
		await Bun.sleep(10);
		await pushDocsToSource(localDocsDir, sourceDir);
		const { mtimeMs: after } = await Bun.file(join(sourceDocsDir, "IMPROVEMENTS.md")).stat();
		expect(after).toBe(before);
	});
});
