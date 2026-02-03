import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOC_FILES, mergeMarkdownEntries } from "./doc-sync.ts";
import { executeSandboxed, resolveCapabilities, type SandboxConfig, type ToolCapabilities } from "./sandbox.ts";
import type { SkillsRegistry } from "./skills.ts";
import type { ToolDefinition, ToolRegistry, ToolResult } from "./tools.ts";

// ---------------------------------------------------------------------------
// Types for JS module tool exports
// ---------------------------------------------------------------------------

interface ModuleToolExports {
	schema: Record<string, unknown>;
	description?: string;
	run: (args: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
	requires?: string[];
	capabilities?: Partial<ToolCapabilities>;
}

// ---------------------------------------------------------------------------
// Dependency checking
// ---------------------------------------------------------------------------

async function isAvailable(binary: string): Promise<boolean> {
	try {
		const proc = Bun.spawn(["which", binary], { stdout: "pipe", stderr: "pipe" });
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Sandbox command — self-invocation for compiled binary support
// ---------------------------------------------------------------------------

/**
 * Build the command array to spawn a sandbox runner subprocess.
 * In dev mode, uses [bun, <path-to-main.ts>, --sandbox-runner].
 * In compiled binary mode, uses [/path/to/bmo, --sandbox-runner].
 */
export function getSandboxCommand(): string[] {
	const mainTs = join(import.meta.dir, "main.ts");
	const scriptArg = process.argv[1];
	// Dev mode: process.argv[1] is a .ts/.js source file (not a compiled binary)
	if (scriptArg && /\.[tj]sx?$/.test(scriptArg)) {
		return [process.execPath, mainTs, "--sandbox-runner"];
	}
	// On Linux, if the binary was replaced on disk while running (e.g. rebuild),
	// /proc/self/exe appends " (deleted)" to the path. The new binary exists at
	// the original path, so strip the suffix.
	let exe = process.execPath;
	if (exe.endsWith(" (deleted)")) {
		exe = exe.slice(0, -" (deleted)".length);
	}
	return [exe, "--sandbox-runner"];
}

// ---------------------------------------------------------------------------
// Dynamic tool loading
// ---------------------------------------------------------------------------

export interface LoadResult {
	loaded: string[];
	unavailable: Array<{ name: string; reason: string }>;
	errors: Array<{ name: string; error: string }>;
}

/**
 * Scan toolsDir for *.mjs files, dynamically import each, validate exports,
 * check dependencies, and register as ToolDefinitions in the registry.
 * Dynamic tools execute in a sandboxed subprocess.
 */
export async function loadDynamicTools(
	toolsDir: string,
	registry: ToolRegistry,
	sandboxConfig: SandboxConfig,
): Promise<LoadResult> {
	const result: LoadResult = { loaded: [], unavailable: [], errors: [] };

	let entries: string[];
	try {
		entries = await readdir(toolsDir);
	} catch {
		return result;
	}

	const mjsFiles = entries.filter((e) => e.endsWith(".mjs"));

	for (const file of mjsFiles) {
		const filePath = join(toolsDir, file);
		const toolName = file.replace(/\.mjs$/, "");

		try {
			// Cache-busting: append timestamp query param
			const moduleUrl = `${filePath}?v=${Date.now()}`;
			const mod = (await import(moduleUrl)) as Partial<ModuleToolExports>;

			// Validate exports
			if (!mod.schema || typeof mod.schema !== "object") {
				result.errors.push({ name: toolName, error: "Missing or invalid 'schema' export" });
				continue;
			}
			if (typeof mod.run !== "function") {
				result.errors.push({ name: toolName, error: "Missing or invalid 'run' export" });
				continue;
			}

			// Check optional requires
			if (mod.requires && Array.isArray(mod.requires)) {
				const missing: string[] = [];
				for (const dep of mod.requires) {
					if (!(await isAvailable(dep))) {
						missing.push(dep);
					}
				}
				if (missing.length > 0) {
					result.unavailable.push({
						name: toolName,
						reason: `Missing dependencies: ${missing.join(", ")}`,
					});
					continue;
				}
			}

			const description = typeof mod.description === "string" ? mod.description : `Dynamic tool: ${toolName}`;
			const caps = resolveCapabilities(mod.capabilities);

			const sandboxCommand = getSandboxCommand();
			const tool: ToolDefinition = {
				name: toolName,
				description,
				parameters: mod.schema,
				async execute(args): Promise<ToolResult> {
					return executeSandboxed(filePath, args, caps, sandboxConfig, sandboxCommand);
				},
			};

			registry.register(tool); // dynamic — no { builtin: true }
			result.loaded.push(toolName);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			result.errors.push({ name: toolName, error: msg });
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Format load result
// ---------------------------------------------------------------------------

export function formatLoadResult(result: LoadResult, skillCount: number): string {
	const lines: string[] = [];

	if (result.loaded.length > 0) {
		lines.push(`Loaded ${result.loaded.length} tool(s): ${result.loaded.join(", ")}`);
	}
	for (const u of result.unavailable) {
		lines.push(`Unavailable: ${u.name} — ${u.reason}`);
	}
	for (const e of result.errors) {
		lines.push(`Error: ${e.name} — ${e.error}`);
	}
	if (result.loaded.length === 0 && result.unavailable.length === 0 && result.errors.length === 0) {
		lines.push("No dynamic tools found in tools directory.");
	}

	lines.push(`Skills indexed: ${skillCount}`);

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Sync to BMO_SOURCE — auto-persist tools and skills to version control
// ---------------------------------------------------------------------------

/**
 * Copy tools and skills from BMO_HOME dirs to BMO_SOURCE and git commit
 * if anything changed. Only syncs tools that passed validation (loaded or
 * unavailable due to missing deps). Tools with errors are excluded to
 * prevent committing broken code to BMO_SOURCE.
 *
 * Returns a status line for the reload summary, or null if BMO_SOURCE is
 * not set.
 */
export async function syncToSource(
	toolsDir: string,
	skillsDir: string,
	bmoSource: string | null,
	loadResult?: LoadResult,
	docsDir?: string,
): Promise<string | null> {
	if (!bmoSource) return null;

	const destToolsDir = join(bmoSource, "tools");
	const destSkillsDir = join(bmoSource, "skills");
	await mkdir(destToolsDir, { recursive: true });
	await mkdir(destSkillsDir, { recursive: true });

	let copied = 0;
	const skipped: string[] = [];

	// Build allowlist of valid tools (loaded + unavailable-but-valid)
	// If no loadResult provided, fall back to syncing everything (backwards compat)
	const validToolNames = loadResult
		? new Set([...loadResult.loaded, ...loadResult.unavailable.map((u) => u.name)])
		: null;

	// Copy .mjs tool files (only validated ones)
	try {
		const toolFiles = (await readdir(toolsDir)).filter((f) => f.endsWith(".mjs"));
		for (const file of toolFiles) {
			const toolName = file.replace(/\.mjs$/, "");
			if (validToolNames && !validToolNames.has(toolName)) {
				skipped.push(toolName);
				continue;
			}
			await copyFile(join(toolsDir, file), join(destToolsDir, file));
			copied++;
		}
	} catch {
		// toolsDir may not exist yet
	}

	// Copy .md skill files
	try {
		const skillFiles = (await readdir(skillsDir)).filter((f) => f.endsWith(".md"));
		for (const file of skillFiles) {
			await copyFile(join(skillsDir, file), join(destSkillsDir, file));
			copied++;
		}
	} catch {
		// skillsDir may not exist yet
	}

	// Merge doc files (IMPROVEMENTS.md, OPPORTUNITIES.md, EXPERIMENT.md)
	if (docsDir) {
		const destDocsDir = join(bmoSource, "docs");
		await mkdir(destDocsDir, { recursive: true });
		for (const file of DOC_FILES) {
			try {
				const localContent = await readFile(join(docsDir, file), "utf-8");
				let sourceContent: string | null = null;
				try {
					sourceContent = await readFile(join(destDocsDir, file), "utf-8");
				} catch {
					// source doesn't exist — copy local
				}
				if (sourceContent === null) {
					await writeFile(join(destDocsDir, file), localContent);
					copied++;
				} else {
					const merged = mergeMarkdownEntries(sourceContent, localContent);
					if (merged !== null) {
						await writeFile(join(destDocsDir, file), merged);
						copied++;
					}
				}
			} catch {
				// local file doesn't exist — skip
			}
		}
	}

	if (copied === 0) return null;

	// Git add + commit (only if there are actual changes)
	try {
		const add = Bun.spawn(["git", "-C", bmoSource, "add", "tools/", "skills/", "docs/"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		await add.exited;

		// Check if there's anything staged
		const diff = Bun.spawn(["git", "-C", bmoSource, "diff", "--cached", "--quiet"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const diffExit = await diff.exited;

		if (diffExit !== 0) {
			// There are staged changes — commit them
			const commit = Bun.spawn(["git", "-C", bmoSource, "commit", "-m", "sync tools, skills, and docs from BMO_HOME"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			await commit.exited;
			let msg = "Synced to BMO_SOURCE and committed.";
			if (skipped.length > 0) {
				msg += ` Skipped broken tool(s): ${skipped.join(", ")}`;
			}
			return msg;
		}
		if (skipped.length > 0) {
			return `No changes to sync. Skipped broken tool(s): ${skipped.join(", ")}`;
		}
		return null; // nothing changed
	} catch {
		return "Synced files to BMO_SOURCE but git commit failed.";
	}
}

// ---------------------------------------------------------------------------
// reload_tools tool
// ---------------------------------------------------------------------------

export function createReloadToolsTool(
	toolsDir: string,
	registry: ToolRegistry,
	skillsRegistry: SkillsRegistry,
	sandboxConfig: SandboxConfig,
	opts?: { skillsDir?: string; bmoSource?: string | null; docsDir?: string },
): ToolDefinition {
	return {
		name: "reload_tools",
		description:
			"Rescan the tools directory for JS module tools and the skills directory for skill documents. " +
			"Clears previously loaded dynamic tools, validates and re-registers them. " +
			"Returns a summary of loaded tools, unavailable tools, and errors.",
		parameters: {
			type: "object",
			properties: {},
		},
		async execute(): Promise<ToolResult> {
			registry.clearDynamic();
			const loadResult = await loadDynamicTools(toolsDir, registry, sandboxConfig);
			await skillsRegistry.scan();
			const skillCount = skillsRegistry.list().length;
			let summary = formatLoadResult(loadResult, skillCount);

			// Auto-sync to BMO_SOURCE if configured (only valid tools)
			if (opts?.skillsDir) {
				const syncResult = await syncToSource(
					toolsDir,
					opts.skillsDir,
					opts.bmoSource ?? null,
					loadResult,
					opts.docsDir,
				);
				if (syncResult) summary += `\n${syncResult}`;
			}

			return { output: summary };
		},
	};
}

// ---------------------------------------------------------------------------
// Initial load (boot-time)
// ---------------------------------------------------------------------------

export async function initialLoad(
	toolsDir: string,
	registry: ToolRegistry,
	skillsRegistry: SkillsRegistry,
	sandboxConfig: SandboxConfig,
): Promise<LoadResult> {
	await skillsRegistry.scan();
	return loadDynamicTools(toolsDir, registry, sandboxConfig);
}
