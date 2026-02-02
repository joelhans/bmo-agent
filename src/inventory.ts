import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillsRegistry } from "./skills.ts";
import type { ToolRegistry } from "./tools.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapabilityInventory {
	generatedAt: string;
	tools: string[];
	skills: string[];
	knownLimitations: string[];
	recentChanges: string[];
}

// ---------------------------------------------------------------------------
// Static known limitations
// ---------------------------------------------------------------------------

const KNOWN_LIMITATIONS: string[] = [
	"sandbox filesystem enforcement is advisory",
	"no external tool descriptor support yet",
];

// ---------------------------------------------------------------------------
// Generate inventory from live registries
// ---------------------------------------------------------------------------

/**
 * Build a capability inventory from the current tool and skills registries.
 * Recent changes are parsed from the last 5 entries of IMPROVEMENTS.md (graceful if missing).
 */
export async function generateInventory(
	registry: ToolRegistry,
	skillsRegistry: SkillsRegistry,
	bmoHome: string,
): Promise<CapabilityInventory> {
	const tools = registry.listNames();
	const skills = skillsRegistry.list().map((s) => s.name);
	const recentChanges = await parseRecentChanges(bmoHome);

	return {
		generatedAt: new Date().toISOString(),
		tools,
		skills,
		knownLimitations: [...KNOWN_LIMITATIONS],
		recentChanges,
	};
}

// ---------------------------------------------------------------------------
// Parse recent changes from IMPROVEMENTS.md
// ---------------------------------------------------------------------------

async function parseRecentChanges(bmoHome: string): Promise<string[]> {
	const improvementsPath = join(bmoHome, "docs", "IMPROVEMENTS.md");
	let content: string;
	try {
		content = await readFile(improvementsPath, "utf-8");
	} catch {
		return [];
	}

	if (!content.trim()) return [];

	// Each entry starts with "## " heading. Extract last 5.
	// First element of split is text before the first "## ", so drop it.
	const parts = content.split(/^## /m);
	const entries = parts.slice(1).filter((e) => e.trim());
	const recent = entries.slice(-5);
	return recent.map((entry) => {
		const firstLine = entry.split("\n")[0].trim();
		return firstLine;
	});
}

// ---------------------------------------------------------------------------
// Format for system prompt
// ---------------------------------------------------------------------------

/**
 * Format a capability inventory as a compact text block for inclusion in the system prompt.
 */
export function formatInventoryForPrompt(inv: CapabilityInventory): string {
	const builtinCount = inv.tools.filter((t) =>
		[
			"run_command",
			"load_skill",
			"reload_tools",
			"complete_maintenance",
			"save_snapshot",
			"log_learning_event",
		].includes(t),
	).length;
	const dynamicCount = inv.tools.length - builtinCount;

	let toolLine = `Tools (${builtinCount} built-in`;
	if (dynamicCount > 0) {
		toolLine += `, ${dynamicCount} dynamic`;
	}
	toolLine += `): ${inv.tools.join(", ")}`;

	const lines = [`Capability inventory (auto-generated)`, toolLine];

	if (inv.skills.length > 0) {
		lines.push(`Skills (${inv.skills.length}): ${inv.skills.join(", ")}`);
	} else {
		lines.push("Skills: none");
	}

	if (inv.knownLimitations.length > 0) {
		lines.push(`Known limitations: ${inv.knownLimitations.join(", ")}`);
	}

	if (inv.recentChanges.length > 0) {
		lines.push(`Recent changes: ${inv.recentChanges.join("; ")}`);
	}

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function saveInventory(dataDir: string, inv: CapabilityInventory): Promise<void> {
	const filePath = join(dataDir, "inventory.json");
	await writeFile(filePath, `${JSON.stringify(inv, null, 2)}\n`, "utf-8");
}

export async function loadInventory(dataDir: string): Promise<CapabilityInventory | null> {
	const filePath = join(dataDir, "inventory.json");
	try {
		const raw = await readFile(filePath, "utf-8");
		return JSON.parse(raw) as CapabilityInventory;
	} catch {
		return null;
	}
}
