import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface ResolvedPaths {
	bmoHome: string;
	dataDir: string;
	sessionsDir: string;
	snapshotsDir: string;
	summariesDir: string;
	configFile: string;
	bmoSource: string | null;
	toolsDir: string;
	skillsDir: string;
}

/**
 * Detect BMO_HOME when no env var is set.
 * Dev mode: import.meta.dir is src/, parent is the project root (has package.json).
 * Binary mode: import.meta.dir holds the compile-time path which won't exist
 * on the deployment machine, so existsSync fails and we fall back to dataDir.
 */
function defaultBmoHome(dataDir: string): string {
	const projectRoot = dirname(import.meta.dir);
	if (existsSync(join(projectRoot, "package.json"))) {
		return projectRoot;
	}
	return dataDir;
}

/**
 * Resolve all bmo paths from environment variables with auto-detection fallbacks.
 * Call ensureDataDirs() separately to create directories.
 */
export function resolvePaths(): ResolvedPaths {
	const dataDir = process.env.BMO_DATA || join(homedir(), ".local", "share", "bmo");
	const bmoHome = process.env.BMO_HOME || defaultBmoHome(dataDir);
	const bmoSource = process.env.BMO_SOURCE || null;

	return {
		bmoHome,
		dataDir,
		sessionsDir: join(dataDir, "sessions"),
		snapshotsDir: join(dataDir, "snapshots"),
		summariesDir: join(dataDir, "summaries"),
		configFile: join(dataDir, "config.json"),
		bmoSource,
		toolsDir: join(bmoHome, "tools"),
		skillsDir: join(bmoHome, "skills"),
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
