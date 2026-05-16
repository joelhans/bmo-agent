import { copyFile, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";

export const description = "Contribute a local tool or skill to the shared repo";

export const schema = {
	type: "object",
	properties: {
		type: {
			type: "string",
			enum: ["tool", "skill"],
			description: "Whether to contribute a tool or skill",
		},
		name: {
			type: "string",
			description: "Name of the tool or skill (without extension)",
		},
		message: {
			type: "string",
			description: "Optional commit message (default: 'Add <type> <name>')",
		},
	},
	required: ["type", "name"],
};

export const capabilities = {
	filesystem: true,
	subprocess: true,
};

/**
 * Run a git command and return stdout
 */
async function git(cwd, ...args) {
	return new Promise((resolve, reject) => {
		const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", d => stdout += d.toString());
		proc.stderr.on("data", d => stderr += d.toString());
		proc.on("close", code => {
			if (code === 0) resolve(stdout.trim());
			else reject(new Error(stderr.trim() || `git ${args[0]} failed with code ${code}`));
		});
	});
}

export async function run(args) {
	const { type, name, message } = args;
	const bmoHome = process.env.BMO_HOME;
	const bmoSource = process.env.BMO_SOURCE;

	if (!bmoHome) {
		return { ok: false, error: "BMO_HOME environment variable not set" };
	}

	if (!bmoSource) {
		return { ok: false, error: "BMO_SOURCE not configured. Cannot contribute without a repo." };
	}

	// Determine paths
	const ext = type === "tool" ? ".mjs" : ".md";
	const subdir = type === "tool" ? "tools" : "skills";
	const filename = name.endsWith(ext) ? name : `${name}${ext}`;
	
	const localPath = join(bmoHome, subdir, filename);
	const repoPath = join(bmoSource, subdir, filename);

	// Check local file exists
	try {
		await stat(localPath);
	} catch {
		return { ok: false, error: `Local ${type} not found: ${localPath}` };
	}

	// Check if it already exists in repo
	let isNew = false;
	try {
		await stat(repoPath);
	} catch {
		isNew = true;
	}

	// Read local content for diff display
	const content = await readFile(localPath, "utf-8");
	const lineCount = content.split("\n").length;

	// Copy file to repo
	await copyFile(localPath, repoPath);

	// Git add
	const relPath = join(subdir, filename);
	try {
		await git(bmoSource, "add", relPath);
	} catch (err) {
		return { ok: false, error: `git add failed: ${err.message}` };
	}

	// Check if there are staged changes
	let hasChanges = false;
	try {
		await git(bmoSource, "diff", "--cached", "--quiet");
	} catch {
		hasChanges = true;
	}

	if (!hasChanges) {
		return {
			ok: true,
			result: {
				action: "no_change",
				message: `${type} '${name}' is already identical in repo. Nothing to commit.`,
			},
		};
	}

	// Commit
	const commitMsg = message || `Add ${type}: ${name}`;
	try {
		await git(bmoSource, "commit", "-m", commitMsg);
	} catch (err) {
		return { ok: false, error: `git commit failed: ${err.message}` };
	}

	return {
		ok: true,
		result: {
			action: isNew ? "created" : "updated",
			type,
			name,
			filename,
			lineCount,
			commitMessage: commitMsg,
			nextStep: `To share, run: cd ${bmoSource} && git push`,
		},
	};
}
