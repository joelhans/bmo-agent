import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Doc files to sync between BMO_HOME and BMO_SOURCE
// ---------------------------------------------------------------------------

export const DOC_FILES = ["IMPROVEMENTS.md", "OPPORTUNITIES.md", "EXPERIMENT.md"] as const;

// ---------------------------------------------------------------------------
// Markdown entry parsing and merging
// ---------------------------------------------------------------------------

interface ParsedDoc {
	preamble: string;
	entries: Map<string, string>;
	/** Ordered list of keys to preserve insertion order */
	orderedKeys: string[];
}

/**
 * Parse a markdown file into preamble + `## ` delimited entries.
 * Each entry key is the first line of the heading, trimmed.
 */
function parseMarkdown(content: string): ParsedDoc {
	const parts = content.split(/^(?=## )/m);
	const entries = new Map<string, string>();
	const orderedKeys: string[] = [];
	let preamble = "";

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part.startsWith("## ")) {
			const firstNewline = part.indexOf("\n");
			const heading = firstNewline === -1 ? part : part.slice(0, firstNewline);
			const key = heading.trim();
			if (!entries.has(key)) {
				entries.set(key, part);
				orderedKeys.push(key);
			}
		} else if (i === 0) {
			preamble = part;
		}
	}

	return { preamble, entries, orderedKeys };
}

/**
 * Merge two markdown documents with `## ` delimited entries.
 *
 * Set-union: keeps all unique entries. The first argument's preamble wins.
 * Entries from `localContent` appear first; entries unique to `sourceContent`
 * are appended at the end.
 *
 * Returns the merged content, or `null` if no new entries were added
 * (i.e. `sourceContent` had nothing that `localContent` doesn't already have).
 */
export function mergeMarkdownEntries(localContent: string, sourceContent: string): string | null {
	const local = parseMarkdown(localContent);
	const source = parseMarkdown(sourceContent);

	// Collect source entries not present in local
	const newKeys: string[] = [];
	for (const key of source.orderedKeys) {
		if (!local.entries.has(key)) {
			newKeys.push(key);
		}
	}

	if (newKeys.length === 0) return null;

	// Reconstruct: local preamble + local entries + new source entries
	const parts: string[] = [];
	if (local.preamble) parts.push(local.preamble);
	for (const key of local.orderedKeys) {
		const entry = local.entries.get(key);
		if (entry) parts.push(entry);
	}
	for (const key of newKeys) {
		const entry = source.entries.get(key);
		if (entry) parts.push(entry);
	}

	return parts.join("");
}

// ---------------------------------------------------------------------------
// Pull: BMO_SOURCE → BMO_HOME (local)
// ---------------------------------------------------------------------------

/**
 * For each doc file, merge entries from BMO_SOURCE into the local BMO_HOME copy.
 * New entries from source are appended; local entries are never removed.
 */
export async function pullDocsFromSource(docsDir: string, bmoSource: string): Promise<void> {
	const sourceDocsDir = join(bmoSource, "docs");

	for (const file of DOC_FILES) {
		const localPath = join(docsDir, file);
		const sourcePath = join(sourceDocsDir, file);

		let sourceContent: string | null = null;
		try {
			sourceContent = await readFile(sourcePath, "utf-8");
		} catch {
			continue; // source file doesn't exist — skip
		}

		let localContent: string | null = null;
		try {
			localContent = await readFile(localPath, "utf-8");
		} catch {
			// local doesn't exist — copy source to local
			await mkdir(docsDir, { recursive: true });
			await writeFile(localPath, sourceContent);
			continue;
		}

		const merged = mergeMarkdownEntries(localContent, sourceContent);
		if (merged !== null) {
			await writeFile(localPath, merged);
		}
	}
}

// ---------------------------------------------------------------------------
// Push: BMO_HOME (local) → BMO_SOURCE
// ---------------------------------------------------------------------------

/**
 * For each doc file, merge entries from BMO_HOME into the BMO_SOURCE copy,
 * then git add + commit if anything changed.
 */
export async function pushDocsToSource(docsDir: string, bmoSource: string): Promise<void> {
	const sourceDocsDir = join(bmoSource, "docs");
	let anyWritten = false;

	for (const file of DOC_FILES) {
		const localPath = join(docsDir, file);
		const sourcePath = join(sourceDocsDir, file);

		let localContent: string | null = null;
		try {
			localContent = await readFile(localPath, "utf-8");
		} catch {
			continue; // local file doesn't exist — skip
		}

		let sourceContent: string | null = null;
		try {
			sourceContent = await readFile(sourcePath, "utf-8");
		} catch {
			// source doesn't exist — copy local to source
			await mkdir(sourceDocsDir, { recursive: true });
			await writeFile(sourcePath, localContent);
			anyWritten = true;
			continue;
		}

		const merged = mergeMarkdownEntries(sourceContent, localContent);
		if (merged !== null) {
			await writeFile(sourcePath, merged);
			anyWritten = true;
		}
	}

	if (!anyWritten) return;

	// Git add + commit (same pattern as syncToSource in tool-loader.ts)
	try {
		const add = Bun.spawn(["git", "-C", bmoSource, "add", "docs/"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		await add.exited;

		const diff = Bun.spawn(["git", "-C", bmoSource, "diff", "--cached", "--quiet"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const diffExit = await diff.exited;

		if (diffExit !== 0) {
			const commit = Bun.spawn(["git", "-C", bmoSource, "commit", "-m", "sync docs from BMO_HOME"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			await commit.exited;
		}
	} catch {
		// best-effort — don't throw on git failure
	}
}
