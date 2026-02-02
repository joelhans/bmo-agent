import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LearningEvent } from "./session.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallRecord {
	timestamp: string;
	toolName: string;
	durationMs: number;
	success: boolean;
}

export interface ToolStats {
	toolName: string;
	totalCalls: number;
	successCount: number;
	failureCount: number;
	totalDurationMs: number;
	avgDurationMs: number;
	lastUsed: string;
}

export interface TelemetryStore {
	updatedAt: string;
	toolStats: Record<string, ToolStats>;
	recentLearnings: Array<LearningEvent & { sessionId: string }>;
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

const TELEMETRY_FILE = "telemetry.json";

function emptyStore(): TelemetryStore {
	return { updatedAt: new Date().toISOString(), toolStats: {}, recentLearnings: [] };
}

export async function loadTelemetry(dataDir: string): Promise<TelemetryStore> {
	const filePath = join(dataDir, TELEMETRY_FILE);
	try {
		const raw = await readFile(filePath, "utf-8");
		return JSON.parse(raw) as TelemetryStore;
	} catch {
		return emptyStore();
	}
}

export async function saveTelemetry(dataDir: string, store: TelemetryStore): Promise<void> {
	store.updatedAt = new Date().toISOString();
	const filePath = join(dataDir, TELEMETRY_FILE);
	await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export function mergeToolCalls(store: TelemetryStore, records: ToolCallRecord[]): void {
	for (const rec of records) {
		let stats = store.toolStats[rec.toolName];
		if (!stats) {
			stats = {
				toolName: rec.toolName,
				totalCalls: 0,
				successCount: 0,
				failureCount: 0,
				totalDurationMs: 0,
				avgDurationMs: 0,
				lastUsed: rec.timestamp,
			};
			store.toolStats[rec.toolName] = stats;
		}

		stats.totalCalls++;
		if (rec.success) {
			stats.successCount++;
		} else {
			stats.failureCount++;
		}
		stats.totalDurationMs += rec.durationMs;
		stats.avgDurationMs = Math.round(stats.totalDurationMs / stats.totalCalls);
		if (rec.timestamp > stats.lastUsed) {
			stats.lastUsed = rec.timestamp;
		}
	}
}

const MAX_LEARNINGS = 100;

export function mergeLearnings(store: TelemetryStore, events: LearningEvent[], sessionId: string): void {
	for (const ev of events) {
		store.recentLearnings.push({ ...ev, sessionId });
	}
	if (store.recentLearnings.length > MAX_LEARNINGS) {
		store.recentLearnings = store.recentLearnings.slice(-MAX_LEARNINGS);
	}
}

// ---------------------------------------------------------------------------
// Format for system prompt
// ---------------------------------------------------------------------------

export function formatTelemetryForPrompt(store: TelemetryStore, verbose?: boolean): string {
	const entries = Object.values(store.toolStats);
	if (entries.length === 0 && store.recentLearnings.length === 0) {
		return "";
	}

	const lines: string[] = ["Tool telemetry"];

	// Sort by totalCalls descending
	entries.sort((a, b) => b.totalCalls - a.totalCalls);

	const toolEntries = verbose ? entries : entries.slice(0, 5);
	for (const s of toolEntries) {
		const okPct = s.totalCalls > 0 ? Math.round((s.successCount / s.totalCalls) * 100) : 0;
		lines.push(`  ${s.toolName}: ${s.totalCalls} calls, ${okPct}% ok, ~${s.avgDurationMs}ms avg`);
	}

	if (!verbose && entries.length > 5) {
		lines.push(`  ... and ${entries.length - 5} more tools`);
	}

	// Learnings summary
	if (store.recentLearnings.length > 0) {
		const corrections = store.recentLearnings.filter((l) => l.type === "correction").length;
		const preferences = store.recentLearnings.filter((l) => l.type === "preference").length;
		const patterns = store.recentLearnings.filter((l) => l.type === "pattern").length;

		const parts: string[] = [];
		if (corrections > 0) parts.push(`${corrections} corrections`);
		if (preferences > 0) parts.push(`${preferences} preferences`);
		if (patterns > 0) parts.push(`${patterns} patterns`);

		lines.push(`Recent learnings: ${store.recentLearnings.length} total (${parts.join(", ")})`);

		const displayCount = verbose ? 20 : 3;
		const recent = store.recentLearnings.slice(-displayCount);
		for (const l of recent) {
			lines.push(`  [${l.type}] ${l.description}`);
		}
	}

	return lines.join("\n");
}
