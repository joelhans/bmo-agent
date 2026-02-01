import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionData } from "./session.ts";
import { formatSessionList, listSessions, loadSession, saveSession } from "./session.ts";

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
	return {
		id: "20260201120000-test",
		startedAt: "2026-02-01T12:00:00.000Z",
		lastActiveAt: "2026-02-01T12:05:00.000Z",
		workingDirectory: "/tmp/test",
		model: "openai/gpt-4o",
		messages: [{ role: "system", content: "You are bmo." }],
		usage: { totalPromptTokens: 0, totalCompletionTokens: 0, totalCost: 0 },
		reflection: null,
		...overrides,
	};
}

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "bmo-session-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("saveSession", () => {
	test("writes a JSON file to sessionsDir", async () => {
		const session = makeSession();
		await saveSession(tempDir, session);
		const raw = await readFile(join(tempDir, `${session.id}.json`), "utf-8");
		const parsed = JSON.parse(raw);
		expect(parsed.id).toBe(session.id);
		expect(parsed.messages).toHaveLength(1);
	});

	test("overwrites existing session file", async () => {
		const session = makeSession();
		await saveSession(tempDir, session);
		session.messages.push({ role: "user", content: "hello" });
		await saveSession(tempDir, session);
		const raw = await readFile(join(tempDir, `${session.id}.json`), "utf-8");
		const parsed = JSON.parse(raw);
		expect(parsed.messages).toHaveLength(2);
	});
});

describe("loadSession", () => {
	test("returns SessionData for existing session", async () => {
		const session = makeSession();
		await saveSession(tempDir, session);
		const loaded = await loadSession(tempDir, session.id);
		expect(loaded).not.toBeNull();
		expect(loaded?.id).toBe(session.id);
	});

	test("returns null for nonexistent session", async () => {
		const loaded = await loadSession(tempDir, "nonexistent-id");
		expect(loaded).toBeNull();
	});

	test("preserves messages exactly", async () => {
		const session = makeSession({
			messages: [
				{ role: "system", content: "sys" },
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "hi there" },
			],
		});
		await saveSession(tempDir, session);
		const loaded = await loadSession(tempDir, session.id);
		expect(loaded?.messages).toEqual(session.messages);
	});

	test("preserves usage stats exactly", async () => {
		const session = makeSession({
			usage: { totalPromptTokens: 1234, totalCompletionTokens: 567, totalCost: 0.89 },
		});
		await saveSession(tempDir, session);
		const loaded = await loadSession(tempDir, session.id);
		expect(loaded?.usage.totalPromptTokens).toBe(1234);
		expect(loaded?.usage.totalCompletionTokens).toBe(567);
		expect(loaded?.usage.totalCost).toBeCloseTo(0.89, 4);
	});

	test("preserves reflection when present", async () => {
		const session = makeSession({ reflection: "This went well." });
		await saveSession(tempDir, session);
		const loaded = await loadSession(tempDir, session.id);
		expect(loaded?.reflection).toBe("This went well.");
	});

	test("preserves null reflection", async () => {
		const session = makeSession({ reflection: null });
		await saveSession(tempDir, session);
		const loaded = await loadSession(tempDir, session.id);
		expect(loaded?.reflection).toBeNull();
	});
});

describe("listSessions", () => {
	test("returns empty array for empty directory", async () => {
		const sessions = await listSessions(tempDir);
		expect(sessions).toEqual([]);
	});

	test("returns sessions sorted by lastActiveAt descending", async () => {
		await saveSession(tempDir, makeSession({ id: "old", lastActiveAt: "2026-01-01T00:00:00.000Z" }));
		await saveSession(tempDir, makeSession({ id: "new", lastActiveAt: "2026-02-01T00:00:00.000Z" }));
		await saveSession(tempDir, makeSession({ id: "mid", lastActiveAt: "2026-01-15T00:00:00.000Z" }));
		const sessions = await listSessions(tempDir);
		expect(sessions.map((s) => s.id)).toEqual(["new", "mid", "old"]);
	});

	test("respects limit parameter", async () => {
		for (let i = 0; i < 5; i++) {
			await saveSession(tempDir, makeSession({ id: `s${i}`, lastActiveAt: `2026-01-0${i + 1}T00:00:00.000Z` }));
		}
		const sessions = await listSessions(tempDir, 2);
		expect(sessions).toHaveLength(2);
	});

	test("extracts first user message as preview", async () => {
		await saveSession(
			tempDir,
			makeSession({
				id: "with-msg",
				messages: [
					{ role: "system", content: "sys" },
					{ role: "user", content: "How do I fix the bug?" },
				],
			}),
		);
		const sessions = await listSessions(tempDir);
		expect(sessions[0].firstUserMessage).toBe("How do I fix the bug?");
	});

	test("truncates long first user messages", async () => {
		const longMessage = "a".repeat(200);
		await saveSession(
			tempDir,
			makeSession({
				id: "long-msg",
				messages: [
					{ role: "system", content: "sys" },
					{ role: "user", content: longMessage },
				],
			}),
		);
		const sessions = await listSessions(tempDir);
		expect(sessions[0].firstUserMessage).toBe(`${"a".repeat(60)}...`);
	});

	test("shows (empty) when no user messages", async () => {
		await saveSession(tempDir, makeSession({ id: "no-user" }));
		const sessions = await listSessions(tempDir);
		expect(sessions[0].firstUserMessage).toBe("(empty)");
	});

	test("ignores .log files in sessionsDir", async () => {
		await writeFile(join(tempDir, "test.log"), "log content", "utf-8");
		await saveSession(tempDir, makeSession({ id: "real-session" }));
		const sessions = await listSessions(tempDir);
		expect(sessions).toHaveLength(1);
		expect(sessions[0].id).toBe("real-session");
	});
});

describe("formatSessionList", () => {
	test("returns no-sessions message for empty list", () => {
		expect(formatSessionList([])).toBe("No recent sessions.");
	});

	test("formats sessions as readable table", () => {
		const output = formatSessionList([
			{
				id: "20260201120000-a1b2",
				lastActiveAt: "2026-02-01T12:30:00.000Z",
				totalCost: 0.45,
				firstUserMessage: "How do I fix the bug?",
			},
		]);
		expect(output).toContain("Recent sessions:");
		expect(output).toContain("20260201120000-a1b2");
		expect(output).toContain("$0.45");
		expect(output).toContain("How do I fix the bug?");
	});
});
