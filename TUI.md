TUI integration plan for bmo-agent

Overview
- Goal: Add an optional full-screen terminal UI for the bmo coding agent to improve streaming chat, tool-call visibility, status, and logs — while keeping the current readline REPL as a fallback.
- Constraint: Avoid invasive changes to index.mjs until needed; the TUI should be an optional runner that attaches via a clean UI adapter and event bus.
- Environments to support: Node (node index.mjs) and the compiled CLI (bun build --compile) on macOS/Linux; Windows should degrade gracefully.

What the code does today (relevant to the TUI)
- index.mjs owns:
  - Tool discovery/hot-reload via reloadTools()
  - System prompt assembly (including project notes)
  - A readline-driven chat loop (getUserInput, runPrompt)
  - Streaming assistant output via OpenAI Chat Completions with tools
  - Console printing of streaming tokens, tool-call announcements, and simple status
  - Per-session file logging to ~/.local/share/bmo
- tools/lib.mjs provides:
  - BMO_HOME/BMO_SOURCE resolution and a reload callback hook
  - Path helpers for bmo:// resolution
- No UI abstraction currently; stdout writes are inlined in runPrompt() and the REPL loop.

TUI requirements (initial)
- Preserve the streaming feel: tokens must render live, not buffered.
- Visibility into tool calls: show a side panel or event log whenever the model calls a tool, including arguments and results summaries.
- Input box with history; allow editing before send.
- Status bar for model, token usage (if available), reload-tools notifications, and key hints.
- Safe fallback: if TTY detection fails, revert to the current REPL.

Recommended architecture
- Introduce a thin UI Adapter and Event Bus so index.mjs does not directly own screen rendering.
  - UIBus: an EventEmitter-like object with explicit events; index.mjs emits events, and the active UI subscribes to render.
  - ConsoleUI (default): translates events to the existing stdout prints/readline.
  - TuiUI (optional): a full-screen app built on a TUI library; it consumes the same events.
- Minimal index.mjs changes (Phase 0):
  - Replace direct process.stdout.write in runPrompt() with bus.emit('assistant:delta', text)
  - Emit other structured events:
    - chat:user_input(text)
    - chat:assistant_start
    - chat:assistant_delta(text)
    - chat:assistant_done
    - tool:call_started({name, args})
    - tool:call_result({name, ok, summary})
    - sys:status(text)
    - sys:reload_tools({loaded, errors})
  - Wrap user input acquisition behind UI Adapter: await ui.promptInput()
- Keep the OpenAI streaming, tool execution, and logging exactly as-is; only route display and input through the adapter.

Library candidates and compatibility
1) neo-blessed (maintained fork of blessed)
- Pros: Mature full-screen layout, robust key handling, scrollable panes, low dependency surface, works with raw stderr/stdout and streaming; closer to the metal than React-based options.
- Cons: Layout/manual state handling is imperative; less component structure than React.
- Compatibility: ESM-friendly when imported via dynamic import; generally works in Node and Bun-compiled binaries. MIT license.

2) blessed (original)
- Pros: Huge adoption, a lot of examples and plugins (e.g., blessed-contrib)
- Cons: Less actively maintained vs neo-blessed; some terminal quirks; TypeScript typings are outdated.
- Compatibility: Similar to neo-blessed. MIT license.

3) Ink (React for CLIs, Vercel)
- Pros: Excellent component model, ecosystem (ink-text-input, ink-markdown, ink-table), easy streaming updates via state.
- Cons: Heavier dependency chain, often expects Node >= 16/18; integration with bun compile and ESM may require bundling; may need a build step for distribution.
- Compatibility: Great with Node (node index.mjs). Bun compile can work, but packaging complexity is higher. MIT license.

4) react-blessed
- Pros: React component model on top of blessed; smaller than Ink.
- Cons: Less active than Ink; docs/examples are older; more wiring required.
- Compatibility: Similar to blessed; React as peer dep adds weight. MIT license.

5) terminal-kit
- Pros: Powerful low-level terminal features (mouse, colors, input widgets), good performance.
- Cons: DIY for layout/model; fewer high-level primitives than blessed/Ink.
- Compatibility: Good with Node and bun. MIT license.

Recommendation
- Phase 1: Start with neo-blessed for a straightforward dashboard (chat panel, tool panel, status, input).
  - Rationale: Minimal friction, good performance with streaming, fewer packaging surprises for bun compile.
- Phase 2+: If a component model is desired, layer react-blessed or migrate to Ink once the UI adapter is stable.

Proposed UI layout (neo-blessed)
- Left main: Chat history pane (scrollable); stream deltas appended live.
- Right side: Tool calls and system events (scrollable), with timestamps and concise summaries.
- Bottom: Single-line input box with history; submit sends prompt.
- Footer: Status bar (model, rate-limit/backoff, hot-reload result, hints: F5 reload tools, F2 toggle logs, Ctrl+C exit).

Event Bus API (suggested)
- chat:user_input(text)
- chat:assistant_start()
- chat:assistant_delta(chunk)
- chat:assistant_done()
- tool:call_started({ id, name, argsPreview })
- tool:call_result({ id, name, ok, summary })
- sys:status(text)
- sys:log(line)  // mirrored to session log
- sys:reload_tools({ loaded, errors })

