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
import type { Logger } from "./logger.ts";

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

		while (this.messageCount > MAX_MESSAGES && this.output.children.length > 0) {
			this.output.removeChild(this.output.children[0]);
			this.messageCount--;
		}

		this.tui.requestRender();
	}

	setStatus(text: string): void {
		this.statusLine.setText(dim(text));
		this.tui.requestRender();
	}
}

// ---------------------------------------------------------------------------
// startTui — wire everything up and start the TUI event loop
// ---------------------------------------------------------------------------

export function startTui(_config: BmoConfig, logger: Logger, sessionId: string): void {
	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);

	const chatView = new ChatView(tui, sessionId);
	tui.addChild(chatView);
	tui.setFocus(chatView as unknown as Component);

	chatView.addMessage("system", "bmo v0.1.0 — type a message and press Enter. Ctrl+C to exit.");

	chatView.onSubmit = (message: string) => {
		logger.info(`user: ${message}`);
		chatView.addMessage("user", message);
		chatView.addMessage("assistant", message);
	};

	chatView.onExit = async () => {
		logger.info("session ended by user");
		tui.stop();
		await logger.flush();
		process.exit(0);
	};

	logger.info("TUI started");
	tui.start();
}
