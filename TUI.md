TUI integration status and next steps

Overview
- Optional full-screen TUI is implemented using neo-blessed and a small event bus/UI adapter. The classic readline REPL remains the default when the TUI is not enabled.
- Goal: Improve streaming chat UX, tool-call visibility, and status while keeping a clean fallback.

Activation
- Enable the TUI with either:
  - BMO_TUI=1 node index.mjs
  - node index.mjs --tui
- Force-enable in non-TTY cases for testing with BMO_TUI_FORCE=1
- Terminal quirks: when TERM contains "ghostty", we override to xterm-256color to avoid capability issues. You can set BMO_TUI_TERM to override explicitly.

What the code does today
- index.mjs:
  - Emits structured events over a lightweight UIBus:
    - chat:user_input, chat:assistant_start, chat:assistant_delta, chat:assistant_done
    - tool:call_started, tool:call_result
    - sys:status, sys:reload_tools
  - Routes input through a UI adapter: ui.promptInput()
  - Suppresses stdout banners that would corrupt the screen when TUI is active (TUI_ACTIVE guards). Tool call logs and tools-loaded banners are not printed to stdout in TUI mode; they still emit via the bus and are written to the session log file.
  - Handles SIGINT/SIGTERM and ensures ui.dispose() is called in TUI mode before exit.
- tui/ui-blessed.mjs (neo-blessed):
  - Layout: left chat, right Tools pane (tool calls only), status bar, and a bottom input line.
  - Noisy input focus events have been removed; the Tools pane shows only tool → and tool ✓ lines with timestamps.
  - Robust cleanup and signal handling: Ctrl+C exits cleanly; terminal cursor/mouse/alt-buffer are restored to prevent stray characters post-exit.
  - ESC refocuses the input line.

User-visible behavior
- Tools pane contains tool calls only (start/result), not input focus noise.
- Console stdout is quiet during TUI sessions to avoid breaking the UI; all textual details still appear in the TUI and the session log file under ~/.local/share/bmo.
- Ctrl+C immediately exits the TUI and restores the terminal.

Open items and expectations (Phase 2+)
- Tool call UX polish:
  - Duration and concise args preview/truncation for tool:call_started/result entries.
  - Optional copyable details or a toggled drawer in the Tools pane.
- Input quality-of-life:
  - History navigation, optional multiline edit mode.
  - Ctrl+L to clear chat pane.
- Keybinds and commands:
  - F5 to reload tools (call reloadTools and surface the result via sys:reload_tools).
  - F2 to toggle a verbose logs pane (mirroring sys:status/sys:error).
- Status bar enhancements:
  - Show active model and base URL.
  - Token usage and timing (as data becomes available).
- Packaging and docs:
  - Document environment variables: BMO_TUI, BMO_TUI_FORCE, BMO_TUI_TERM.
  - Confirm behavior with Bun-compiled binaries.

Where/how to continue next
- Phase 2 focus: UX polish and keybinds
  1) Add timing around tool execution (start timestamp in executeTool; compute duration; include in tool:call_result).
  2) Add F5 keybind in TUI to call reloadTools() and display the result in Tools pane via the existing sys:reload_tools event.
  3) Add simple input history (in-memory ring) to the textbox; Up/Down cycle history when the input is empty.
  4) Add args preview truncation in the Tools pane (e.g., 120 chars, ellipsis).
- Phase 3 focus: QoL
  5) Add Ctrl+L to clear the chat pane; F2 to toggle a basic logs pane.
  6) Optionally show the active model/base in the status bar continuously.

Notes
- The UI bus + adapters are stable enough for incremental features. Keep new functionality behind the same events or add new sys:* events as needed.
- Continue to avoid direct stdout writes while the TUI is active; use bus events instead.
