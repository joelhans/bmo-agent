import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { ensureDataDirs, resolvePaths } from "./paths.ts";
import { startTui } from "./tui.ts";

function generateSessionId(): string {
	const now = new Date();
	const date = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
	const rand = Math.random().toString(36).slice(2, 6);
	return `${date}-${rand}`;
}

async function main(): Promise<void> {
	const paths = resolvePaths();
	await ensureDataDirs(paths);
	const config = await loadConfig(paths);

	const sessionId = generateSessionId();
	const logger = createLogger(paths, sessionId);
	logger.info("bmo starting up");

	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		logger.warn("OPENAI_API_KEY not set — LLM features will be unavailable");
	}

	startTui(config, logger, sessionId);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
