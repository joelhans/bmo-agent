import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BmoConfig } from "./config.ts";

// ---------------------------------------------------------------------------
// Key store — persistent API key storage in ~/.local/share/bmo/keys.json
// ---------------------------------------------------------------------------

export type KeyStore = Record<string, string>;

const KEYS_FILE = "keys.json";

export function keysFilePath(dataDir: string): string {
	return join(dataDir, KEYS_FILE);
}

/**
 * Load keys from keys.json. Returns empty object if file doesn't exist.
 */
export async function loadKeys(dataDir: string): Promise<KeyStore> {
	const path = keysFilePath(dataDir);
	if (!existsSync(path)) {
		return {};
	}
	const raw = await readFile(path, "utf-8");
	return JSON.parse(raw) as KeyStore;
}

/**
 * Write keys to keys.json with 0600 permissions.
 */
export async function saveKeys(dataDir: string, keys: KeyStore): Promise<void> {
	const path = keysFilePath(dataDir);
	await writeFile(path, `${JSON.stringify(keys, null, 2)}\n`, "utf-8");
	await chmod(path, 0o600);
}

/**
 * Add or update a key for a provider. Validates that the provider exists in config
 * and the key is non-empty.
 */
export async function addKey(
	dataDir: string,
	config: BmoConfig,
	provider: string,
	key: string,
): Promise<{ ok: boolean; reason?: string }> {
	if (!config.providers[provider]) {
		const known = Object.keys(config.providers).join(", ");
		return { ok: false, reason: `Unknown provider "${provider}". Known providers: ${known}` };
	}
	if (!key || key.trim().length === 0) {
		return { ok: false, reason: "Key must not be empty." };
	}
	const keys = await loadKeys(dataDir);
	keys[provider] = key;
	await saveKeys(dataDir, keys);
	return { ok: true };
}

/**
 * Remove a stored key for a provider.
 */
export async function removeKey(dataDir: string, provider: string): Promise<{ ok: boolean; reason?: string }> {
	const keys = await loadKeys(dataDir);
	if (!(provider in keys)) {
		return { ok: false, reason: `No stored key for provider "${provider}".` };
	}
	delete keys[provider];
	await saveKeys(dataDir, keys);
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Key status listing
// ---------------------------------------------------------------------------

export interface KeyStatus {
	provider: string;
	envVar: string;
	source: "env" | "keys.json" | "not set";
	maskedKey: string | null;
}

/**
 * Build a status list for all configured providers showing where each key comes from.
 */
export function listKeys(config: BmoConfig, keys: KeyStore): KeyStatus[] {
	const statuses: KeyStatus[] = [];
	for (const [name, provider] of Object.entries(config.providers)) {
		const envValue = process.env[provider.apiKeyEnv];
		const storedValue = keys[name];

		if (envValue) {
			statuses.push({
				provider: name,
				envVar: provider.apiKeyEnv,
				source: "env",
				maskedKey: maskKeyForDisplay(envValue),
			});
		} else if (storedValue) {
			statuses.push({
				provider: name,
				envVar: provider.apiKeyEnv,
				source: "keys.json",
				maskedKey: maskKeyForDisplay(storedValue),
			});
		} else {
			statuses.push({
				provider: name,
				envVar: provider.apiKeyEnv,
				source: "not set",
				maskedKey: null,
			});
		}
	}
	return statuses;
}

// ---------------------------------------------------------------------------
// Injection — load stored keys into process.env at startup
// ---------------------------------------------------------------------------

/**
 * For each configured provider, if `process.env[apiKeyEnv]` is not set and a
 * stored key exists, inject it into `process.env`. Env vars always take precedence.
 */
export async function injectKeys(dataDir: string, config: BmoConfig): Promise<void> {
	const keys = await loadKeys(dataDir);
	for (const [name, provider] of Object.entries(config.providers)) {
		if (!process.env[provider.apiKeyEnv] && keys[name]) {
			process.env[provider.apiKeyEnv] = keys[name];
		}
	}
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Mask a key for display: first 4 chars + *** + last 4 chars.
 * Keys shorter than 12 chars show `****`.
 */
export function maskKeyForDisplay(key: string): string {
	if (key.length < 12) {
		return "****";
	}
	return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

/**
 * Format key statuses as an aligned table for terminal output.
 */
export function formatKeyList(statuses: KeyStatus[]): string {
	if (statuses.length === 0) {
		return "No providers configured.";
	}

	const providerWidth = Math.max(...statuses.map((s) => s.provider.length), "PROVIDER".length);
	const envVarWidth = Math.max(...statuses.map((s) => s.envVar.length), "ENV VAR".length);
	const sourceWidth = Math.max(...statuses.map((s) => s.source.length), "SOURCE".length);

	const header = [
		"PROVIDER".padEnd(providerWidth),
		"ENV VAR".padEnd(envVarWidth),
		"SOURCE".padEnd(sourceWidth),
		"KEY",
	].join("  ");

	const rows = statuses.map((s) =>
		[
			s.provider.padEnd(providerWidth),
			s.envVar.padEnd(envVarWidth),
			s.source.padEnd(sourceWidth),
			s.maskedKey ?? "-",
		].join("  "),
	);

	return [header, ...rows].join("\n");
}
