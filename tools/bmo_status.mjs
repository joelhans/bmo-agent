import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";

export const description = "Show what tools/skills are local-only vs shared in the repo";

export const schema = {
	type: "object",
	properties: {},
	required: [],
};

export const capabilities = {
	filesystem: "both",
	env: true,
};

/**
 * Get BMO paths from environment (handles both direct and sandbox modes)
 */
function getBmoPaths() {
	const bmoHome = process.env.BMO_HOME || process.env.BMO_SANDBOX_BMO_HOME;
	const bmoSource = process.env.BMO_SOURCE;
	return { bmoHome, bmoSource };
}

/**
 * Compare files in two directories and return differences
 */
async function compareDirs(localDir, repoDir, extension) {
	let localFiles = [];
	let repoFiles = [];

	try {
		const entries = await readdir(localDir);
		localFiles = entries.filter(f => f.endsWith(extension)).map(f => basename(f));
	} catch {
		// Directory doesn't exist or can't read
	}

	try {
		const entries = await readdir(repoDir);
		repoFiles = entries.filter(f => f.endsWith(extension)).map(f => basename(f));
	} catch {
		// Directory doesn't exist or can't read
	}

	const localSet = new Set(localFiles);
	const repoSet = new Set(repoFiles);

	const onlyLocal = localFiles.filter(f => !repoSet.has(f));
	const onlyRepo = repoFiles.filter(f => !localSet.has(f));

	return { onlyLocal, onlyRepo, localCount: localFiles.length, repoCount: repoFiles.length };
}

export async function run(args) {
	const { bmoHome, bmoSource } = getBmoPaths();

	if (!bmoHome) {
		return { ok: false, error: "BMO_HOME not available in environment" };
	}

	if (!bmoSource) {
		return {
			ok: true,
			result: {
				message: "BMO_SOURCE not configured. All tools/skills are local-only.",
				hasRepo: false,
				localTools: [],
				localSkills: [],
				repoTools: [],
				repoSkills: [],
			},
		};
	}

	const localToolsDir = join(bmoHome, "tools");
	const repoToolsDir = join(bmoSource, "tools");
	const localSkillsDir = join(bmoHome, "skills");
	const repoSkillsDir = join(bmoSource, "skills");

	const tools = await compareDirs(localToolsDir, repoToolsDir, ".mjs");
	const skills = await compareDirs(localSkillsDir, repoSkillsDir, ".md");

	const hasLocalChanges = tools.onlyLocal.length > 0 || skills.onlyLocal.length > 0;
	const hasRepoChanges = tools.onlyRepo.length > 0 || skills.onlyRepo.length > 0;

	let summary = "";
	if (!hasLocalChanges && !hasRepoChanges) {
		summary = "✓ In sync with repo";
	} else {
		const parts = [];
		if (tools.onlyLocal.length > 0) {
			parts.push(`${tools.onlyLocal.length} local-only tool(s)`);
		}
		if (skills.onlyLocal.length > 0) {
			parts.push(`${skills.onlyLocal.length} local-only skill(s)`);
		}
		if (tools.onlyRepo.length > 0) {
			parts.push(`${tools.onlyRepo.length} repo tool(s) not pulled`);
		}
		if (skills.onlyRepo.length > 0) {
			parts.push(`${skills.onlyRepo.length} repo skill(s) not pulled`);
		}
		summary = parts.join(", ");
	}

	return {
		ok: true,
		result: {
			summary,
			hasRepo: true,
			tools: {
				local: tools.localCount,
				repo: tools.repoCount,
				onlyLocal: tools.onlyLocal,
				onlyRepo: tools.onlyRepo,
			},
			skills: {
				local: skills.localCount,
				repo: skills.repoCount,
				onlyLocal: skills.onlyLocal,
				onlyRepo: skills.onlyRepo,
			},
		},
	};
}
