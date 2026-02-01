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
import type { BmoConfig } from "./config.ts";
import { createSessionTracker, truncateToFit } from "./context.ts";
import type { ChatMessage, LlmClient } from "./llm.ts";
import type { Logger } from "./logger.ts";
import type { ResolvedPaths } from "./paths.ts";
import { assembleSystemPrompt } from "./prompt.ts";
import type { SessionData } from "./session.ts";
import { saveSession } from "./session.ts";
import { selectTier } from "./tiering.ts";

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
			// Placeholder for reload_tools (Phase 3)
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

export function startTui(opts: StartTuiOptions): void {
	const { config, logger, sessionId, llm, sessionsDir, paths, resumedSession } = opts;

	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);

	const chatView = new ChatView(tui, sessionId);
	tui.addChild(chatView);
	tui.setFocus(chatView as unknown as Component);

	const systemPrompt = assembleSystemPrompt(paths.bmoHome, paths.dataDir, process.cwd());
	const messages: ChatMessage[] = resumedSession
		? [...resumedSession.messages]
		: [{ role: "system", content: systemPrompt }];
	const session = createSessionTracker(resumedSession?.usage);
	const sessionStartedAt = resumedSession?.startedAt ?? new Date().toISOString();
	let lastResponseWasError = false;
	let lastUsedModel = config.models.coding;

	if (resumedSession) {
		for (const msg of resumedSession.messages) {
			if (msg.role === "system") continue;
			chatView.addMessage(msg.role, msg.content);
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
		const ctx = config.context[tier];
		lastUsedModel = model;
		logger.info(`tier: ${tier} → ${model}`);

		messages.push({ role: "user", content: message });
		chatView.addMessage("user", message);
		chatView.setInputEnabled(false);
		chatView.setStatus(`${defaultStatus()} | thinking...`);

		const dropped = truncateToFit(messages, ctx.maxTokens, ctx.responseHeadroom);
		if (dropped > 0) {
			logger.info(`context: dropped ${dropped} messages to fit within token budget`);
		}

		chatView.beginAssistantMessage();
		let fullResponse = "";

		try {
			for await (const event of llm.stream(messages, model)) {
				if (event.type === "text") {
					fullResponse += event.text;
					chatView.appendToAssistantMessage(event.text);
				} else if (event.type === "usage") {
					session.recordUsage(model, event.promptTokens, event.completionTokens);
					logger.info(
						`tokens: prompt=${event.promptTokens} completion=${event.completionTokens}` +
							` cost=$${session.getStats().totalCost.toFixed(4)}`,
					);
				}
			}

			messages.push({ role: "assistant", content: fullResponse });
			logger.info(`assistant: ${fullResponse.slice(0, 200)}${fullResponse.length > 200 ? "..." : ""}`);
			lastResponseWasError = false;
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`LLM error: ${errorMessage}`);
			chatView.addMessage("system", `Error: ${errorMessage}`);
			lastResponseWasError = true;
		} finally {
			chatView.setInputEnabled(true);
			chatView.setStatus(defaultStatus());
		}

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
