# BMO_AGENTS.md — Golden Path for Adding New Tools

Formerly AGENTS.md at the project root. It now ships next to the installed tools so binaries can bundle and find it easily.

Purpose: make adding tools predictable, fast, and repeatable. Follow this checklist every time.

Quickstart (TL;DR)
- Prefer doing over suggesting. If you need a capability not covered by current tools, build a minimal tool immediately.
- Golden Path steps:
  1) Discover: list existing tools and confirm none fit
     - Use list_files path=bmo://tools/ and scan names
  2) Scaffold: create bmo://tools/<name>.mjs from the template below (use write_file)
  3) Hot‑reload: call reload_tools
  4) Verify: call the new tool once with a simple input; ensure ok:true
  5) Use: continue with the original task using the new tool

Environment specifics (this install)
- Tools directory: use the prefix bmo://tools/ (it routes to the active tools dir; currently bmo-tools/)
- Import helper utilities from ./lib.mjs in tools
- Every tool must export:
  - schema: OpenAI function tool schema
  - execute(args): async function that returns a JSON-serialized string
- Writes to bmo:// paths respect BMO_SOURCE if set (writes mirror to <BMO_SOURCE>/tools for persistence)

Minimal tool template (copy/paste)

import { resolvePath } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "tool_name", // lowercase_with_underscores; also use as filename tool_name.mjs
    description: "What this tool does (one sentence).",
    parameters: {
      type: "object",
      properties: {
        // arg1: { type: "string", description: "..." },
      },
      required: [],
    },
  },
};

export async function execute(args) {
  try {
    // Implement the smallest viable behavior here
    return JSON.stringify({ ok: true, result: "...", args });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), args });
  }
}

Step-by-step (expanded)
1) Investigate the smallest viable tool
   - Before building, check if an existing tool solves it (e.g., file_stats_simple for character counts)
   - Don’t assume file contents or structure. Always list_files/read_file first.

2) Write the tool file
   - Path: bmo://tools/<name>.mjs
   - Match schema.function.name to the filename (convention: <name>.mjs and name: "<name>")
   - Return JSON.stringify(...) from execute

3) Reload tools
   - Call reload_tools right after writing

4) Verify
   - Immediately call the new tool with a minimal input and check ok:true

5) Continue
   - Use the new tool to finish the user’s task

Common pitfalls (avoid these)
- Forgetting to call reload_tools after creating/modifying a tool
- Returning a plain object instead of JSON-serialized string from execute
- Importing from ../index.mjs (wrong in this install) — use ./lib.mjs
- Writing to the wrong path (use bmo://tools/... so it routes correctly)
- Skipping discovery: always confirm an existing tool can’t do it first

Decision heuristics
- Build a tool when:
  - You’d run more than one line of logic repeatedly in this session or future ones
  - You need FS/network/system access beyond current tools
- Don’t build when:
  - A single existing tool call or two can finish the task now

Verification pattern (example)
- Example task: “Read the number of characters in init.lua”
  1) Try existing tools first: call file_stats_simple with filename: "init.lua"
  2) Only if missing, create a minimal stats tool using this Golden Path

Notes behavior (inlining into the system prompt)
- Where this file lives when installed with the binary: BMO_HOME/bmo-tools/BMO_AGENTS.md
- Preferred (explicit) setup for binaries:
  - export BMO_NOTES_FILE=/absolute/path/to/BMO_AGENTS.md
- Alternative (implicit) setup:
  - export BMO_INLINE_NOTES=1
  - Note: some runtimes look for AGENTS.md by default; since this file is named BMO_AGENTS.md and lives under bmo-tools/, explicit BMO_NOTES_FILE is the most reliable cross-environment option.
- Disable notes entirely: export BMO_DISABLE_NOTES=1
- Running from source: if your repo used to inline AGENTS.md by default, either rename/update your project’s notes or set BMO_NOTES_FILE to point here for a single source of truth.

BMO environment variables (quick reference)
- BMO_HOME: active runtime home (auto-detected)
- BMO_SOURCE: if set, writes to bmo://tools mirror to <BMO_SOURCE>/tools for persistence
- BMO_NOTES_FILE: absolute path to a notes file to inline (recommended for binaries)
- BMO_INLINE_NOTES=1: attempt to inline a default notes file if available
- BMO_DISABLE_NOTES=1: never inline notes

Maintenance
- When you add a tool, append a short entry here (Tool Registry) with: name, purpose, inputs, outputs.

Tool Registry (append entries below)
- file_stats_simple — character/byte/line counts for a file
- file_stats — extended stats with encoding and bmo:// support
- list_files — list directories/files (supports bmo://)
- read_file — read a file (supports bmo://)
- write_file — write a file (supports bmo://). Mirrors to BMO_SOURCE if set
- reload_tools — hot-reload tools
- move_file — rename/move files (supports bmo://). Mirrors to BMO_SOURCE if set