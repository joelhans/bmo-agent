# AGENTS.md — bmo codebase guide

This file documents the bmo repository itself: how the runtime is structured, where things live, and how to work on bmo when you are inside this repo. The Golden Path for creating new tools now lives with the installed tools at tools/BMO_AGENTS.md and ships with the binary.

What lives where
- index.mjs — the core runtime (system prompt builder, tool loader, REPL, logging). Modify carefully.
- tools/ — source tools used when running from the repo. The installed/binary layout mirrors to bmo-tools/ at runtime.
  - tools/lib.mjs — shared helpers for tools (path resolving, reload callback registration, etc.).
  - tools/*.mjs — one file per tool (schema + execute returning a JSON string, and a required details(args) export).
  - tools/BMO_AGENTS.md — Golden Path for adding tools (bundled with binaries). Use this when creating/editing tools.
- dist/ — build artifacts (e.g., compiled binaries).
- CAPTAINS_LOG.md — running notes/changelog for development sessions.
- STARTING_PROMPT.md — base prompt used historically; superseded by the system prompt in index.mjs.

Notes inlining behavior (how docs get into the model)
- Precedence at runtime:
  1) BMO_NOTES_FILE — absolute path; if set, that file is inlined.
  2) If AGENTS.md exists in the current working directory, that file is inlined.
  3) Otherwise, tools/BMO_AGENTS.md (from the active tools dir) is inlined so binaries always have guidance.
  4) Set BMO_DISABLE_NOTES=1 to disable inlining.
- BMO_INLINE_NOTES=1 enables inlining when not running in this repo (useful for generic directories).

Conventions when hacking on tools in this repo
- Schema + execute + details: every tool exports schema (OpenAI function tool definition), execute(args) that returns JSON.stringify(...), and details(args) that returns a concise string for the core prelude (e.g., cmd=..., file=..., path=...) plus optional reason=....
- Import helpers from ./tools/lib.mjs inside tools (not from index.mjs).
- File paths: use bmo:// prefix to target the active runtime home (installed tools or repo tools).
- After adding/modifying a tool, call reload_tools so the runtime hot-reloads it.
- Keep tools minimal and focused; prefer building a small tool over complex inline logic.

Creating a new tool
- Follow tools/BMO_AGENTS.md (the Golden Path). It covers discovery, scaffolding, hot‑reload, verification, and common pitfalls.

Testing locally
- Run the REPL via node index.mjs (or the built binary). The session log path prints on startup.
- Use list_files/read_file/write_file tools for file changes; don’t assume file contents.

Release/deploy notes
- Binaries place installed tools under BMO_HOME/bmo-tools/. tools/BMO_AGENTS.md ships alongside them.
- To ensure consistent notes in binaries, prefer setting BMO_NOTES_FILE to the absolute path of BMO_AGENTS.md.
