// ---------------------------------------------------------------------------
// Tool sandbox — subprocess isolation for dynamic .mjs tools
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCapabilities {
	filesystem: "project" | "bmo" | "both" | "none";
	network: boolean;
	subprocess: boolean;
	env: boolean;
}

export interface SandboxConfig {
	defaultTimeoutMs: number;
	memoryLimitMb: number;
	outputLimitBytes: number;
	projectDir: string;
	bmoHome: string;
}

export const DEFAULT_CAPABILITIES: ToolCapabilities = {
	filesystem: "project",
	network: false,
	subprocess: false,
	env: false,
};

const VALID_FS_VALUES = new Set(["project", "bmo", "both", "none"]);

// ---------------------------------------------------------------------------
// resolveCapabilities
// ---------------------------------------------------------------------------

export function resolveCapabilities(raw: Partial<ToolCapabilities> | undefined): ToolCapabilities {
	if (!raw) return { ...DEFAULT_CAPABILITIES };

	const fs =
		typeof raw.filesystem === "string" && VALID_FS_VALUES.has(raw.filesystem)
			? raw.filesystem
			: DEFAULT_CAPABILITIES.filesystem;

	return {
		filesystem: fs as ToolCapabilities["filesystem"],
		network: typeof raw.network === "boolean" ? raw.network : DEFAULT_CAPABILITIES.network,
		subprocess: typeof raw.subprocess === "boolean" ? raw.subprocess : DEFAULT_CAPABILITIES.subprocess,
		env: typeof raw.env === "boolean" ? raw.env : DEFAULT_CAPABILITIES.env,
	};
}

// ---------------------------------------------------------------------------
// buildSandboxEnv
// ---------------------------------------------------------------------------

export function buildSandboxEnv(caps: ToolCapabilities, config: SandboxConfig): Record<string, string> {
	const env: Record<string, string> = {};

	// Minimal safe env vars always passed through
	if (process.env.PATH) env.PATH = process.env.PATH;
	if (process.env.HOME) env.HOME = process.env.HOME;
	if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
	if (process.env.NODE_ENV) env.NODE_ENV = process.env.NODE_ENV;

	// If tool declares env access, copy full process.env
	if (caps.env) {
		for (const [key, value] of Object.entries(process.env)) {
			if (value !== undefined) env[key] = value;
		}
	}

	// Sandbox metadata
	env.BMO_SANDBOX_FS = caps.filesystem;
	env.BMO_SANDBOX_PROJECT_DIR = config.projectDir;
	env.BMO_SANDBOX_BMO_HOME = config.bmoHome;

	if (!caps.network) env.BMO_SANDBOX_NO_NETWORK = "1";
	if (!caps.subprocess) env.BMO_SANDBOX_NO_SUBPROCESS = "1";

	return env;
}

// ---------------------------------------------------------------------------
// executeSandboxed
// ---------------------------------------------------------------------------

export interface SandboxResult {
	output: string;
	isError: boolean;
}

export async function executeSandboxed(
	toolPath: string,
	args: Record<string, unknown>,
	caps: ToolCapabilities,
	config: SandboxConfig,
	runnerPath: string,
): Promise<SandboxResult> {
	const env = buildSandboxEnv(caps, config);

	// Note: ulimit -v is incompatible with Bun (large virtual address space at startup).
	// Memory limiting deferred to a future phase. Timeout is the primary resource limit.
	const proc = Bun.spawn(["bun", "run", runnerPath], {
		env,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});

	// Write request to stdin
	const request = JSON.stringify({ toolPath, args });
	proc.stdin.write(request);
	proc.stdin.end();

	// Timeout handling
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		proc.kill();
	}, config.defaultTimeoutMs);

	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	const exitCode = await proc.exited;
	clearTimeout(timer);

	if (timedOut) {
		return { output: `Tool execution timed out after ${config.defaultTimeoutMs}ms`, isError: true };
	}

	// Enforce output size limit
	let rawOutput = stdout;
	if (rawOutput.length > config.outputLimitBytes) {
		const omitted = rawOutput.length - config.outputLimitBytes;
		rawOutput = `${rawOutput.slice(0, config.outputLimitBytes)}\n[truncated — ${omitted} bytes omitted]`;
	}

	// Parse result JSON
	try {
		const result = JSON.parse(rawOutput) as { ok: boolean; result?: unknown; error?: string };
		if (result.ok) {
			const output = typeof result.result === "string" ? result.result : JSON.stringify(result.result, null, 2);
			return { output, isError: false };
		}
		return { output: result.error ?? "Tool returned ok: false with no error message", isError: true };
	} catch {
		// Non-JSON output — likely a crash
		const parts: string[] = [];
		if (rawOutput.trim()) parts.push(rawOutput.trim());
		if (stderr.trim()) parts.push(`[stderr] ${stderr.trim()}`);
		if (parts.length === 0) parts.push(`Tool process exited with code ${exitCode}`);
		return { output: parts.join("\n"), isError: true };
	}
}
