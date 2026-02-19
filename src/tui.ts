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
import { type ModelTier, selectInitialTier } from "./tiering.ts";
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
const magenta = (s: string): string => `\x1b[35m${s}\x1b[39m`;

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
// ScrollableOutput — messages container with manual scroll control
// ---------------------------------------------------------------------------

class ScrollableOutput extends Container {
	private scrollOffset = 0;
	private totalLines = 0;
	private viewportHeight = 0;
	private autoScrollEnabled = true; // Auto-scroll to bottom on new content

	/**
	 * Render with viewport constraint and scroll support.
	 * @param width - Terminal width
	 * @param maxHeight - Maximum lines to render (viewport height)
	 * @returns Visible lines plus scroll indicator if needed
	 */
	renderWithHeight(width: number, maxHeight: number): { lines: string[]; scrollInfo: string | null } {
		this.viewportHeight = maxHeight;

		// Render all children to get total content
		const allLines: string[] = [];
		for (const child of this.children) {
			allLines.push(...child.render(width));
		}

		this.totalLines = allLines.length;

		if (allLines.length === 0) {
			return { lines: [], scrollInfo: null };
		}

		// If content fits, no scrolling needed
		if (allLines.length <= maxHeight) {
			this.scrollOffset = 0;
			return { lines: allLines, scrollInfo: null };
		}

		// Auto-scroll to bottom when enabled (new content arrived)
		if (this.autoScrollEnabled) {
			this.scrollOffset = allLines.length - maxHeight;
		}

		// Clamp scroll offset
		const maxScroll = Math.max(0, allLines.length - maxHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

		// Get visible slice
		const visibleLines = allLines.slice(this.scrollOffset, this.scrollOffset + maxHeight);

		// Build scroll indicator
		const linesAbove = this.scrollOffset;
		const linesBelow = allLines.length - this.scrollOffset - maxHeight;
		let scrollInfo: string | null = null;

		if (linesAbove > 0 || linesBelow > 0) {
			const parts: string[] = [];
			if (linesAbove > 0) parts.push(`↑${linesAbove}`);
			if (linesBelow > 0) parts.push(`↓${linesBelow}`);
			scrollInfo = parts.join(" ");
		}

		return { lines: visibleLines, scrollInfo };
	}

	/**
	 * Scroll by a number of lines (positive = down, negative = up)
	 */
	scroll(delta: number): void {
		if (this.totalLines <= this.viewportHeight) return;

		const maxScroll = Math.max(0, this.totalLines - this.viewportHeight);
		const newOffset = this.scrollOffset + delta;
		this.scrollOffset = Math.max(0, Math.min(newOffset, maxScroll));

		// Disable auto-scroll if user scrolled up
		if (delta < 0) {
			this.autoScrollEnabled = false;
		}

		// Re-enable auto-scroll if user scrolled to bottom
		if (this.scrollOffset >= maxScroll) {
			this.autoScrollEnabled = true;
		}
	}

	/**
	 * Scroll by a page
	 */
	scrollPage(direction: -1 | 1): void {
		const pageSize = Math.max(1, this.viewportHeight - 2);
		this.scroll(direction * pageSize);
	}

	/**
	 * Jump to top or bottom
	 */
	scrollToEnd(top: boolean): void {
		if (top) {
			this.scrollOffset = 0;
			this.autoScrollEnabled = false;
		} else {
			this.scrollOffset = Math.max(0, this.totalLines - this.viewportHeight);
			this.autoScrollEnabled = true;
		}
	}

	/**
	 * Called when new content is added - re-enables auto-scroll if at bottom
	 */
	onContentAdded(): void {
		// If we were at the bottom (or auto-scroll enabled), stay at bottom
		if (this.autoScrollEnabled) {
			this.scrollOffset = Math.max(0, this.totalLines - this.viewportHeight);
		}
	}

	// Standard render (not used in our custom layout, but required by Container)
	render(width: number): string[] {
		const lines: string[] = [];
		for (const child of this.children) {
			lines.push(...child.render(width));
		}
		return lines;
	}
}

// ---------------------------------------------------------------------------
// ChatView — full-screen UI with pinned bottom and scroll support
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 500;

class ChatView extends Container implements Focusable {
	private editor: Editor;
	private output: ScrollableOutput;
	private statusLine: Text;
	private helperLine: Text;
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

		this.output = new ScrollableOutput();
		this.helperLine = new Text(dim("Ctrl+C exit | F5 reload | PgUp/PgDn scroll"), 1, 0);
		this.statusLine = new Text(dim(`bmo v0.1.0 | session: ${sessionId}`), 1, 0);
		this.editor = new Editor(tui, editorTheme, { paddingX: 1 });

