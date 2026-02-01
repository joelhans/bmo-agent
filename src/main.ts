import { loadConfig } from "./config.ts";
import { createLlmClient } from "./llm.ts";
import { createLogger } from "./logger.ts";
import { ensureDataDirs, resolvePaths } from "./paths.ts";
import { formatSessionList, listSessions, loadSession } from "./session.ts";
import { startTui } from "./tui.ts";

function generateSessionId(): string {
	const now = new Date();
	const date = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
	const rand = Math.random().toString(36).slice(2, 6);
	return `${date}-${rand}`;
}

function parseCliArgs(): { listSessions: boolean; resumeSessionId: string | null } {
	const args = process.argv.slice(2);
	let list = false;
	let resumeId: string | null = null;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--sessions") {
			list = true;
		} else if (args[i] === "--session" && i + 1 < args.length) {
			resumeId = args[i + 1] ?? null;
			i++;
		}
	}

	return { listSessions: list, resumeSessionId: resumeId };
}

async function main(): Promise<void> {
	const cliArgs = parseCliArgs();
	const paths = resolvePaths();
	await ensureDataDirs(paths);
	const config = await loadConfig(paths);

	// --sessions: list and exit (no TUI needed)
	if (cliArgs.listSessions) {
		const sessions = await listSessions(paths.sessionsDir);
		if (sessions.length === 0) {
			console.log("No sessions found.");
		} else {
			console.log(formatSessionList(sessions));
		}
		process.exit(0);
	}

	const sessionId = cliArgs.resumeSessionId ?? generateSessionId();
	const logger = createLogger(paths, sessionId);
	logger.info("bmo starting up");

	for (const [name, provider] of Object.entries(config.providers)) {
		if (!process.env[provider.apiKeyEnv]) {
			logger.warn(`${provider.apiKeyEnv} not set — provider "${name}" unavailable`);
		}
	}

	const llm = createLlmClient(config);

	// Load resumed session if --session was provided
	let resumedSession: import("./session.ts").SessionData | undefined;
	if (cliArgs.resumeSessionId) {
		const loaded = await loadSession(paths.sessionsDir, cliArgs.resumeSessionId);
		if (!loaded) {
			console.error(`Session not found: ${cliArgs.resumeSessionId}`);
			process.exit(1);
		}
		resumedSession = loaded;
		logger.info(`resuming session ${cliArgs.resumeSessionId}`);
	}

	await startTui({ config, logger, sessionId, llm, sessionsDir: paths.sessionsDir, paths, resumedSession });
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