Adapter surface (suggested)
- ui.init(bus): set up UI, subscribe to events; return { dispose() }
- ui.promptInput(promptText): string  // ConsoleUI may delegate to readline; TuiUI opens input box
- ui.print(text): void  // optional, for non-structured lines
- ui.setStatus(text): void
- ui.confirmExit(): boolean  // handle Ctrl+C uniformly

Integration notes
- Streaming: replace process.stdout.write(...) with bus.emit('chat:assistant_delta', text); both UIs update accordingly.
- Tool calls: executeTool already logs details; emit start/result through the bus for visibility.
- Reload tools: after reloadTools(), emit sys:reload_tools so the UI can notify.
- Input: route all user prompts through ui.promptInput(); ConsoleUI simply wraps readline.question(); TuiUI opens its input widget.
- Logging: keep file logging unchanged; optionally mirror log lines to the TUI via sys:log.

Packaging and runtime
- Optional activation via env or CLI flag:
  - BMO_TUI=1 node index.mjs  → launch TuiUI
  - Default (no flag): ConsoleUI
- Bun-compiled binary: keep TUI as optional path; if dependencies are heavy (Ink), prefer starting with neo-blessed to minimize surprises.
- If TUI is not available (missing deps), fall back to ConsoleUI with a warning.

Phased implementation plan
Phase 0: IO abstraction (no TUI yet)
- Add a tiny UIBus (e.g., an internal EventEmitter) and UI Adapter interface.
- Implement ConsoleUI using existing behavior. Replace direct stdout prints and readline with ui.* calls and bus events.
- Ensure parity with current REPL.

Phase 1: TuiUI skeleton with neo-blessed
- New file: tui/ui-blessed.mjs exporting createTuiUI(bus, opts)
- Render layout, bind key handlers (F5 reload tools), hook into bus events, support clean exit.
- Gate activation on BMO_TUI=1 or a new CLI flag (--tui).

Phase 2: Tool-call insights and UX polish
- Rich tool-call panel: show name, args preview, ok/error state, elapsed time.
- Status bar improvements: show model, token counters (if/when available), last reload result.
- Input history and multiline editing.

Phase 3: Utilities and quality-of-life
- Keybinds: Ctrl+L clear, F2 toggle logs, Alt+Up/Down navigate panels, / search in panes.
- Copy-to-clipboard of last answer (best-effort, platform-specific fallback).
- Configurable themes and sizes.

Phase 4: Packaging
- Document BMO_TUI and required deps.
- If targeting Ink later, add a bundling step for the compiled binary or ship TUI as a separate Node entrypoint.

Open risks and mitigations
- Bun compile + complex TUI stacks: prefer neo-blessed initially.
- ESM interop: keep TUI lazily imported (dynamic import) to avoid startup failures when deps are missing.
- Terminal compatibility: conservative defaults; provide a runtime flag BMO_TUI_FORCE=1 to bypass TTY checks during testing.

Appendix: Minimal code sketch (for Phase 0–1)
- In index.mjs, introduce a tiny event emitter and adapter glue, then only switch printing/input over to it. Keep logic intact.
- Defer actual code changes until implementation begins; the TUI can be developed iteratively in its own files and gated by env.

Bootstrap prompt for the agent
Use the following prompt inside bmo to drive the implementation in steps:

"""
Goal: Add an optional terminal UI (TUI) to bmo-agent with streaming chat, tool-call visibility, and status, while preserving the existing REPL as default.

Phases:
1) Phase 0 — IO abstraction
- Add a minimal Event Bus and UI Adapter to index.mjs without changing behavior. Replace direct stdout writes and readline usage with bus/ui calls. Parity with current UX is required. Gate new code behind feature flags but keep REPL default.
- Deliverables: Event list (chat:*, tool:*, sys:*), ConsoleUI adapter.

2) Phase 1 — TuiUI skeleton (neo-blessed)
- Create tui/ui-blessed.mjs exporting createTuiUI(bus, opts) that mounts a full-screen layout: chat pane (left), events/tool pane (right), status bar, input line.
- Detect BMO_TUI=1 or --tui to activate the TuiUI; otherwise use ConsoleUI.
- Use dynamic import for TUI to avoid hard failure when deps are absent.

3) Phase 2 — Tool/UX polish
- Emit tool:call_started/result events with concise summaries and durations. Improve status updates, scrolling behavior, and input history.

4) Phase 3 — Keybinds and QoL
- F5 reload tools (calls reloadTools), F2 toggle logs, Ctrl+L clear, navigation keys.

Implementation rules (follow bmo Golden Path):
- Keep changes minimal and focused per phase.
- Add new files under bmo://tui/ (create directory) and gate imports behind dynamic import.
- Do not auto-commit outside bmo:// during user projects; for self-improvements under bmo://, commit with git_commit_path and include concise messages.
- After writing new files, call reload_tools if any tools were added/modified; note: core changes to index.mjs require using core_file + git_commit_path.

Start now with Phase 0. When done, summarize changes and show a short diff snippet for index.mjs.
"""
