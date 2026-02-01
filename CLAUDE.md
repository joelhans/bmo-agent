# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is bmo?

bmo is a self-improving AI coding agent with a terminal UI. It features multi-provider LLM routing, an extensible tool/skills system with sandbox isolation, session persistence with cost tracking, and model tiering (reasoning vs. coding).

## Commands

```bash
bun run dev          # Run in development mode (bun run src/main.ts)
bun run build        # Build to dist/ (bun build --target bun)
bun run test         # Run all tests (bun test)
bun test src/tools.test.ts   # Run a single test file
bun run lint         # Check with biome
bun run lint:fix     # Auto-fix lint issues
bun run format       # Format code with biome
```

## Code Style

- **Biome** for linting and formatting (not ESLint/Prettier)
- Tabs for indentation, 120 char line width, LF line endings
- Double quotes, always semicolons
- Strict TypeScript: `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`

## Architecture

### Entry point and startup

`src/main.ts` parses CLI args → resolves paths → loads config → creates LLM client → starts TUI. The TUI (`src/tui.ts`) registers built-in tools, scans for dynamic tools/skills, builds the system prompt, and enters the input loop.

### Agent loop (`src/agent-loop.ts`)

Streaming loop: truncate context → stream LLM response → if tool calls, execute each and loop back; if text-only, return. Max 20 iterations. Implements `AgentDisplay` interface for TUI decoupling.

### LLM client (`src/llm.ts`)

Uses OpenAI SDK with configurable `baseURL` for multi-provider routing (ngrok AI gateway). Model strings are `"provider/model-name"` format. Emits a stream of typed `LlmEvent` objects (text, tool_call_start, tool_call_args, usage, done).

### Path resolution (`src/paths.ts`)

Two root directories:
- **BMO_HOME**: Agent's own codebase (tools/, skills/, docs/). Auto-detected from `import.meta.dir` in dev, falls back to data dir for compiled binary. Override with `$BMO_HOME`.
- **Data dir** (`~/.local/share/bmo`): Sessions, config, snapshots. Override with `$BMO_DATA`.

The `bmo://` prefix in paths resolves to BMO_HOME. Regular paths resolve against cwd.

### Tool system (`src/tools.ts`, `src/tool-loader.ts`, `src/sandbox.ts`)

- **ToolRegistry**: Map of name → ToolDefinition. Built-in tools cannot be overwritten by dynamic tools. `clearDynamic()` removes only non-builtin tools for hot-reload.
- **Built-in tools**: `run_command` (shell executor with pipefail, timeout, output truncation), `load_skill`, `reload_tools`.
- **Dynamic tools**: `.mjs` files in `tools/` directory, loaded via dynamic import. Each exports `schema`, `description`, `run(args)`, and optional `requires`/`capabilities`.
- **Sandbox** (`src/sandbox.ts` + `src/sandbox-runner.ts`): Dynamic tools execute in a subprocess. Capabilities (filesystem, network, subprocess, env) are enforced by monkey-patching globals in the subprocess.

### Skills system (`src/skills.ts`)

Markdown files in `skills/` with YAML front-matter (`name`, `description`, `triggers`). Scanned at startup, listed in system prompt. Loaded into conversation via `load_skill` tool.

### Context management (`src/context.ts`)

Token estimation heuristic: `ceil(chars / 3.5) + 4`. Truncation drops oldest non-system messages first, preserving the system prompt. `SessionTracker` accumulates token usage and cost against per-model pricing table.

### Model tiering (`src/tiering.ts`)

Defaults to coding tier (cheaper). Escalates to reasoning tier on error or when user message contains keywords like "architect", "debug", "refactor", "why does", "explain why".

### Configuration (`src/config.ts`)

`~/.local/share/bmo/config.json` with deep-merge over defaults. Covers: providers, model names, context budgets, cost limits, sandbox limits, maintenance settings.

### Session persistence (`src/session.ts`)

Full conversation history saved after every assistant turn. Session ID format: `YYYYMMDDHHmmss-XXXX`. Resume with `--session <id>`, list with `--sessions`.

### TUI (`src/tui.ts`)

Built on `@mariozechner/pi-tui`. Layout: scrollable output area, status line (version + cost), multiline input editor. Keybindings: Enter (submit), Ctrl+C (exit with reflection), F5 (reload tools/skills).

### System prompt (`src/prompt.ts`)

Assembled from: core behavioral prompt → available skills list → dynamic tools list → environment preamble (BMO_HOME, data dir, working dir).
