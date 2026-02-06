import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage } from "./llm.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningEvent {
	timestamp: string;
	type: "correction" | "preference" | "pattern";
	description: string;
	context: string;
}

export interface SessionData {
	id: string;
	startedAt: string;
	lastActiveAt: string;
	workingDirectory: string;
	model: string;
	messages: ChatMessage[];
	usage: {
		totalPromptTokens: number;
		totalCompletionTokens: number;
		totalCost: number;
	};
	reflection: string | null;
	learningEvents?: LearningEvent[];
	skillsLoaded?: string[];
}

export interface SessionSummary {
	id: string;
	lastActiveAt: string;
	totalCost: number;
	firstUserMessage: string;
}

// ---------------------------------------------------------------------------
// Save / Load
// ---------------------------------------------------------------------------

export async function saveSession(sessionsDir: string, session: SessionData): Promise<void> {
	const filePath = join(sessionsDir, `${session.id}.json`);
	await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
}

export async function loadSession(sessionsDir: string, id: string): Promise<SessionData | null> {
	const filePath = join(sessionsDir, `${id}.json`);
	try {
		const raw = await readFile(filePath, "utf-8");
		return JSON.parse(raw) as SessionData;
	} catch (err: unknown) {
		if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw err;
	}
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listSessions(sessionsDir: string, limit = 20): Promise<SessionSummary[]> {
	let entries: string[];
	try {
		entries = await readdir(sessionsDir);
	} catch {
		return [];
	}

	const jsonFiles = entries.filter((e) => e.endsWith(".json"));
	const summaries: SessionSummary[] = [];

	for (const file of jsonFiles) {
		try {
			const raw = await readFile(join(sessionsDir, file), "utf-8");
			const data = JSON.parse(raw) as SessionData;
			const firstUser = data.messages.find((m) => m.role === "user");
			let preview = firstUser?.content ?? "(empty)";
			if (preview.length > 60) {
				preview = `${preview.slice(0, 60)}...`;
			}
			summaries.push({
				id: data.id,
				lastActiveAt: data.lastActiveAt,
				totalCost: data.usage.totalCost,
				firstUserMessage: preview,
			});
		} catch {
			// Skip malformed files
		}
	}

	summaries.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
	return summaries.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

export function formatSessionList(sessions: SessionSummary[]): string {
	if (sessions.length === 0) {
		return "No recent sessions.";
	}

	const lines = ["Recent sessions:"];
	for (const s of sessions) {
		const date = s.lastActiveAt.slice(0, 16).replace("T", " ");
		const cost = `$${s.totalCost.toFixed(2)}`;
		lines.push(`  ${s.id}  ${date}  ${cost}  ${s.firstUserMessage}`);
	}
	return lines.join("\n");
}
