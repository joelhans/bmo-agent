import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "./config.ts";
import { createSecretMasker } from "./secrets.ts";

const FAKE_KEY = "sk-test1234567890abcdef";

describe("createSecretMasker", () => {
	let originalKey: string | undefined;

	beforeAll(() => {
		originalKey = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = FAKE_KEY;
	});

	afterAll(() => {
		if (originalKey !== undefined) {
			process.env.OPENAI_API_KEY = originalKey;
		} else {
			delete process.env.OPENAI_API_KEY;
		}
	});

	test("masks literal secret from env", () => {
		const masker = createSecretMasker(DEFAULT_CONFIG);
		const input = `API key is ${FAKE_KEY} here`;
		expect(masker.mask(input)).toBe("API key is *** here");
	});

	test("masks secret appearing multiple times", () => {
		const masker = createSecretMasker(DEFAULT_CONFIG);
		const input = `first: ${FAKE_KEY} second: ${FAKE_KEY}`;
		expect(masker.mask(input)).toBe("first: *** second: ***");
	});

	test("does not mask short env values", () => {
		const original = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "short";
		try {
			const masker = createSecretMasker(DEFAULT_CONFIG);
			expect(masker.mask("key is short here")).toBe("key is short here");
		} finally {
			process.env.OPENAI_API_KEY = original;
		}
	});

	test("masks sk- prefixed tokens via regex", () => {
		const masker = createSecretMasker(DEFAULT_CONFIG);
		const token = "sk-abcdefghijklmnopqrstuvwxyz";
		expect(masker.mask(`token: ${token}`)).toBe("token: ***");
	});

	test("masks ghp_ prefixed tokens via regex", () => {
		const masker = createSecretMasker(DEFAULT_CONFIG);
		const token = `ghp_${"a".repeat(36)}`;
		expect(masker.mask(`github: ${token}`)).toBe("github: ***");
	});

	test("masks Bearer tokens via regex", () => {
		const masker = createSecretMasker(DEFAULT_CONFIG);
		const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123";
		expect(masker.mask(text)).toBe("Authorization: ***");
	});

	test("returns text unchanged when no secrets present", () => {
		const masker = createSecretMasker(DEFAULT_CONFIG);
		const text = "Hello world, nothing secret here";
		expect(masker.mask(text)).toBe(text);
	});

	test("handles empty string", () => {
		const masker = createSecretMasker(DEFAULT_CONFIG);
		expect(masker.mask("")).toBe("");
	});

	test("handles config with no providers", () => {
		const emptyConfig = { ...DEFAULT_CONFIG, providers: {} };
		const masker = createSecretMasker(emptyConfig);
		expect(masker.mask("nothing to mask")).toBe("nothing to mask");
	});
});
