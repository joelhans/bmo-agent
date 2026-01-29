bmo TUI (Ink) — phased plan

Goal
- Build a terminal UI for bmo using Ink that:
  - Shows separate areas: transcript (responses + tool logs) and an input panel
  - Supports multiline input with Shift+Enter to insert a newline and Enter to submit
  - Allows mouse interaction in the input panel: click to set caret, drag to select text, wheel to scroll when overflowed
- Keep the core chat/tool logic shared with the current CLI so features stay in sync

Non-goals (for v1)
- Full-screen editor features (undo tree, syntax highlighting) in the input
- Arbitrary mouse gestures outside the input panel
- Non-tty environments (we’ll gracefully fall back)

High-level architecture
- Split core chat/streaming logic from index.mjs into a small reusable module (lib/chat.mjs) that exposes an event-driven interface (onToken, onToolCall, onToolResult, onMessageDone, onError)
- Ink app in tui/ uses this module and renders:
  - TranscriptPane: streams tokens and renders conversation (user, assistant, tool calls)
  - InputPane: custom multiline input component with keyboard + mouse support
  - StatusBar: model name, tool loading status, key hints
- Logging persists to the existing data dir and mirrors current CLI behavior

Phases

Phase 0 — Capability spike and decisions (0.5–1 day)
- Verify Ink + useInput support for modifier detection on Enter (Shift+Enter). If Shift is not detectable consistently, choose Ctrl+Enter as a safe fallback, while still attempting Shift detection when available.
- Confirm enabling mouse reporting and parsing SGR mouse sequences is viable in Node/Ink:
  - Enable tracking: write “\x1b[?1000h\x1b[?1002h\x1b[?1006h” and parse stdin
  - Ensure Ink’s raw mode with useStdin works alongside custom mouse parsing
- Decide minimal dependencies:
  - ink@^4, react@^18
  - Optional: ink-spinner for small status feedback
  - Avoid ink-text-input (single-line) for input; build a custom multiline buffer
- Output: notes on key/modifier support matrix, sample that logs mouse clicks, and decision to proceed

Phase 1 — Project scaffolding (0.5 day)
- Add dependencies to package.json: ink, react
- Add scripts:
  - "tui": node tui/index.mjs
- Files:
  - tui/index.mjs — Node entry that renders <App />
  - tui/App.mjs — Ink app root
  - tui/components/TranscriptPane.mjs
  - tui/components/InputPane.mjs
  - tui/components/StatusBar.mjs
  - tui/mouse.mjs — mouse enable/disable + SGR parser
  - lib/chat.mjs — shared chat engine (extracted in Phase 2)

Phase 2 — Extract shared chat engine (1 day)
- Create lib/chat.mjs exposing:
  - init({ toolsDir?, notesPath? }) → prepares system prompt (reuse existing build), loads tools (reuse reloadTools), returns a ChatEngine instance
  - ChatEngine.startTurn(userText) → begins a turn, streams assistant tokens, emits events
  - Event API (Node’s EventEmitter or callbacks):
    - on('token', text)
    - on('tool_call', call)
    - on('tool_result', { id, result })
    - on('assistant_done', message)
    - on('error', err)
  - Internally reuse executeTool, buildSystemPrompt, getOpenAIClient logic from index.mjs
- Refactor index.mjs to optionally use lib/chat.mjs behind the existing readline loop later; no behavior change now (separate PR)
- Acceptance: a small CLI spike that uses ChatEngine to print a streamed reply identical to current behavior

Phase 3 — Basic Ink app and layout (0.5–1 day)
- Implement App with three regions:
  - TranscriptPane (flexGrow=1, scrollback kept in memory; basic styles)
  - InputPane (fixed height ≥ 3 lines; shows multi-line text; hint line)
  - StatusBar (1 line; shows model, tool count, connection state)
- Wire global shortcuts:
  - Esc: focus InputPane
  - Ctrl+C: exit
  - F2: toggle timestamps in TranscriptPane
- Acceptance: “Hello world” renders, minimal transcript and input placeholder

Phase 4 — Streaming transcript + tool logs (1 day)
- Connect ChatEngine to TranscriptPane:
  - On 'token': append to the current assistant message
  - On 'assistant_done': finalize message, keep in history
  - On 'tool_call': append a structured log entry (tool name + details)
  - On 'tool_result': append collapsed result (first N chars), with key to expand
- Support scrolling when overflowed: keep an internal offset, add PgUp/PgDn/Home/End
- Acceptance: conversation shows up live; tool calls are visible; can scroll history

Phase 5 — Multiline input (keyboard) (1–2 days)
- Build EditableBuffer in InputPane:
  - State: text (string), caret (index), selection {start,end|null}
  - Rendering: wrap lines respecting panel width; show caret with inverse/underline; show selection with inverse style
  - Keyboard ops:
    - Enter: submit (if no Shift; see modifier decision)
    - Shift+Enter (or Ctrl+Enter fallback): insert newline
    - Left/Right: move caret; with Shift: adjust selection
    - Up/Down: move caret by visual line; with Shift: extend selection
    - Home/End: line boundaries; Ctrl+Home/End: buffer boundaries
    - Backspace/Delete: delete with selection collapse
    - Ctrl+A: select all; Ctrl+K/Ctrl+U: line edit conveniences
    - Tab: insert tab or 2 spaces (configurable)
  - Paste: support bracketed paste when detected; otherwise accept raw input
- Acceptance: can type/edit multiline; submit triggers a turn; newline insertion shortcut works

Phase 6 — Mouse: click, drag select, wheel (1–2 days)
- Implement tui/mouse.mjs:
  - enableMouse(stdin): write DECSET sequences, set raw mode
  - disableMouse(stdin): write DECRST sequences; cleanup on unmount
  - parseSGR(data): returns {type: 'down'|'up'|'drag'|'wheel', x, y, button, shift, ctrl, meta}
- Map mouse coords to InputPane content:
  - Maintain panel origin and wrapping map; convert (x,y) to buffer index
  - On down: set caret; start selection if shift/meta or on drag
  - On drag: update selection range
  - On wheel: scroll view (if content taller than pane)
- Handle terminal differences (xterm/wezterm/iTerm2): prefer SGR (1006) and button-motion (1002)
- Acceptance: mouse click moves caret; drag selects; wheel scrolls input when overflowed

Phase 7 — Submission lifecycle + UX polish (0.5–1 day)
- While a turn is active: disable submission; show spinner and “Streaming…” in StatusBar
- Keyboard: Ctrl+L clears input; Esc cancels selection
- Input history: Up/Down when empty cycles prior submitted prompts (stores last N)
- Save transcript to log file (reuse existing log path)
- Acceptance: smooth turn lifecycle and history recall

Phase 8 — Robustness + fallbacks (0.5 day)
- If !process.stdin.isTTY: detect and exit with a helpful message (suggest the classic CLI mode)
- On missing OPENAI_API_KEY: surface the same guidance as CLI
- Cleanup mouse/raw-mode on errors and exit

Phase 9 — Wire into bmo CLI (0.5 day)
- Add subcommand: bmo tui (no arguments) to launch the Ink app
- Keep default bmo (readline) unchanged; this is an optional UI

Phase 10 — Tests and CI (1–2 days)
- Unit tests for EditableBuffer operations: insertion, deletion, selection math, wrapping index mapping
- Mouse parser tests with sample SGR sequences
- Snapshot/integration test: render TranscriptPane with a mocked ChatEngine stream

Phase 11 — Documentation and help (0.5 day)
- README section: how to run, keybindings, mouse features, accessibility notes
- In-app help (press ?): show keybinds and mouse tips

Key technical notes
- Modifier detection for Shift+Enter:
  - Ink’s useInput may not emit a distinct shift flag for Enter in all terminals. Implement both:
    - Preferred: Shift+Enter inserts newline (when detectable)
    - Fallback: Ctrl+Enter inserts newline; Enter submits
  - Expose a config toggle in StatusBar or a tiny settings file
- Mouse support:
  - Enable SGR encoding (1006) and button-motion (1002); disable on unmount or exit
  - Expect some terminals to reserve selection; users may need to hold a modifier (e.g., Alt) to let the app capture drags. Document this and provide a configuration toggle to only start selection when Alt is held if user prefers normal terminal selection
- Text wrapping and hit-testing:
  - Maintain a line layout cache each render to map between (row,col) and buffer index
  - Keep logic independent of Ink so it’s testable (pure functions)

Acceptance criteria (summary)
- You can:
  - Type and edit multi-line prompts; Shift+Enter (or Ctrl+Enter) inserts newline; Enter submits
  - Click to move the caret, drag to select text, wheel to scroll the input
  - See a live-streaming transcript with tool call logs
  - Launch via pnpm run tui or bmo tui (after Phase 9)

Risks and mitigations
- Terminal variance: mouse/shift may differ across terminals → dual shortcut, config flags, clear help
- Raw mode and paste quirks: add bracketed paste handling and timeouts; thorough cleanup on exit
- Shared core drift: keep CLI and TUI using lib/chat.mjs; avoid duplicating logic

Rough timeline
- P0–P2: 2–3 days
- P3–P6: 3–5 days
- P7–P11: 2–3 days
Total: ~1–2 weeks elapsed depending on polish

Appendix: references
- Ink: https://github.com/vadimdemedes/ink
- Ink useInput: https://github.com/vadimdemedes/ink#useinputinput-handler-options
- Mouse reporting (SGR 1006): https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Mouse-Tracking
- Bracketed paste mode: https://cirw.in/blog/bracketed-paste
