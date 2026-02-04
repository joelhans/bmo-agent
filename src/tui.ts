import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type Component,
	Container,
	Editor,
	type Focusable,
	Key,
	matchesKey,
	ProcessTerminal,
	Text,
	TUI,
} from "@mariozechner/pi-tui";
import { runAgentLoop } from "./agent-loop.ts";
import { type BmoConfig, saveConfig } from "./config.ts";
import { createSessionTracker } from "./context.ts";
import { pushDocsToSource } from "./doc-sync.ts";
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
	type TelemetryStore,
	type ToolCallRecord,
} from "./telemetry.ts";
import { selectTier } from "./tiering.ts";
import { createReloadToolsTool, formatLoadResult, initialLoad } from "./tool-loader.ts";
import { createRunCommandTool, createToolRegistry, formatToolCallSummary } from "./tools.ts";

// ---------------------------------------------------------------------------
// ANSI color helpers (no chalk dependency)
// ---------------------------------------------------------------------------

const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[39m`;
const gray = (s: string): string => `\x1b[90m${s}\x1b[39m`;
const blue = (s: string): string => `\x1b[34m${s}\x1b[39m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[39m`;

// ---------------------------------------------------------------------------
// Editor theme
// ---------------------------------------------------------------------------

const editorTheme = {
	borderColor: (s: string) => blue(s),
	selectList: {
		selectedPrefix: (s: string) => cyan(s),
		selectedText: (s: string) => bold(s),
		description: (s: string) => gray(s),
		scrollInfo: (s: string) => gray(s),
		noMatch: (s: string) => red(s),
	},
};

// ---------------------------------------------------------------------------
// ChatView — root UI component
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 500;

class ChatView extends Container implements Focusable {
	private editor: Editor;
	private output: Container;
	private statusLine: Text;
	private messageCount = 0;
	private tui: TUI;

	private currentMessage: Text | null = null;
	private currentMessageText = "";

	onExit?: () => void;
	onSubmit?: (message: string) => void;
	onReload?: () => void;

	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.editor.focused = value;
	}

	constructor(tui: TUI, sessionId: string) {
		super();
		this.tui = tui;

		this.output = new Container();
		this.statusLine = new Text(dim(`bmo v0.1.0 | session: ${sessionId}`), 1, 0);
		this.editor = new Editor(tui, editorTheme, { paddingX: 1 });

		this.editor.onSubmit = (text: string) => {
			if (text.trim().length === 0) return;
			this.editor.setText("");
			this.editor.addToHistory(text);
			this.onSubmit?.(text);
		};

		this.addChild(this.output);
		this.addChild(this.statusLine);
		this.addChild(this.editor);
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.ctrl("c"))) {
			this.onExit?.();
			return;
		}
		if (matchesKey(data, Key.f5)) {
			this.onReload?.();
			return;
		}
		this.editor.handleInput(data);
	}

	addMessage(role: "user" | "assistant" | "system", content: string): void {
		let styled: string;
		if (role === "user") {
			styled = dim(`> ${content}`);
		} else if (role === "system") {
			styled = gray(content);
		} else {
			styled = content;
		}

		this.output.addChild(new Text(styled, 1, 0));
		this.messageCount++;
		this.trimOutput();
		this.tui.requestRender();
	}

	beginAssistantMessage(): void {
		this.currentMessageText = "";
		this.currentMessage = new Text("", 1, 0);
		this.output.addChild(this.currentMessage);
		this.messageCount++;
		this.trimOutput();
		this.tui.requestRender();
	}

	appendToAssistantMessage(text: string): void {
		if (!this.currentMessage) return;
		this.currentMessageText += text;
		this.currentMessage.setText(this.currentMessageText);
		this.tui.requestRender();
	}

	addToolCall(summary: string): void {
		this.output.addChild(new Text(dim(`  [tool] ${summary}`), 1, 0));
		this.messageCount++;
		this.trimOutput();
		this.tui.requestRender();
	}

	addToolResult(result: string, isError?: boolean): void {
		const styled = isError ? red(result) : gray(result);
		this.output.addChild(new Text(styled, 1, 0));
		this.messageCount++;
		this.trimOutput();
		this.tui.requestRender();
	}

	setInputEnabled(enabled: boolean): void {
		this.editor.disableSubmit = !enabled;
	}

	setStatus(text: string): void {
		this.statusLine.setText(dim(text));
		this.tui.requestRender();
	}

	private trimOutput(): void {
		while (this.messageCount > MAX_MESSAGES && this.output.children.length > 0) {
			this.output.removeChild(this.output.children[0]);
			this.messageCount--;
		}
	}
}

// ---------------------------------------------------------------------------
// startTui — wire everything up and start the TUI event loop
// ---------------------------------------------------------------------------

const REFLECTION_PROMPT =
	"Write a brief reflection on this conversation (3-5 sentences). " +
	"What was the user's task? What went well? What was slow, awkward, or failed? " +
	"What would you do differently next time?";

export interface StartTuiOptions {
	config: BmoConfig;
	logger: Logger;
	sessionId: string;
	llm: LlmClient;
	sessionsDir: string;
	paths: ResolvedPaths;
	resumedSession?: SessionData;
}

export async function startTui(opts: StartTuiOptions): Promise<void> {
	const { config, logger, sessionId, llm, sessionsDir, paths, resumedSession } = opts;

	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);

	const chatView = new ChatView(tui, sessionId);
	tui.addChild(chatView);
	tui.setFocus(chatView as unknown as Component);

	// Secret masker — prevents API keys from leaking into logs and tool output
	const masker = createSecretMasker(config);

	// Tool registry — built-in tools survive reload
	const registry = createToolRegistry();
	registry.register(createRunCommandTool(config, masker), { builtin: true });

	// Sandbox config for dynamic tool execution
	const sandboxConfig: SandboxConfig = {
		defaultTimeoutMs: config.sandbox.defaultTimeoutMs,
		memoryLimitMb: config.sandbox.memoryLimitMb,
		outputLimitBytes: config.sandbox.outputLimitBytes,
		projectDir: process.cwd(),
		bmoHome: paths.bmoHome,
	};

	// Skills registry
	const skillsRegistry = createSkillsRegistry(paths.skillsDir);

	// Built-in tools: load_skill and reload_tools
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
	logger.info(`Initial tool load: ${loadSummary}`);

	// Generate capability inventory
	let inventorySummary: string | undefined;
	try {
		const inventory = await generateInventory(registry, skillsRegistry, paths.bmoHome);
		inventorySummary = formatInventoryForPrompt(inventory);
		saveInventory(paths.dataDir, inventory).catch((err: unknown) => {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to save inventory: ${msg}`);
		});
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(`Failed to generate inventory: ${msg}`);
	}

	// Load cross-session telemetry
	let telemetryStore: TelemetryStore;
	try {
		telemetryStore = await loadTelemetry(paths.dataDir);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(`Failed to load telemetry: ${msg}`);
		telemetryStore = { updatedAt: new Date().toISOString(), toolStats: {}, recentLearnings: [] };
	}
	let learningEventsMergedCount = resumedSession?.learningEvents?.length ?? 0;

	// Load working memory (if it exists from a previous maintenance pass)
	let workingMemoryContent: string | undefined;
	try {
		workingMemoryContent = await readFile(join(paths.docsDir, "WORKING_MEMORY.md"), "utf-8");
	} catch {
		// File doesn't exist yet -- will be created by first maintenance pass
	}

	// System prompt — includes skill and dynamic tool lists, inventory, telemetry
	function buildSystemPrompt(): string {
		const telemetrySummary = formatTelemetryForPrompt(telemetryStore) || undefined;
		return assembleSystemPrompt({
			bmoHome: paths.bmoHome,
			dataDir: paths.dataDir,
			cwd: process.cwd(),
			bmoSource: paths.bmoSource ?? undefined,
			skills: skillsRegistry.list(),
			dynamicTools: registry.listDynamicNames(),
			inventorySummary,
			telemetrySummary,
			workingMemory: workingMemoryContent,
		});
	}

	const systemPrompt = buildSystemPrompt();

	// Wrap reload_tools to also rebuild system prompt in messages[0]
	const originalReload = registry.get("reload_tools");
	if (originalReload) {
		registry.register(
			{
				...originalReload,
				async execute(args) {
					const result = await originalReload.execute(args);
					rebuildSystemPrompt();
					return result;
				},
			},
			{ builtin: true },
		);
	}
	// Learning events accumulator
	const learningEvents: LearningEvent[] = resumedSession?.learningEvents ? [...resumedSession.learningEvents] : [];

	// Built-in tool: complete_maintenance
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
				config.maintenance.sessionsSinceLastMaintenance = 0;
				config.maintenance.lastMaintenanceDate = new Date().toISOString();
				await saveConfig(paths, config);
				rebuildSystemPrompt();

				// Auto-snapshot on maintenance completion
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

	// Built-in tool: save_snapshot
	registry.register(
		{
			name: "save_snapshot",
			description:
				"Save a state snapshot capturing current tools, skills, config (sanitized), and metrics. " +
				"Useful during maintenance or for tracking evolution over time.",
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

	// Built-in tool: log_learning_event
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

	const messages: ChatMessage[] = resumedSession
		? [...resumedSession.messages]
		: [{ role: "system", content: systemPrompt }];
	const session = createSessionTracker(resumedSession?.usage, config.cost.modelPricing);
	const sessionStartedAt = resumedSession?.startedAt ?? new Date().toISOString();
	let lastResponseWasError = false;
	let lastUsedModel = config.models.coding;

	function rebuildSystemPrompt(): void {
		// Refresh working memory (fire-and-forget)
		readFile(join(paths.docsDir, "WORKING_MEMORY.md"), "utf-8")
			.then((content) => {
				workingMemoryContent = content;
			})
			.catch(() => {
				/* file may not exist */
			});

		// Regenerate inventory (fire-and-forget save)
		generateInventory(registry, skillsRegistry, paths.bmoHome)
			.then((inv) => {
				inventorySummary = formatInventoryForPrompt(inv);
				const newPrompt = buildSystemPrompt();
				if (messages.length > 0 && messages[0].role === "system") {
					messages[0].content = newPrompt;
				}
				saveInventory(paths.dataDir, inv).catch((err: unknown) => {
					const msg = err instanceof Error ? err.message : String(err);
					logger.error(`Failed to save inventory: ${msg}`);
				});
			})
			.catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				logger.error(`Failed to regenerate inventory: ${msg}`);
				// Still rebuild prompt without updated inventory
				const newPrompt = buildSystemPrompt();
				if (messages.length > 0 && messages[0].role === "system") {
					messages[0].content = newPrompt;
				}
			});
	}

	if (resumedSession) {
		for (const msg of resumedSession.messages) {
			if (msg.role === "system") continue;
			if (msg.role === "tool") {
				chatView.addToolResult(msg.content ?? "");
				continue;
			}
			if (msg.role === "assistant" && msg.tool_calls) {
				for (const tc of msg.tool_calls) {
					chatView.addToolCall(formatToolCallSummary(tc.function.name, tc.function.arguments));
				}
				if (msg.content) chatView.addMessage("assistant", msg.content);
				continue;
			}
			chatView.addMessage(msg.role, msg.content ?? "");
		}
		chatView.addMessage("system", `Resumed session ${sessionId}`);
	} else {
		chatView.addMessage("system", "bmo v0.1.0 — type a message and press Enter. Ctrl+C to exit.");
	}

	// Check if at least one provider has a valid API key
	const hasAnyKey = Object.values(config.providers).some((p) => !!process.env[p.apiKeyEnv]);
	if (!hasAnyKey) {
		const envVars = Object.values(config.providers).map((p) => p.apiKeyEnv);
		chatView.addMessage(
			"system",
			`No API keys found. Set one of: ${envVars.join(", ")}\n` +
				`Example: export ${envVars[0]}=your-key-here\n` +
				`Or use: bmo key add <provider> <key>`,
		);
	}

	function defaultStatus(): string {
		return session.formatStatus(sessionId, lastUsedModel, config.cost.sessionLimit);
	}

	function buildSessionData(reflection: string | null): SessionData {
		const stats = session.getStats();
		return {
			id: sessionId,
			startedAt: sessionStartedAt,
			lastActiveAt: new Date().toISOString(),
			workingDirectory: process.cwd(),
			model: lastUsedModel,
			messages,
			usage: {
				totalPromptTokens: stats.totalPromptTokens,
				totalCompletionTokens: stats.totalCompletionTokens,
				totalCost: stats.totalCost,
			},
			reflection: reflection ?? resumedSession?.reflection ?? null,
			learningEvents: learningEvents.length > 0 ? learningEvents : undefined,
		};
	}

	async function handleUserMessage(message: string): Promise<void> {
		logger.info(`user: ${message}`);

		if (session.isOverBudget(config.cost.sessionLimit)) {
			if (config.cost.sessionLimit !== null) {
				const limit = config.cost.sessionLimit.toFixed(2);
				chatView.addMessage("system", `Session cost limit reached ($${limit}). Start a new session.`);
			}
			return;
		}

		const tier = selectTier({ userMessage: message, lastResponseWasError });
		const model = config.models[tier];
		const contextConfig = config.context[tier];
		lastUsedModel = model;
		logger.info(`tier: ${tier} → ${model}`);

		messages.push({ role: "user", content: message });
		chatView.addMessage("user", message);

		const toolCallRecords: ToolCallRecord[] = [];
		const result = await runAgentLoop({
			logger,
			llm,
			registry,
			messages,
			session,
			model,
			contextConfig,
			display: chatView,
			defaultStatus: defaultStatus(),
			toolCallRecords,
			sessionId,
		});

		lastResponseWasError = result.lastResponseWasError;

		// 80% budget warning
		const stats = session.getStats();
		if (config.cost.sessionLimit !== null) {
			const warningThreshold = config.cost.sessionLimit * 0.8;
			if (stats.totalCost >= warningThreshold && stats.totalCost < config.cost.sessionLimit) {
				const pct = ((stats.totalCost / config.cost.sessionLimit) * 100).toFixed(0);
				chatView.addMessage(
					"system",
					`Warning: session cost ($${stats.totalCost.toFixed(2)}) has reached ${pct}% of the $${config.cost.sessionLimit.toFixed(2)} limit.`,
				);
			}
		}

		// Merge telemetry (tool calls + new learning events)
		if (toolCallRecords.length > 0) {
			mergeToolCalls(telemetryStore, toolCallRecords);
		}
		const newLearnings = learningEvents.slice(learningEventsMergedCount);
		if (newLearnings.length > 0) {
			mergeLearnings(telemetryStore, newLearnings, sessionId);
			learningEventsMergedCount = learningEvents.length;
		}

		// Auto-save after each assistant turn
		try {
			await saveSession(sessionsDir, buildSessionData(null));
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to save session: ${msg}`);
		}

		// Save telemetry alongside session
		if (toolCallRecords.length > 0 || newLearnings.length > 0) {
			saveTelemetry(paths.dataDir, telemetryStore).catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				logger.error(`Failed to save telemetry: ${msg}`);
			});
		}
	}

	chatView.onSubmit = (message: string) => {
		handleUserMessage(message).catch((err) => {
			logger.error(`Unhandled error: ${err}`);
		});
	};

	chatView.onReload = () => {
		chatView.addMessage("system", "Reloading tools and skills...");
		registry.clearDynamic();
		initialLoad(paths.toolsDir, registry, skillsRegistry, sandboxConfig)
			.then((result) => {
				const summary = formatLoadResult(result, skillsRegistry.list().length);
				rebuildSystemPrompt();
				chatView.addMessage("system", summary);
				logger.info(`F5 reload: ${summary}`);
			})
			.catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				chatView.addMessage("system", `Reload failed: ${msg}`);
				logger.error(`F5 reload failed: ${msg}`);
			});
	};

	chatView.onExit = async () => {
		logger.info("session ended by user");

		const hasUserMessages = messages.some((m) => m.role === "user");
		let reflection: string | null = null;

		if (hasUserMessages) {
			chatView.setStatus("Reflecting...");
			chatView.setInputEnabled(false);

			try {
				const reflectionMessages: ChatMessage[] = [...messages, { role: "user", content: REFLECTION_PROMPT }];
				chatView.beginAssistantMessage();
				let reflectionText = "";

				for await (const event of llm.stream(reflectionMessages, config.models.coding)) {
					if (event.type === "text") {
						reflectionText += event.text;
						chatView.appendToAssistantMessage(event.text);
					} else if (event.type === "usage") {
						session.recordUsage(config.models.coding, event.promptTokens, event.completionTokens);
					}
				}

				reflection = reflectionText;
				logger.info(`reflection: ${reflectionText.slice(0, 200)}${reflectionText.length > 200 ? "..." : ""}`);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				logger.error(`Reflection failed: ${msg}`);
			}
		}

		// Final save (with reflection if generated)
		try {
			await saveSession(sessionsDir, buildSessionData(reflection));
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to save session: ${msg}`);
		}

		// Push docs to BMO_SOURCE before exit
		if (paths.bmoSource) {
			try {
				await pushDocsToSource(paths.docsDir, paths.bmoSource);
			} catch {
				/* silent — don't block exit */
			}
		}

		tui.stop();
		await logger.flush();
		process.exit(0);
	};

	logger.info("TUI started");
	tui.start();
}