		this.editor.onSubmit = (text: string) => {
			if (text.trim().length === 0) return;
			this.editor.setText("");
			this.editor.addToHistory(text);
			this.onSubmit?.(text);
		};
	}

	/**
	 * Custom render that fills the terminal with:
	 * - Messages at the top (scrollable viewport)
	 * - Spacer to fill remaining space
	 * - Helper line (with scroll indicator), status line, and editor pinned at bottom
	 */
	render(width: number): string[] {
		const termHeight = this.tui.terminal.rows;

		// Render bottom components to know their height
		const editorLines = this.editor.render(width);
		const statusLines = this.statusLine.render(width);
		const helperLines = this.helperLine.render(width);

		const bottomHeight = editorLines.length + statusLines.length + helperLines.length;

		// Calculate available height for messages
		const outputMaxHeight = Math.max(1, termHeight - bottomHeight);

		// Render output with height constraint
		const { lines: outputLines, scrollInfo } = this.output.renderWithHeight(width, outputMaxHeight);

		// Calculate spacer height to fill the gap
		const spacerHeight = Math.max(0, termHeight - outputLines.length - bottomHeight);

		// Build final output
		const result: string[] = [];

		// Messages
		result.push(...outputLines);

		// Spacer (empty lines to push bottom content down)
		for (let i = 0; i < spacerHeight; i++) {
			result.push("");
		}

		// Helper line - append scroll info if present
		if (scrollInfo) {
			const helperText = `Ctrl+C exit | F5 reload | PgUp/PgDn scroll | ${scrollInfo}`;
			result.push(dim(helperText));
		} else {
			result.push(...helperLines);
		}

		// Status and editor
		result.push(...statusLines);
		result.push(...editorLines);

		return result;
	}

