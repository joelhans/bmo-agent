import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "./config.ts";
import {
	addKey,
	formatKeyList,
	injectKeys,
	type KeyStatus,
	listKeys,
	loadKeys,
	maskKeyForDisplay,
	removeKey,
	saveKeys,
} from "./keys.ts";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "bmo-keys-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// loadKeys
// ---------------------------------------------------------------------------

describe("loadKeys", () => {
	test("returns empty object when file does not exist", async () => {
		const keys = await loadKeys(tempDir);
		expect(keys).toEqual({});
	});

	test("parses valid keys.json", async () => {
		await writeFile(join(tempDir, "keys.json"), JSON.stringify({ openai: "sk-test123" }));
		const keys = await loadKeys(tempDir);
		expect(keys).toEqual({ openai: "sk-test123" });
	});

	test("throws on malformed JSON", async () => {
		await writeFile(join(tempDir, "keys.json"), "not json{{{");
		await expect(loadKeys(tempDir)).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// addKey
// ---------------------------------------------------------------------------

describe("addKey", () => {
	test("stores key for a valid provider", async () => {
		const result = await addKey(tempDir, DEFAULT_CONFIG, "openai", "sk-mykey123");
		expect(result.ok).toBe(true);

		const keys = await loadKeys(tempDir);
		expect(keys.openai).toBe("sk-mykey123");
	});

	test("rejects unknown provider", async () => {
		const result = await addKey(tempDir, DEFAULT_CONFIG, "nonexistent", "sk-foo");
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("Unknown provider");
		expect(result.reason).toContain("nonexistent");
	});

	test("rejects empty key", async () => {
		const result = await addKey(tempDir, DEFAULT_CONFIG, "openai", "");
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("empty");
	});

	test("rejects whitespace-only key", async () => {
		const result = await addKey(tempDir, DEFAULT_CONFIG, "openai", "   ");
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("empty");
	});

	test("file gets 0600 permissions", async () => {
		await addKey(tempDir, DEFAULT_CONFIG, "openai", "sk-mykey123");
		const stats = await stat(join(tempDir, "keys.json"));
		// 0o600 = owner read+write only (octal 33188 on most systems)
		expect(stats.mode & 0o777).toBe(0o600);
	});

	test("overwrites existing key for same provider", async () => {
		await addKey(tempDir, DEFAULT_CONFIG, "openai", "sk-first");
		await addKey(tempDir, DEFAULT_CONFIG, "openai", "sk-second");

		const keys = await loadKeys(tempDir);
		expect(keys.openai).toBe("sk-second");
	});
});

// ---------------------------------------------------------------------------
// removeKey
// ---------------------------------------------------------------------------

describe("removeKey", () => {
	test("removes an existing key", async () => {
		await saveKeys(tempDir, { openai: "sk-test", other: "sk-other" });
		const result = await removeKey(tempDir, "openai");
		expect(result.ok).toBe(true);

		const keys = await loadKeys(tempDir);
		expect(keys.openai).toBeUndefined();
	});

	test("preserves other keys", async () => {
		await saveKeys(tempDir, { openai: "sk-test", other: "sk-other" });
		await removeKey(tempDir, "openai");

		const keys = await loadKeys(tempDir);
		expect(keys.other).toBe("sk-other");
	});

	test("errors when key does not exist", async () => {
		await saveKeys(tempDir, {});
		const result = await removeKey(tempDir, "openai");
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("No stored key");
	});
});

// ---------------------------------------------------------------------------
// listKeys
// ---------------------------------------------------------------------------

describe("listKeys", () => {
	let savedEnv: string | undefined;

	beforeEach(() => {
		savedEnv = process.env.OPENAI_API_KEY;
	});

	afterEach(() => {
		if (savedEnv !== undefined) {
			process.env.OPENAI_API_KEY = savedEnv;
		} else {
			delete process.env.OPENAI_API_KEY;
		}
	});

	test("shows env source when env var is set", () => {
		process.env.OPENAI_API_KEY = "sk-envkey1234567890";
		const statuses = listKeys(DEFAULT_CONFIG, {});
		expect(statuses[0]?.source).toBe("env");
		expect(statuses[0]?.maskedKey).toBe("sk-e***7890");
	});

	test("shows keys.json source when only stored key exists", () => {
		delete process.env.OPENAI_API_KEY;
		const statuses = listKeys(DEFAULT_CONFIG, { openai: "sk-stored1234567890" });
		expect(statuses[0]?.source).toBe("keys.json");
		expect(statuses[0]?.maskedKey).toBe("sk-s***7890");
	});

	test("shows not set when neither env nor stored key exists", () => {
		delete process.env.OPENAI_API_KEY;
		const statuses = listKeys(DEFAULT_CONFIG, {});
		expect(statuses[0]?.source).toBe("not set");
		expect(statuses[0]?.maskedKey).toBeNull();
	});

	test("env takes precedence over stored key", () => {
		process.env.OPENAI_API_KEY = "sk-envkey1234567890";
		const statuses = listKeys(DEFAULT_CONFIG, { openai: "sk-stored1234567890" });
		expect(statuses[0]?.source).toBe("env");
		expect(statuses[0]?.maskedKey).toBe("sk-e***7890");
	});
});

// ---------------------------------------------------------------------------
// injectKeys
// ---------------------------------------------------------------------------

describe("injectKeys", () => {
	let savedEnv: string | undefined;

	beforeEach(() => {
		savedEnv = process.env.OPENAI_API_KEY;
	});

	afterEach(() => {
		if (savedEnv !== undefined) {
			process.env.OPENAI_API_KEY = savedEnv;
		} else {
			delete process.env.OPENAI_API_KEY;
		}
	});

	test("sets env var when not already set", async () => {
		delete process.env.OPENAI_API_KEY;
		await saveKeys(tempDir, { openai: "sk-injected123" });

		await injectKeys(tempDir, DEFAULT_CONFIG);
		expect(process.env.OPENAI_API_KEY).toBe("sk-injected123");
	});

	test("does not overwrite existing env var", async () => {
		process.env.OPENAI_API_KEY = "sk-existing";
		await saveKeys(tempDir, { openai: "sk-stored" });

		await injectKeys(tempDir, DEFAULT_CONFIG);
		expect(process.env.OPENAI_API_KEY).toBe("sk-existing");
	});

	test("handles missing keys.json gracefully", async () => {
		delete process.env.OPENAI_API_KEY;
		await injectKeys(tempDir, DEFAULT_CONFIG);
		expect(process.env.OPENAI_API_KEY).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// maskKeyForDisplay
// ---------------------------------------------------------------------------

describe("maskKeyForDisplay", () => {
	test("masks long key with first 4 + *** + last 4", () => {
		expect(maskKeyForDisplay("sk-abcdefghijklmnop")).toBe("sk-a***mnop");
	});

	test("returns **** for short key", () => {
		expect(maskKeyForDisplay("short")).toBe("****");
	});

	test("masks key exactly 12 chars", () => {
		expect(maskKeyForDisplay("123456789012")).toBe("1234***9012");
	});

	test("returns **** for key of 11 chars", () => {
		expect(maskKeyForDisplay("12345678901")).toBe("****");
	});
});

// ---------------------------------------------------------------------------
// formatKeyList
// ---------------------------------------------------------------------------

describe("formatKeyList", () => {
	test("returns message when no providers configured", () => {
		expect(formatKeyList([])).toBe("No providers configured.");
	});

	test("formats table with header and rows", () => {
		const statuses: KeyStatus[] = [
			{ provider: "openai", envVar: "OPENAI_API_KEY", source: "env", maskedKey: "sk-a***ef12" },
			{ provider: "anthropic", envVar: "ANTHROPIC_API_KEY", source: "not set", maskedKey: null },
		];
		const output = formatKeyList(statuses);
		expect(output).toContain("PROVIDER");
		expect(output).toContain("ENV VAR");
		expect(output).toContain("SOURCE");
		expect(output).toContain("KEY");
		expect(output).toContain("openai");
		expect(output).toContain("sk-a***ef12");
		expect(output).toContain("anthropic");
		expect(output).toContain("-");
	});
});
