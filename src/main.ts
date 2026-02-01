import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { ensureDataDirs, resolvePaths } from "./paths.ts";

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

	console.log("bmo v0.1.0");
	console.log("---");
	console.log(`  BMO_HOME:  ${paths.bmoHome}`);
	console.log(`  Data dir:  ${paths.dataDir}`);
	console.log(`  Config:    ${paths.configFile}`);
	console.log(`  Reasoning: ${config.models.reasoning}`);
	console.log(`  Coding:    ${config.models.coding}`);
	console.log(`  Gateway:   ${config.gateway.baseUrl}`);
	if (paths.bmoSource) {
		console.log(`  Source:    ${paths.bmoSource}`);
	}
	if (!apiKey) {
		console.log("");
		console.log("  WARNING: OPENAI_API_KEY is not set.");
		console.log("  Set it in your environment to enable LLM features.");
	}
	console.log("---");

	logger.info("banner printed, exiting cleanly");
	await logger.flush();

	// Phase 1+ will start the TUI here instead of exiting.
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
