// Self-invocation: sandbox runner mode (must be checked before other imports
// so the compiled binary can act as its own sandbox subprocess)
if (process.argv.includes("--sandbox-runner")) {
	const { runSandboxMain } = await import("./sandbox-runner.ts");
	await runSandboxMain();
	process.exit(0);
}

import { loadConfig } from "./config.ts";
import { createLlmClient } from "./llm.ts";
import { createLogger } from "./logger.ts";
import { ensureDataDirs, resolvePaths, resolveSourceDir } from "./paths.ts";
import { createSecretMasker } from "./secrets.ts";
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
	let paths = resolvePaths();
	await ensureDataDirs(paths);
	const config = await loadConfig(paths);

	// Merge config.sourceDir into paths (env var BMO_SOURCE overrides config)
	paths = resolveSourceDir(paths, config.sourceDir);

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
	const masker = createSecretMasker(config);
	const logger = createLogger(paths, sessionId, masker);
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

main().catch((err: unknown) => {
	const msg = err instanceof Error ? err.message : String(err);

	// Helpful hints for common failures
	if (msg.includes("API key") || msg.includes("apiKeyEnv") || /[A-Z_]+_API_KEY/.test(msg)) {
		console.error(`Fatal: ${msg}`);
		console.error("Hint: set the required API key environment variable before starting bmo.");
	} else if (msg.includes("JSON") && msg.includes("config")) {
		console.error(`Fatal: failed to parse config.json — ${msg}`);
		console.error("Hint: delete ~/.local/share/bmo/config.json to regenerate defaults.");
	} else {
		console.error(`Fatal error: ${msg}`);
	}

	process.exit(1);
});
