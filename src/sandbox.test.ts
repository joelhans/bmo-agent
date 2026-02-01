import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	buildSandboxEnv,
	DEFAULT_CAPABILITIES,
	executeSandboxed,
	resolveCapabilities,
	type SandboxConfig,
	type ToolCapabilities,
} from "./sandbox.ts";

// ---------------------------------------------------------------------------
// resolveCapabilities
// ---------------------------------------------------------------------------

describe("resolveCapabilities", () => {
	test("returns defaults when undefined", () => {
		const caps = resolveCapabilities(undefined);
		expect(caps).toEqual(DEFAULT_CAPABILITIES);
	});

	test("returns defaults when empty object", () => {
		const caps = resolveCapabilities({});
		expect(caps).toEqual(DEFAULT_CAPABILITIES);
	});

	test("merges partial overrides", () => {
		const caps = resolveCapabilities({ network: true, filesystem: "both" });
		expect(caps.network).toBe(true);
		expect(caps.filesystem).toBe("both");
		expect(caps.subprocess).toBe(false);
		expect(caps.env).toBe(false);
	});

	test("rejects invalid filesystem value", () => {
		const caps = resolveCapabilities({ filesystem: "invalid" as ToolCapabilities["filesystem"] });
		expect(caps.filesystem).toBe("project");
	});

	test("coerces non-boolean network to default", () => {
		const caps = resolveCapabilities({ network: "yes" as unknown as boolean });
		expect(caps.network).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// buildSandboxEnv
// ---------------------------------------------------------------------------

describe("buildSandboxEnv", () => {
	const config: SandboxConfig = {
		defaultTimeoutMs: 5000,
		memoryLimitMb: 128,
		outputLimitBytes: 65536,
		projectDir: "/home/user/project",
		bmoHome: "/opt/bmo",
	};

	test("includes PATH and sandbox metadata", () => {
		const env = buildSandboxEnv(DEFAULT_CAPABILITIES, config);
		expect(env.BMO_SANDBOX_FS).toBe("project");
		expect(env.BMO_SANDBOX_PROJECT_DIR).toBe("/home/user/project");
		expect(env.BMO_SANDBOX_BMO_HOME).toBe("/opt/bmo");
		if (process.env.PATH) expect(env.PATH).toBe(process.env.PATH);
	});

	test("strips API keys when env: false", () => {
		const original = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "sk-test-secret";
		try {
			const env = buildSandboxEnv({ ...DEFAULT_CAPABILITIES, env: false }, config);
			expect(env.OPENAI_API_KEY).toBeUndefined();
		} finally {
			if (original !== undefined) {
				process.env.OPENAI_API_KEY = original;
			} else {
				delete process.env.OPENAI_API_KEY;
			}
		}
	});

	test("preserves full env when env: true", () => {
		const original = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "sk-test-secret";
		try {
			const env = buildSandboxEnv({ ...DEFAULT_CAPABILITIES, env: true }, config);
			expect(env.OPENAI_API_KEY).toBe("sk-test-secret");
		} finally {
			if (original !== undefined) {
				process.env.OPENAI_API_KEY = original;
			} else {
				delete process.env.OPENAI_API_KEY;
			}
		}
	});

	test("sets network restriction flag", () => {
		const env = buildSandboxEnv({ ...DEFAULT_CAPABILITIES, network: false }, config);
		expect(env.BMO_SANDBOX_NO_NETWORK).toBe("1");
	});

	test("omits network restriction when allowed", () => {
		const env = buildSandboxEnv({ ...DEFAULT_CAPABILITIES, network: true }, config);
		expect(env.BMO_SANDBOX_NO_NETWORK).toBeUndefined();
	});

	test("sets subprocess restriction flag", () => {
		const env = buildSandboxEnv({ ...DEFAULT_CAPABILITIES, subprocess: false }, config);
		expect(env.BMO_SANDBOX_NO_SUBPROCESS).toBe("1");
	});

	test("omits subprocess restriction when allowed", () => {
		const env = buildSandboxEnv({ ...DEFAULT_CAPABILITIES, subprocess: true }, config);
		expect(env.BMO_SANDBOX_NO_SUBPROCESS).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// executeSandboxed — integration tests with real subprocess
// ---------------------------------------------------------------------------

const tmpDir = join(import.meta.dir, "..", ".test-sandbox-tmp");
const runnerPath = join(import.meta.dir, "sandbox-runner.ts");

const sandboxConfig: SandboxConfig = {
	defaultTimeoutMs: 5000,
	memoryLimitMb: 128,
	outputLimitBytes: 65536,
	projectDir: tmpDir,
	bmoHome: tmpDir,
};

beforeAll(async () => {
	await mkdir(tmpDir, { recursive: true });

	// Tool that echoes input
	await writeFile(
		join(tmpDir, "echo_tool.mjs"),
		`
export async function run({ text }) {
	return { ok: true, result: "echoed: " + text };
}
`,
	);

	// Tool that returns ok: false
	await writeFile(
		join(tmpDir, "fail_tool.mjs"),
		`
export async function run() {
	return { ok: false, error: "intentional failure" };
}
`,
	);

	// Tool that sleeps too long
	await writeFile(
		join(tmpDir, "slow_tool.mjs"),
		`
export async function run() {
	await new Promise(r => setTimeout(r, 60000));
	return { ok: true, result: "done" };
}
`,
	);

	// Tool that checks env for API key
	await writeFile(
		join(tmpDir, "env_check_tool.mjs"),
		`
export async function run() {
	const key = process.env.OPENAI_API_KEY ?? "not_set";
	return { ok: true, result: key };
}
`,
	);

	// Tool that tries to use fetch
	await writeFile(
		join(tmpDir, "fetch_tool.mjs"),
		`
export async function run() {
	try {
		await fetch("https://example.com");
		return { ok: true, result: "fetch succeeded" };
	} catch (err) {
		return { ok: false, error: err.message };
	}
}
`,
	);

	// Tool that produces large output
	await writeFile(
		join(tmpDir, "big_output_tool.mjs"),
		`
export async function run() {
	return { ok: true, result: "x".repeat(200000) };
}
`,
	);
});

afterAll(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("executeSandboxed", () => {
	test("successful tool returns output", async () => {
		const result = await executeSandboxed(
			join(tmpDir, "echo_tool.mjs"),
			{ text: "hello" },
			DEFAULT_CAPABILITIES,
			sandboxConfig,
			runnerPath,
		);
		expect(result.output).toBe("echoed: hello");
		expect(result.isError).toBe(false);
	});

	test("failing tool returns isError", async () => {
		const result = await executeSandboxed(
			join(tmpDir, "fail_tool.mjs"),
			{},
			DEFAULT_CAPABILITIES,
			sandboxConfig,
			runnerPath,
		);
		expect(result.output).toBe("intentional failure");
		expect(result.isError).toBe(true);
	});

	test("tool exceeding timeout is killed", async () => {
		const shortTimeout: SandboxConfig = { ...sandboxConfig, defaultTimeoutMs: 500 };
		const result = await executeSandboxed(
			join(tmpDir, "slow_tool.mjs"),
			{},
			DEFAULT_CAPABILITIES,
			shortTimeout,
			runnerPath,
		);
		expect(result.isError).toBe(true);
		expect(result.output).toContain("timed out");
	});

	test("tool with env: false cannot see API key", async () => {
		const original = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "sk-test-secret-sandbox";
		try {
			const result = await executeSandboxed(
				join(tmpDir, "env_check_tool.mjs"),
				{},
				{ ...DEFAULT_CAPABILITIES, env: false },
				sandboxConfig,
				runnerPath,
			);
			expect(result.output).not.toContain("sk-test-secret-sandbox");
		} finally {
			if (original !== undefined) {
				process.env.OPENAI_API_KEY = original;
			} else {
				delete process.env.OPENAI_API_KEY;
			}
		}
	});

	test("tool with env: true can see API key", async () => {
		const original = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "sk-test-visible";
		try {
			const result = await executeSandboxed(
				join(tmpDir, "env_check_tool.mjs"),
				{},
				{ ...DEFAULT_CAPABILITIES, env: true },
				sandboxConfig,
				runnerPath,
			);
			expect(result.output).toBe("sk-test-visible");
		} finally {
			if (original !== undefined) {
				process.env.OPENAI_API_KEY = original;
			} else {
				delete process.env.OPENAI_API_KEY;
			}
		}
	});

	test("tool with network: false gets error from fetch", async () => {
		const result = await executeSandboxed(
			join(tmpDir, "fetch_tool.mjs"),
			{},
			{ ...DEFAULT_CAPABILITIES, network: false },
			sandboxConfig,
			runnerPath,
		);
		expect(result.isError).toBe(true);
		expect(result.output).toContain("sandbox");
	});

	test("output exceeding limit is truncated", async () => {
		const smallLimit: SandboxConfig = { ...sandboxConfig, outputLimitBytes: 100 };
		const result = await executeSandboxed(
			join(tmpDir, "big_output_tool.mjs"),
			{},
			DEFAULT_CAPABILITIES,
			smallLimit,
			runnerPath,
		);
		// Truncated output won't parse as valid JSON, so it falls through to error handling
		expect(result.isError).toBe(true);
		expect(result.output).toContain("truncated");
	});

	test("handles nonexistent tool path", async () => {
		const result = await executeSandboxed(
			join(tmpDir, "nonexistent.mjs"),
			{},
			DEFAULT_CAPABILITIES,
			sandboxConfig,
			runnerPath,
		);
		expect(result.isError).toBe(true);
	});
});
