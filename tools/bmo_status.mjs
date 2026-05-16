import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";

export const description = "Show what tools/skills are local-only vs shared in the repo";

export const schema = {
	type: "object",
	properties: {},
	required: [],
};

export const capabilities = {
	filesystem: true,
};

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

	return { onlyLocal, onlyRepo };
}

export async function run(args) {
	const bmoHome = process.env.BMO_HOME;
	const bmoSource = process.env.BMO_SOURCE;

	if (!bmoHome) {
		return { ok: false, error: "BMO_HOME environment variable not set" };
	}

	if (!bmoSource) {
		return {
			ok: true,
			result: {
				message: "BMO_SOURCE not configured. All tools/skills are local-only.",
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

	let message = "";
	if (!hasLocalChanges && !hasRepoChanges) {
		message = "✓ Your bmo is in sync with the repo.";
	} else {
		const parts = [];
		if (hasLocalChanges) {
			parts.push("You have local changes not in the repo.");
		}
		if (hasRepoChanges) {
			parts.push("The repo has updates you haven't pulled.");
		}
		message = parts.join(" ");
	}

	return {
		ok: true,
		result: {
			message,
			localTools: tools.onlyLocal,
			localSkills: skills.onlyLocal,
			repoTools: tools.onlyRepo,
			repoSkills: skills.onlyRepo,
		},
	};
}
