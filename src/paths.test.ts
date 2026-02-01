import { afterEach, describe, expect, test } from "bun:test";
import { dirname } from "node:path";
import { resolveBmoPath, resolvePaths } from "./paths.ts";

describe("resolvePaths", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test("uses BMO_HOME env var when set", () => {
		process.env.BMO_HOME = "/tmp/test-bmo-home";
		const paths = resolvePaths();
		expect(paths.bmoHome).toBe("/tmp/test-bmo-home");
	});

	test("auto-detects project root in dev mode when BMO_HOME not set", () => {
		delete process.env.BMO_HOME;
		const paths = resolvePaths();
		// import.meta.dir is src/, parent is the project root
		expect(paths.bmoHome).toBe(dirname(import.meta.dir));
	});

	test("uses BMO_DATA env var when set", () => {
		process.env.BMO_DATA = "/tmp/test-bmo-data";
		const paths = resolvePaths();
		expect(paths.dataDir).toBe("/tmp/test-bmo-data");
		expect(paths.sessionsDir).toBe("/tmp/test-bmo-data/sessions");
		expect(paths.snapshotsDir).toBe("/tmp/test-bmo-data/snapshots");
		expect(paths.summariesDir).toBe("/tmp/test-bmo-data/summaries");
		expect(paths.configFile).toBe("/tmp/test-bmo-data/config.json");
	});

	test("BMO_SOURCE is null when not set", () => {
		delete process.env.BMO_SOURCE;
		const paths = resolvePaths();
		expect(paths.bmoSource).toBeNull();
	});

	test("BMO_SOURCE is set when env var present", () => {
		process.env.BMO_SOURCE = "/tmp/test-bmo-source";
		const paths = resolvePaths();
		expect(paths.bmoSource).toBe("/tmp/test-bmo-source");
	});
});

describe("resolveBmoPath", () => {
	test("resolves bmo:// prefix to BMO_HOME", () => {
		expect(resolveBmoPath("bmo://tools/foo.mjs", "/home/user/bmo")).toBe("/home/user/bmo/tools/foo.mjs");
	});

	test("resolves bmo:// with nested path", () => {
		expect(resolveBmoPath("bmo://skills/ripgrep.md", "/opt/bmo")).toBe("/opt/bmo/skills/ripgrep.md");
	});

	test("passes through absolute paths unchanged", () => {
		expect(resolveBmoPath("/absolute/path", "/home/user/bmo")).toBe("/absolute/path");
	});

	test("passes through relative paths unchanged", () => {
		expect(resolveBmoPath("relative/path", "/home/user/bmo")).toBe("relative/path");
	});
});
