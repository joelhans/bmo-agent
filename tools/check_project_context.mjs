/**
 * Check if AGENTS.md or CLAUDE.md has been modified since session start
 * and offer to reload it into the context.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const description = 
	"Check if AGENTS.md or CLAUDE.md in the working directory has been modified " +
	"since the session started. Returns file content if changed, or indicates no changes.";

export const schema = {
	type: "object",
	properties: {
		sessionStartTime: {
			type: "string",
			description: "ISO timestamp when the session started (use session.startedAt)",
		},
	},
	required: ["sessionStartTime"],
};

export async function run(args) {
	const { sessionStartTime } = args;
	const sessionStart = new Date(sessionStartTime);
	const cwd = process.cwd();

	// Check both files in order
	for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
		const filePath = join(cwd, filename);
		
		try {
			const stats = await stat(filePath);
			const mtime = new Date(stats.mtime);

			// File was modified after session start
			if (mtime > sessionStart) {
				const content = await readFile(filePath, "utf-8");
				return {
					ok: true,
					result: `${filename} was modified after session start.\n\n` +
						`Modified: ${mtime.toISOString()}\n` +
						`Session started: ${sessionStart.toISOString()}\n\n` +
						`Current content:\n\n${content}\n\n` +
						`You should update the system prompt with this new context.`,
				};
			}

			// File exists but hasn't changed
			return {
				ok: true,
				result: `${filename} exists but has not been modified since session start.\n` +
					`Modified: ${mtime.toISOString()}\n` +
					`Session started: ${sessionStart.toISOString()}`,
			};

		} catch (err) {
			// File doesn't exist, try next
			continue;
		}
	}

	// Neither file found
	return {
		ok: true,
		result: "No AGENTS.md or CLAUDE.md found in working directory.",
	};
}