	handleInput(data: string): void {
		// Global shortcuts
		if (matchesKey(data, Key.ctrl("c"))) {
			this.onExit?.();
			return;
		}
		if (matchesKey(data, Key.f5)) {
			this.onReload?.();
			return;
		}

		// Scroll controls
		if (matchesKey(data, Key.pageUp)) {
			this.output.scrollPage(-1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.output.scrollPage(1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.home)) {
			this.output.scrollToEnd(true);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.output.scrollToEnd(false);
			this.tui.requestRender();
			return;
		}

		// Mouse wheel support - terminals often send these escape sequences
		// Wheel up: \x1b[<64;col;rowM or legacy \x1b[M`xx (button 64)
		// Wheel down: \x1b[<65;col;rowM or legacy \x1b[Ma xx (button 65)
		if (data.includes("\x1b[<64;") || data.includes("\x1b[M`")) {
			this.output.scroll(-3); // Scroll up 3 lines
			this.tui.requestRender();
			return;
		}
		if (data.includes("\x1b[<65;") || data.includes("\x1b[Ma")) {
			this.output.scroll(3); // Scroll down 3 lines
			this.tui.requestRender();
			return;
		}

		// Pass remaining input to editor
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
		this.output.onContentAdded();
		this.tui.requestRender();
	}

	beginAssistantMessage(): void {
		this.currentMessageText = "";
		this.currentMessage = new Text("", 1, 0);
		this.output.addChild(this.currentMessage);
		this.messageCount++;
		this.trimOutput();
		this.output.onContentAdded();
		this.tui.requestRender();
	}

	appendToAssistantMessage(text: string): void {
		if (!this.currentMessage) return;
		this.currentMessageText += text;
		this.currentMessage.setText(this.currentMessageText);
		this.output.onContentAdded();
		this.tui.requestRender();
	}

	addToolCall(summary: string): void {
		this.output.addChild(new Text(dim(`  [tool] ${summary}`), 1, 0));
		this.messageCount++;
		this.trimOutput();
		this.output.onContentAdded();
		this.tui.requestRender();
	}

	addSkillLoaded(name: string): void {
		this.output.addChild(new Text(magenta(`  [skill] ${name} loaded`), 1, 0));
		this.messageCount++;
		this.trimOutput();
		this.output.onContentAdded();
		this.tui.requestRender();
	}

	addToolResult(result: string, isError?: boolean): void {
		// Only display errors in the TUI - successful tool output is logged but not shown
		if (!isError) return;
		this.output.addChild(new Text(red(result), 1, 0));
		this.output.onContentAdded();
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

	// Track skills loaded during this session
	const skillsLoaded: string[] = resumedSession?.skillsLoaded ? [...resumedSession.skillsLoaded] : [];

	// Built-in tools: load_skill (with tracking callback) and reload_tools
	registry.register(
		createLoadSkillTool(skillsRegistry, {
			onSkillLoaded: (name) => {
				if (!skillsLoaded.includes(name)) {
					skillsLoaded.push(name);
				}
				logger.info(`skill loaded: ${name}`);
			},
		}),
		{ builtin: true },
	);
	registry.register(
		createReloadToolsTool(paths.toolsDir, registry, skillsRegistry, sandboxConfig, {
			resultTruncation: config.toolResultTruncation,
			skillsDir: paths.skillsDir,
			bmoSource: paths.bmoSource,
			docsDir: paths.docsDir,
		}),
		{ builtin: true },
	);

	// Initial tool/skill scan
	const loadResult = await initialLoad(paths.toolsDir, registry, skillsRegistry, sandboxConfig, {
		resultTruncation: config.toolResultTruncation,
	});
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

	// Load project context from AGENTS.md or CLAUDE.md in working directory
	let projectContextContent: string | undefined;
	const cwd = process.cwd();
	for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
		try {
			projectContextContent = await readFile(join(cwd, filename), "utf-8");
			logger.info(`Loaded project context from ${filename}`);
			break; // Use first found
		} catch {
			// File does not exist, try next
		}
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
			projectContext: projectContextContent,
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
	let _lastUsedTier: ModelTier = "reasoning";

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
				// Skip tool results in restored sessions - only show [tool]/[skill] summaries
				continue;
			}
			if (msg.role === "assistant" && msg.tool_calls) {
				for (const tc of msg.tool_calls) {
					if (tc.function.name === "load_skill") {
						// Show skill loads distinctively when resuming
						try {
							const args = JSON.parse(tc.function.arguments) as { name?: string };
							chatView.addSkillLoaded(args.name ?? "unknown");
						} catch {
							chatView.addSkillLoaded("unknown");
						}
					} else {
						chatView.addToolCall(formatToolCallSummary(tc.function.name, tc.function.arguments));
					}
				}
				if (msg.content) chatView.addMessage("assistant", msg.content);
				continue;
			}
			chatView.addMessage(msg.role, msg.content ?? "");
		}
		chatView.addMessage("system", `Resumed session ${sessionId}`);
	} else {
		chatView.addMessage("system", "bmo v0.1.0 — type a message and press Enter");
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
			skillsLoaded: skillsLoaded.length > 0 ? skillsLoaded : undefined,
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

		const initialTier = selectInitialTier({ userMessage: message, lastResponseWasError });
		_lastUsedTier = initialTier;
		lastUsedModel = config.models[initialTier];
		logger.info(`initial tier: ${initialTier} → ${lastUsedModel}`);

		messages.push({ role: "user", content: message });
		chatView.addMessage("user", message);

		const toolCallRecords: ToolCallRecord[] = [];
		const result = await runAgentLoop({
			logger,
			llm,
			registry,
			messages,
			session,
			models: config.models,
			contextConfig: config.context,
			defaultTier: initialTier,
			display: chatView,
			defaultStatus: defaultStatus(),
			toolCallRecords,
			sessionId,
			selfImproveConfig: config.selfImprovement,
			onModelChange: (tier: ModelTier, model: string) => {
				_lastUsedTier = tier;
				lastUsedModel = model;
				chatView.setStatus(defaultStatus());
			},
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
		initialLoad(paths.toolsDir, registry, skillsRegistry, sandboxConfig, {
			resultTruncation: config.toolResultTruncation,
		})
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
		const hasAssistantResponse = messages.some((m) => m.role === "assistant");
		let reflection: string | null = null;
		let reflectionStatus: "success" | "empty" | "error" | "skipped" = "skipped";

		// Only reflect if there was a complete exchange (user message AND assistant response)
		// Without an assistant response, the model would see two consecutive user messages
		// and likely respond to the original request instead of reflecting
		if (hasUserMessages && hasAssistantResponse) {
			chatView.setStatus(`Reflecting... | session: ${sessionId}`);
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

				if (reflectionText.trim().length === 0) {
					reflectionStatus = "empty";
					logger.warn(
						"reflection: model returned empty response (0 chars). " +
							"This may indicate: (1) context window exhaustion, " +
							"(2) meta-task confusion (e.g., reflecting on a reflection), or " +
							"(3) model refusal for self-referential prompts.",
					);
				} else {
					reflection = reflectionText;
					reflectionStatus = "success";
					logger.info(`reflection: ${reflectionText.slice(0, 200)}${reflectionText.length > 200 ? "..." : ""}`);

					// Give user time to read the reflection before exiting
					chatView.setStatus(`Reflection complete. Saving session...`);
					await new Promise((resolve) => setTimeout(resolve, 2000));
				}
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				reflectionStatus = "error";
				logger.error(`Reflection failed: ${msg}`);
			}
		} else if (hasUserMessages && !hasAssistantResponse) {
			reflectionStatus = "skipped";
			logger.info("skipping reflection: no assistant response (request may have failed)");
		}

		// Log reflection outcome for diagnostics
		logger.info(`reflection status: ${reflectionStatus}`);

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
