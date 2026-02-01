import type { BmoConfig } from "./config.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolResult {
	output: string;
	isError?: boolean;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export type ToolSchema = {
	type: "function";
	function: { name: string; description: string; parameters: Record<string, unknown> };
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface ToolRegistry {
	register(tool: ToolDefinition, options?: { builtin?: boolean }): void;
	get(name: string): ToolDefinition | undefined;
	getSchemas(): ToolSchema[];
	listNames(): string[];
	listDynamicNames(): string[];
	clearDynamic(): void;
}

export function createToolRegistry(): ToolRegistry {
	const tools = new Map<string, ToolDefinition>();
	const builtins = new Set<string>();

	return {
		register(tool, options) {
			if (!options?.builtin && builtins.has(tool.name)) {
				return; // refuse to overwrite a built-in with a dynamic tool
			}
			tools.set(tool.name, tool);
			if (options?.builtin) {
				builtins.add(tool.name);
			}
		},
		get(name) {
			return tools.get(name);
		},
		getSchemas() {
			return [...tools.values()].map((t) => ({
				type: "function" as const,
				function: { name: t.name, description: t.description, parameters: t.parameters },
			}));
		},
		listNames() {
			return [...tools.keys()];
		},
		listDynamicNames() {
			return [...tools.keys()].filter((name) => !builtins.has(name));
		},
		clearDynamic() {
			for (const name of tools.keys()) {
				if (!builtins.has(name)) {
					tools.delete(name);
				}
			}
		},
	};
}

// ---------------------------------------------------------------------------
// run_command
// ---------------------------------------------------------------------------

async function executeCommand(command: string, timeoutMs: number, truncationLimit: number): Promise<ToolResult> {
	const env = {
		...process.env,
		PAGER: "cat",
		GIT_PAGER: "cat",
		NO_COLOR: "1",
		TERM: "dumb",
	};

	try {
		const proc = Bun.spawn(["bash", "-c", `set -o pipefail; ${command}`], {
			env,
			stdout: "pipe",
			stderr: "pipe",
		});

		const timer = setTimeout(() => proc.kill(), timeoutMs);

		const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
		const exitCode = await proc.exited;
		clearTimeout(timer);

		let output = "";
		if (stdout) output += stdout;
		if (stderr) output += `${output ? "\n" : ""}[stderr]\n${stderr}`;
		output += `\n[exit code: ${exitCode}]`;

		if (output.length > truncationLimit) {
			const omitted = output.length - truncationLimit;
			output = `${output.slice(0, truncationLimit)}\n[truncated — ${omitted} chars omitted]`;
		}

		return { output, isError: exitCode !== 0 };
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		return { output: `Command failed: ${msg}`, isError: true };
	}
}

export function createRunCommandTool(config: BmoConfig): ToolDefinition {
	return {
		name: "run_command",
		description:
			"Execute a shell command. Returns stdout, stderr, and exit code. " +
			"Use for file operations (ls, cat, mkdir, cp, mv), writing files (heredoc/echo), git, and any shell utility.",
		parameters: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: "The shell command to execute",
				},
				timeout_ms: {
					type: "number",
					description: `Timeout in milliseconds. Default: ${config.sandbox.defaultTimeoutMs}`,
				},
			},
			required: ["command"],
		},
		async execute(args) {
			const command = args.command as string;
			const timeoutMs = (args.timeout_ms as number | undefined) ?? config.sandbox.defaultTimeoutMs;
			return executeCommand(command, timeoutMs, config.toolResultTruncation);
		},
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatToolCallSummary(name: string, argsJson: string): string {
	try {
		const args = JSON.parse(argsJson) as Record<string, unknown>;
		const parts = Object.entries(args).map(([k, v]) => {
			if (typeof v === "string") {
				const display = v.length > 60 ? `${v.slice(0, 60)}...` : v;
				return `${k}='${display}'`;
			}
			return `${k}=${JSON.stringify(v)}`;
		});
		return `${name}(${parts.join(", ")})`;
	} catch {
		return `${name}(...)`;
	}
}
