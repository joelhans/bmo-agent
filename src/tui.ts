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
import type { BmoConfig } from "./config.ts";
import { createSessionTracker } from "./context.ts";
import type { ChatMessage, LlmClient } from "./llm.ts";
import type { Logger } from "./logger.ts";
import type { ResolvedPaths } from "./paths.ts";
import { assembleSystemPrompt } from "./prompt.ts";
import type { SessionData } from "./session.ts";
import { saveSession } from "./session.ts";
import { createLoadSkillTool, createSkillsRegistry } from "./skills.ts";
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

	// Tool registry — built-in tools survive reload
	const registry = createToolRegistry();
	registry.register(createRunCommandTool(config), { builtin: true });

	// Skills registry
	const skillsRegistry = createSkillsRegistry(paths.skillsDir);

	// Built-in tools: load_skill and reload_tools
	registry.register(createLoadSkillTool(skillsRegistry), { builtin: true });
	registry.register(createReloadToolsTool(paths.toolsDir, registry, skillsRegistry), { builtin: true });

	// Initial tool/skill scan
	const loadResult = await initialLoad(paths.toolsDir, registry, skillsRegistry);
	const loadSummary = formatLoadResult(loadResult, skillsRegistry.list().length);
	logger.info(`Initial tool load: ${loadSummary}`);

	// System prompt — includes skill and dynamic tool lists
	function buildSystemPrompt(): string {
		return assembleSystemPrompt({
			bmoHome: paths.bmoHome,
			dataDir: paths.dataDir,
			cwd: process.cwd(),
			skills: skillsRegistry.list(),
			dynamicTools: registry.listDynamicNames(),
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
	const messages: ChatMessage[] = resumedSession
		? [...resumedSession.messages]
		: [{ role: "system", content: systemPrompt }];
	const session = createSessionTracker(resumedSession?.usage);
	const sessionStartedAt = resumedSession?.startedAt ?? new Date().toISOString();
	let lastResponseWasError = false;
	let lastUsedModel = config.models.coding;

	function rebuildSystemPrompt(): void {
		const newPrompt = buildSystemPrompt();
		if (messages.length > 0 && messages[0].role === "system") {
			messages[0].content = newPrompt;
		}
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

	function defaultStatus(): string {
		return session.formatStatus(sessionId, lastUsedModel, config.context.coding.maxTokens, config.cost.sessionLimit);
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
		};
	}

	async function handleUserMessage(message: string): Promise<void> {
		logger.info(`user: ${message}`);

		if (session.isOverBudget(config.cost.sessionLimit)) {
			const limit = config.cost.sessionLimit.toFixed(2);
			chatView.addMessage("system", `Session cost limit reached ($${limit}). Start a new session.`);
			return;
		}

		const tier = selectTier({ userMessage: message, lastResponseWasError });
		const model = config.models[tier];
		const contextConfig = config.context[tier];
		lastUsedModel = model;
		logger.info(`tier: ${tier} → ${model}`);

		messages.push({ role: "user", content: message });
		chatView.addMessage("user", message);

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
		});

		lastResponseWasError = result.lastResponseWasError;

		// Auto-save after each assistant turn
		try {
			await saveSession(sessionsDir, buildSessionData(null));
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to save session: ${msg}`);
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
		initialLoad(paths.toolsDir, registry, skillsRegistry)
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

		tui.stop();
		await logger.flush();
		process.exit(0);
	};

	logger.info("TUI started");
	tui.start();
}
