import { readdir } from "node:fs/promises";
import { join } from "node:path";
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
	return [process.execPath, "--sandbox-runner"];
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
// reload_tools tool
// ---------------------------------------------------------------------------

export function createReloadToolsTool(
	toolsDir: string,
	registry: ToolRegistry,
	skillsRegistry: SkillsRegistry,
	sandboxConfig: SandboxConfig,
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
			const summary = formatLoadResult(loadResult, skillCount);
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
