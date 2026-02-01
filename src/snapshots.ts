import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BmoConfig } from "./config.ts";
import type { SkillsRegistry } from "./skills.ts";
import type { ToolRegistry } from "./tools.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateSnapshot {
	snapshotId: string;
	createdAt: string;
	sessionId: string;
	toolInventory: string[];
	skillInventory: string[];
	config: Record<string, unknown>;
	metrics: {
		totalTools: number;
		builtinTools: number;
		dynamicTools: number;
		totalSkills: number;
	};
}

// ---------------------------------------------------------------------------
// Sanitize config — remove apiKeyEnv values from providers
// ---------------------------------------------------------------------------

function sanitizeConfig(config: BmoConfig): Record<string, unknown> {
	const sanitized = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
	const providers = sanitized.providers as Record<string, Record<string, unknown>> | undefined;
	if (providers) {
		for (const provider of Object.values(providers)) {
			if ("apiKeyEnv" in provider) {
				delete provider.apiKeyEnv;
			}
		}
	}
	return sanitized;
}

// ---------------------------------------------------------------------------
// Create and save snapshots
// ---------------------------------------------------------------------------

export function createSnapshot(
	sessionId: string,
	registry: ToolRegistry,
	skillsRegistry: SkillsRegistry,
	config: BmoConfig,
): StateSnapshot {
	const now = new Date();
	const snapshotId = `${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${sessionId.slice(-4)}`;
	const tools = registry.listNames();
	const dynamicTools = registry.listDynamicNames();
	const skills = skillsRegistry.list().map((s) => s.name);

	return {
		snapshotId,
		createdAt: now.toISOString(),
		sessionId,
		toolInventory: tools,
		skillInventory: skills,
		config: sanitizeConfig(config),
		metrics: {
			totalTools: tools.length,
			builtinTools: tools.length - dynamicTools.length,
			dynamicTools: dynamicTools.length,
			totalSkills: skills.length,
		},
	};
}

export async function saveSnapshot(snapshotsDir: string, snapshot: StateSnapshot): Promise<void> {
	const filePath = join(snapshotsDir, `${snapshot.snapshotId}.json`);
	await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
}
