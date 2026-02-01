import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { ResolvedPaths } from "./paths.ts";

export interface ProviderConfig {
	baseUrl: string;
	apiKeyEnv: string;
}

export interface BmoConfig {
	providers: {
		[name: string]: ProviderConfig;
	};
	models: {
		reasoning: string;
		coding: string;
	};
	context: {
		reasoning: { maxTokens: number; responseHeadroom: number };
		coding: { maxTokens: number; responseHeadroom: number };
	};
	cost: {
		sessionLimit: number;
		selfImprovementLimit: number;
		selfImprovementRetries: number;
	};
	sandbox: {
		defaultTimeoutMs: number;
		memoryLimitMb: number;
		outputLimitBytes: number;
	};
	maintenance: {
		threshold: number;
		budgetLimit: number;
		sessionsSinceLastMaintenance: number;
		lastMaintenanceDate: string | null;
	};
	toolResultTruncation: number;
}

export const DEFAULT_CONFIG: BmoConfig = {
	providers: {
		openai: {
			baseUrl: "https://api.openai.com/v1",
			apiKeyEnv: "OPENAI_API_KEY",
		},
	},
	models: {
		reasoning: "openai/gpt-4o",
		coding: "openai/gpt-4o-mini",
	},
	context: {
		reasoning: { maxTokens: 200_000, responseHeadroom: 8192 },
		coding: { maxTokens: 200_000, responseHeadroom: 4096 },
	},
	cost: {
		sessionLimit: 2.0,
		selfImprovementLimit: 0.5,
		selfImprovementRetries: 3,
	},
	sandbox: {
		defaultTimeoutMs: 30_000,
		memoryLimitMb: 256,
		outputLimitBytes: 1_048_576,
	},
	maintenance: {
		threshold: 10,
		budgetLimit: 1.0,
		sessionsSinceLastMaintenance: 0,
		lastMaintenanceDate: null,
	},
	toolResultTruncation: 50_000,
};

/**
 * Deep merge source into target. Source values override target values.
 * Only merges plain objects recursively; arrays and primitives are replaced wholesale.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
	const result = { ...target };
	for (const key of Object.keys(source)) {
		const sourceVal = source[key];
		const targetVal = (result as Record<string, unknown>)[key];
		if (
			sourceVal !== null &&
			typeof sourceVal === "object" &&
			!Array.isArray(sourceVal) &&
			targetVal !== null &&
			typeof targetVal === "object" &&
			!Array.isArray(targetVal)
		) {
			(result as Record<string, unknown>)[key] = deepMerge(
				targetVal as Record<string, unknown>,
				sourceVal as Record<string, unknown>,
			);
		} else {
			(result as Record<string, unknown>)[key] = sourceVal;
		}
	}
	return result;
}

/**
 * Save config.json to data dir.
 */
export async function saveConfig(paths: ResolvedPaths, config: BmoConfig): Promise<void> {
	await writeFile(paths.configFile, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

/**
 * Load config.json from data dir. If missing, create with defaults.
 * If present, deep-merge user values over defaults so new fields
 * always have defaults even with an older config file.
 */
export async function loadConfig(paths: ResolvedPaths): Promise<BmoConfig> {
	if (!existsSync(paths.configFile)) {
		await writeFile(paths.configFile, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf-8");
		return { ...DEFAULT_CONFIG };
	}

	const raw = await readFile(paths.configFile, "utf-8");
	const userConfig = JSON.parse(raw) as Record<string, unknown>;
	return deepMerge(DEFAULT_CONFIG, userConfig);
}
