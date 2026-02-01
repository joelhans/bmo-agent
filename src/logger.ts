import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedPaths } from "./paths.ts";

export interface Logger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	flush(): Promise<void>;
}

/**
 * Create a logger that writes timestamped lines to a session log file.
 * Micro-batched: multiple calls within the same microtask coalesce into one write.
 */
export function createLogger(paths: ResolvedPaths, sessionId: string): Logger {
	const logFile = join(paths.sessionsDir, `${sessionId}.log`);
	const buffer: string[] = [];
	let flushPromise: Promise<void> | null = null;

	function formatLine(level: string, message: string): string {
		return `[${new Date().toISOString()}] [${level}] ${message}\n`;
	}

	function scheduleFlush(): void {
		if (flushPromise) return;
		flushPromise = Promise.resolve().then(async () => {
			const lines = buffer.splice(0, buffer.length).join("");
			if (lines.length > 0) {
				await appendFile(logFile, lines, "utf-8");
			}
			flushPromise = null;
		});
	}

	return {
		info(message: string) {
			buffer.push(formatLine("INFO", message));
			scheduleFlush();
		},
		warn(message: string) {
			buffer.push(formatLine("WARN", message));
			scheduleFlush();
		},
		error(message: string) {
			buffer.push(formatLine("ERROR", message));
			scheduleFlush();
		},
		async flush() {
			scheduleFlush();
			if (flushPromise) {
				await flushPromise;
			}
		},
	};
}
