import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDefinition, ToolResult } from "./tools.ts";

// ---------------------------------------------------------------------------
// YAML front-matter parser (minimal, no dependency)
// ---------------------------------------------------------------------------

export interface SkillFrontMatter {
	name: string;
	description: string;
	triggers: string[];
}

/**
 * Parse YAML front-matter from a markdown string.
 * Expects --- delimiters. Supports: key: value, key: [a, b, c].
 * Returns null if no valid front-matter found or name is missing.
 */
export function parseFrontMatter(content: string): { meta: SkillFrontMatter; body: string } | null {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return null;

	const yamlBlock = match[1];
	const body = match[2];
	const fields: Record<string, string | string[]> = {};

	for (const line of yamlBlock.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim();
		const value = trimmed.slice(colonIdx + 1).trim();

		if (value.startsWith("[") && value.endsWith("]")) {
			const inner = value.slice(1, -1);
			fields[key] = inner
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		} else {
			fields[key] = value;
		}
	}

	const name = typeof fields.name === "string" ? fields.name : null;
	if (!name) return null;

	const description = typeof fields.description === "string" ? fields.description : "";
	const triggers = Array.isArray(fields.triggers) ? fields.triggers : [];

	return { meta: { name, description, triggers }, body };
}

// ---------------------------------------------------------------------------
// Skills registry
// ---------------------------------------------------------------------------

export interface SkillEntry {
	name: string;
	description: string;
	triggers: string[];
	filePath: string;
}

export interface SkillsRegistry {
	/** Scan skillsDir and index all *.md files with valid front-matter. */
	scan(): Promise<void>;
	/** Get metadata for all indexed skills. */
	list(): SkillEntry[];
	/** Load the full content of a skill by name. Returns null if not found. */
	loadContent(name: string): Promise<string | null>;
}

export function createSkillsRegistry(skillsDir: string): SkillsRegistry {
	const skills = new Map<string, SkillEntry>();

	return {
		async scan() {
			skills.clear();

			let entries: string[];
			try {
				entries = await readdir(skillsDir);
			} catch {
				return;
			}

			for (const entry of entries) {
				if (!entry.endsWith(".md")) continue;

				const filePath = join(skillsDir, entry);
				try {
					const content = await readFile(filePath, "utf-8");
					const parsed = parseFrontMatter(content);
					if (!parsed) continue;

					skills.set(parsed.meta.name, {
						name: parsed.meta.name,
						description: parsed.meta.description,
						triggers: parsed.meta.triggers,
						filePath,
					});
				} catch {
					// Skip unreadable files
				}
			}
		},

		list() {
			return [...skills.values()];
		},

		async loadContent(name) {
			const skill = skills.get(name);
			if (!skill) return null;

			try {
				return await readFile(skill.filePath, "utf-8");
			} catch {
				return null;
			}
		},
	};
}

// ---------------------------------------------------------------------------
// load_skill tool
// ---------------------------------------------------------------------------

export interface LoadSkillToolOptions {
	/** Called when a skill is successfully loaded. */
	onSkillLoaded?: (name: string) => void;
}

export function createLoadSkillTool(skillsRegistry: SkillsRegistry, options?: LoadSkillToolOptions): ToolDefinition {
	return {
		name: "load_skill",
		description:
			"Load a skill document into the conversation context. " +
			"Takes a skill name; returns the full markdown content. " +
			"Call with an invalid name to see available skills.",
		parameters: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description: "The skill name to load",
				},
			},
			required: ["name"],
		},
		async execute(args): Promise<ToolResult> {
			const name = args.name as string;
			const content = await skillsRegistry.loadContent(name);

			if (content !== null) {
				options?.onSkillLoaded?.(name);
				return { output: content };
			}

			const available = skillsRegistry.list();
			if (available.length === 0) {
				return {
					output: `Skill "${name}" not found. No skills are currently available.`,
					isError: true,
				};
			}

			const skillList = available.map((s) => `  - ${s.name}: ${s.description}`).join("\n");
			return {
				output: `Skill "${name}" not found. Available skills:\n${skillList}`,
				isError: true,
			};
		},
	};
}
