import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type AgentDisplay, runAgentLoop } from "./agent-loop.ts";
import { type BmoConfig, saveConfig } from "./config.ts";
import { createSessionTracker } from "./context.ts";
import { pullDocsFromSource, pushDocsToSource } from "./doc-sync.ts";
import { formatInventoryForPrompt, generateInventory, saveInventory } from "./inventory.ts";
import type { ChatMessage, LlmClient } from "./llm.ts";
import type { Logger } from "./logger.ts";
import type { ResolvedPaths } from "./paths.ts";
import { assembleSystemPrompt } from "./prompt.ts";
import type { SandboxConfig } from "./sandbox.ts";
import { createSecretMasker } from "./secrets.ts";
import type { LearningEvent, SessionData } from "./session.ts";
import { saveSession } from "./session.ts";
import { createLoadSkillTool, createSkillsRegistry } from "./skills.ts";
import { createSnapshot, saveSnapshot } from "./snapshots.ts";
import {
	formatTelemetryForPrompt,
	loadTelemetry,
	mergeLearnings,
	mergeToolCalls,
	saveTelemetry,
	type ToolCallRecord,
} from "./telemetry.ts";
import { createReloadToolsTool, formatLoadResult, initialLoad } from "./tool-loader.ts";
import { createRunCommandTool, createToolRegistry } from "./tools.ts";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[39m`;

// ---------------------------------------------------------------------------
// ConsoleDisplay — non-interactive AgentDisplay for maintenance runs
// ---------------------------------------------------------------------------

class ConsoleDisplay implements AgentDisplay {
	addMessage(_role: "user" | "assistant" | "system", content: string): void {
		console.log(content);
	}

	beginAssistantMessage(): void {
		// noop
	}

	appendToAssistantMessage(text: string): void {
		process.stdout.write(text);
	}

	addToolCall(summary: string): void {
		console.log(dim(`  [tool] ${summary}`));
	}

	addSkillLoaded(name: string): void {
		console.log(`\x1b[35m  [skill] ${name} loaded\x1b[39m`);
	}

	addToolResult(result: string, isError?: boolean): void {
		if (isError) {
			console.log(red(result));
		} else {
			const lines = result.split("\n");
			const preview =
				lines.length > 5 ? `${lines.slice(0, 5).join("\n")}\n  ... (${lines.length - 5} more lines)` : result;
			console.log(dim(preview));
		}
	}

	setStatus(_text: string): void {
		// noop
	}

	setInputEnabled(_enabled: boolean): void {
		// noop
	}
}

// ---------------------------------------------------------------------------
// Maintenance instructions
// ---------------------------------------------------------------------------

const MAINTENANCE_MESSAGE = `Run a full improvement cycle. This has five phases.

## Phase 1: Analyze
1. Review recent session reflections -- list *.json files in the sessions directory (ignore *.log files), read the 10 most recent session JSONs (matching the maintenance threshold), and look at the "reflection" field in each. Summarize patterns across reflections.
2. Check IMPROVEMENTS.md for hypotheses that can be validated or invalidated.
3. Scan learning events from the same session JSON files -- each may contain a "learningEvents" array with objects like {type, description, context}. Look for recurring corrections or patterns.
4. Review the tool telemetry section in the system prompt -- note any tools with high failure rates or unusually slow execution times.

## Phase 2: Distill working memory
5. Based on everything gathered in Phase 1 (reflections, learning events, telemetry, and any existing WORKING_MEMORY.md), generate or regenerate the file docs/WORKING_MEMORY.md at BMO_HOME.
   - This file is NOT append-only -- overwrite it entirely each maintenance pass.
   - Keep it compact (under 150 lines).
   - Use run_command to write the file via heredoc.
   - Format:

# Working Memory
Generated: <ISO timestamp>

## Active Preferences
- <bullet list of user preferences observed across sessions>

## Common Pitfalls
- <bullet list of recurring mistakes or corrections>

## Recurring Patterns
- <bullet list of task patterns, workflow shapes, or domain knowledge>

## Key Insights
- <bullet list of high-value learnings that should inform every session>

## Tool & Skill Notes
- <notes on which tools/skills work well, which are fragile, tips for effective use>

## Phase 3: Generate skills from learnings
6. Review learning events gathered in Phase 1. When you find 3 or more related corrections, preferences, or patterns on the same topic, create a skill file that codifies that knowledge.
   - Write .md files to BMO_HOME/skills/ using run_command (heredoc).
   - Follow the skills format: YAML front-matter with name, description, triggers (keyword list), then markdown body with when-to-use, best practices, examples, pitfalls.
   - After creating any skills, call reload_tools to re-index.
   - If no cluster of 3+ related learnings exists, skip this phase and note it in your summary.
   - Do NOT create skills that duplicate existing ones -- check the available skills list first.

## Phase 4: Act on opportunities
7. Read OPPORTUNITIES.md. Identify items that are Status: todo, Impact: High or Medium, Effort: S.
   Pick up to 2 such items per maintenance pass to avoid scope creep.
8. For each chosen item, implement it:
   - New tool: write a .mjs file to BMO_HOME/tools/ via run_command. Call reload_tools and verify by calling the tool directly.
   - New skill: write a .md file to BMO_HOME/skills/ via run_command. Call reload_tools.
   - Other change: do it via run_command.
   - Log each improvement to IMPROVEMENTS.md with the standard entry template.
9. Update the status of acted-on items in OPPORTUNITIES.md from "todo" to "done".
10. If no suitable items exist, skip this phase and note it.

## Phase 5: Wrap up
11. Update OPPORTUNITIES.md with any new actionable findings from this cycle.
12. Append an entry to EXPERIMENT.md (date, session range, tool/skill delta, hypothesis scorecard, key metrics, narrative).
13. Call complete_maintenance with a summary covering: what was analyzed, what working memory captured, any skills generated, any opportunities acted on, and what changed.`;

// ---------------------------------------------------------------------------
// runMaintenance
// ---------------------------------------------------------------------------

export interface MaintenanceOptions {
	config: BmoConfig;
	logger: Logger;
	sessionId: string;
	llm: LlmClient;
	paths: ResolvedPaths;
}

export interface MaintenanceResult {
	success: boolean;
	summary: string;
	cost: number;
}

export async function runMaintenance(opts: MaintenanceOptions): Promise<MaintenanceResult> {
	const { config, logger, sessionId, llm, paths } = opts;

	logger.info("Starting maintenance pass");

	const masker = createSecretMasker(config);

	// Tool registry with built-ins
	const registry = createToolRegistry();
	registry.register(createRunCommandTool(config, masker), { builtin: true });

	const sandboxConfig: SandboxConfig = {
		defaultTimeoutMs: config.sandbox.defaultTimeoutMs,
		memoryLimitMb: config.sandbox.memoryLimitMb,
		outputLimitBytes: config.sandbox.outputLimitBytes,
		projectDir: process.cwd(),
		bmoHome: paths.bmoHome,
	};

	const skillsRegistry = createSkillsRegistry(paths.skillsDir);

	registry.register(createLoadSkillTool(skillsRegistry), { builtin: true });
	registry.register(
		createReloadToolsTool(paths.toolsDir, registry, skillsRegistry, sandboxConfig, {
			skillsDir: paths.skillsDir,
			bmoSource: paths.bmoSource,
			docsDir: paths.docsDir,
		}),
		{ builtin: true },
	);

	// Initial tool/skill scan
	const loadResult = await initialLoad(paths.toolsDir, registry, skillsRegistry, sandboxConfig);
	const loadSummary = formatLoadResult(loadResult, skillsRegistry.list().length);
	logger.info(`Maintenance tool load: ${loadSummary}`);

	// Learning events accumulator
	const learningEvents: LearningEvent[] = [];

	// complete_maintenance tool
	let maintenanceSummary = "";
	registry.register(
		{
			name: "complete_maintenance",
			description:
				"Mark a maintenance pass as complete. Resets the session counter and records the date. " +
				"Also saves a state snapshot. Call this after finishing an introspection/maintenance pass.",
			parameters: {
				type: "object",
				properties: {
					summary: {
						type: "string",
						description: "Brief summary of what was done during maintenance",
					},
				},
				required: ["summary"],
			},
			async execute(args) {
				const summary = args.summary as string;
				maintenanceSummary = summary;
				config.maintenance.sessionsSinceLastMaintenance = 0;
				config.maintenance.lastMaintenanceDate = new Date().toISOString();
				await saveConfig(paths, config);

				try {
					const snapshot = createSnapshot(sessionId, registry, skillsRegistry, config);
					await saveSnapshot(paths.snapshotsDir, snapshot);
					return {
						output: `Maintenance complete. Counter reset, date recorded. Snapshot saved: ${snapshot.snapshotId}. Summary: ${summary}`,
					};
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : String(err);
					return {
						output: `Maintenance complete. Counter reset, date recorded. Snapshot failed: ${msg}. Summary: ${summary}`,
					};
				}
			},
		},
		{ builtin: true },
	);

	// save_snapshot tool
	registry.register(
		{
			name: "save_snapshot",
			description: "Save a state snapshot capturing current tools, skills, config (sanitized), and metrics.",
			parameters: {
				type: "object",
				properties: {},
			},
			async execute() {
				const snapshot = createSnapshot(sessionId, registry, skillsRegistry, config);
				await saveSnapshot(paths.snapshotsDir, snapshot);
				return {
					output: `Snapshot saved: ${snapshot.snapshotId} (${snapshot.metrics.totalTools} tools, ${snapshot.metrics.totalSkills} skills)`,
				};
			},
		},
		{ builtin: true },
	);

	// log_learning_event tool
	registry.register(
		{
			name: "log_learning_event",
			description:
				"Record a structured learning event from user interactions. " +
				"Call when detecting corrections, preferences, or recurring patterns.",
			parameters: {
				type: "object",
				properties: {
					type: {
						type: "string",
						enum: ["correction", "preference", "pattern"],
						description: "Type of learning event",
					},
					description: {
						type: "string",
						description: "What was learned",
					},
					context: {
						type: "string",
						description: "Context in which this was observed",
					},
				},
				required: ["type", "description", "context"],
			},
			async execute(args) {
				const event: LearningEvent = {
					timestamp: new Date().toISOString(),
					type: args.type as LearningEvent["type"],
					description: args.description as string,
					context: args.context as string,
				};
				learningEvents.push(event);
				return {
					output: `Learning event recorded: [${event.type}] ${event.description}`,
				};
			},
		},
		{ builtin: true },
	);

	// Pull docs from BMO_SOURCE before inventory generation
	if (paths.bmoSource) {
		try {
			await pullDocsFromSource(paths.docsDir, paths.bmoSource);
			logger.info("Pulled docs from BMO_SOURCE");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to pull docs from BMO_SOURCE: ${msg}`);
		}
	}

	// Generate inventory
	let inventorySummary: string | undefined;
	try {
		const inventory = await generateInventory(registry, skillsRegistry, paths.bmoHome);
		inventorySummary = formatInventoryForPrompt(inventory);
		await saveInventory(paths.dataDir, inventory);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(`Failed to generate inventory: ${msg}`);
	}

	// Load cross-session telemetry (verbose for maintenance)
	const telemetryStore = await loadTelemetry(paths.dataDir);
	const telemetrySummary = formatTelemetryForPrompt(telemetryStore, true) || undefined;

	// Load working memory (if it exists from a previous maintenance pass)
	let workingMemoryContent: string | undefined;
	try {
		workingMemoryContent = await readFile(join(paths.docsDir, "WORKING_MEMORY.md"), "utf-8");
	} catch {
		// File doesn't exist yet -- first maintenance pass will create it
	}

	// Load project context from AGENTS.md or CLAUDE.md in working directory
	let projectContextContent: string | undefined;
	const cwd = process.cwd();
	for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
		try {
			projectContextContent = await readFile(join(cwd, filename), "utf-8");
			break; // Use first found
		} catch {
			// File doesn't exist, try next
		}
	}

	// Build maintenance notice
	const count = config.maintenance.sessionsSinceLastMaintenance;
	const last = config.maintenance.lastMaintenanceDate ?? "never";
	const maintenanceNotice =
		`MAINTENANCE DUE: ${count} sessions since last maintenance (last: ${last}). ` +
		"Run an introspection pass: review reflections, validate tool hypotheses, scan for patterns, " +
		"update OPPORTUNITIES.md, write a state snapshot, append to EXPERIMENT.md. " +
		"Call complete_maintenance when done.";

	// System prompt
	const systemPrompt = assembleSystemPrompt({
		bmoHome: paths.bmoHome,
		dataDir: paths.dataDir,
		cwd: process.cwd(),
		bmoSource: paths.bmoSource ?? undefined,
		skills: skillsRegistry.list(),
		dynamicTools: registry.listDynamicNames(),
		maintenanceNotice,
		inventorySummary,
		telemetrySummary,
		workingMemory: workingMemoryContent,
		projectContext: projectContextContent,
	});

	// Messages
	const messages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: MAINTENANCE_MESSAGE },
	];

	// Session tracker with maintenance budget
	const session = createSessionTracker(undefined, config.cost.modelPricing);
	const display = new ConsoleDisplay();
	const sessionStartedAt = new Date().toISOString();

	// Run the agent loop
	const toolCallRecords: ToolCallRecord[] = [];
	const result = await runAgentLoop({
		logger,
		llm,
		registry,
		messages,
		session,
		models: config.models,
		contextConfig: config.context,
		defaultTier: "reasoning",
		display,
		defaultStatus: "maintenance",
		toolCallRecords,
		sessionId,
	});
	// Merge telemetry
	if (toolCallRecords.length > 0) {
		mergeToolCalls(telemetryStore, toolCallRecords);
	}
	if (learningEvents.length > 0) {
		mergeLearnings(telemetryStore, learningEvents, sessionId);
	}

	const stats = session.getStats();

	// Save session
	const sessionData: SessionData = {
		id: sessionId,
		startedAt: sessionStartedAt,
		lastActiveAt: new Date().toISOString(),
		workingDirectory: process.cwd(),
		model: config.models.reasoning,
		messages,
		usage: {
			totalPromptTokens: stats.totalPromptTokens,
			totalCompletionTokens: stats.totalCompletionTokens,
			totalCost: stats.totalCost,
		},
		reflection: maintenanceSummary || null,
		learningEvents: learningEvents.length > 0 ? learningEvents : undefined,
	};

	try {
		await saveSession(paths.sessionsDir, sessionData);
		logger.info(`Maintenance session saved: ${sessionId}`);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(`Failed to save maintenance session: ${msg}`);
	}

	// Save telemetry
	if (toolCallRecords.length > 0 || learningEvents.length > 0) {
		try {
			await saveTelemetry(paths.dataDir, telemetryStore);
			logger.info("Maintenance telemetry saved");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to save telemetry: ${msg}`);
		}
	}

	// Push docs to BMO_SOURCE after maintenance
	if (paths.bmoSource) {
		try {
			await pushDocsToSource(paths.docsDir, paths.bmoSource);
			logger.info("Pushed docs to BMO_SOURCE");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to push docs to BMO_SOURCE: ${msg}`);
		}
	}

	return {
		success: !result.lastResponseWasError && maintenanceSummary !== "",
		summary: maintenanceSummary || "Maintenance did not complete (no summary provided)",
		cost: stats.totalCost,
	};
}
