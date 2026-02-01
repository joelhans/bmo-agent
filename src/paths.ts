import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ResolvedPaths {
	bmoHome: string;
	dataDir: string;
	sessionsDir: string;
	snapshotsDir: string;
	summariesDir: string;
	configFile: string;
	bmoSource: string | null;
}

/**
 * Resolve all bmo paths from environment variables with fallbacks.
 * Pure function — no I/O. Call ensureDataDirs() separately to create directories.
 */
export function resolvePaths(): ResolvedPaths {
	const bmoHome = process.env.BMO_HOME || join(homedir(), "src", "bmo-agent");
	const dataDir = process.env.BMO_DATA || join(homedir(), ".local", "share", "bmo");
	const bmoSource = process.env.BMO_SOURCE || null;

	return {
		bmoHome,
		dataDir,
		sessionsDir: join(dataDir, "sessions"),
		snapshotsDir: join(dataDir, "snapshots"),
		summariesDir: join(dataDir, "summaries"),
		configFile: join(dataDir, "config.json"),
		bmoSource,
	};
}

/**
 * Create data directory and required subdirectories if they don't exist.
 * Safe to call repeatedly (recursive mkdir).
 */
export async function ensureDataDirs(paths: ResolvedPaths): Promise<void> {
	await mkdir(paths.sessionsDir, { recursive: true });
	await mkdir(paths.snapshotsDir, { recursive: true });
	await mkdir(paths.summariesDir, { recursive: true });
}

/**
 * Resolve a bmo:// prefixed path to an absolute path under BMO_HOME.
 * Non-bmo paths are returned unchanged.
 */
export function resolveBmoPath(bmoPath: string, bmoHome: string): string {
	const prefix = "bmo://";
	if (!bmoPath.startsWith(prefix)) {
		return bmoPath;
	}
	return join(bmoHome, bmoPath.slice(prefix.length));
}
