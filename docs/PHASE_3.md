# Phase 3 — Tooling and Skills Framework

Phase 3 builds bmo's extensible tooling system: built-in tools, dynamic JS module tools, skills (structured knowledge documents), and a sandbox for agent-written code.

## Phase 3a — Tool Registry, run_command, Function Calling, Agent Loop (Complete)

### What was built

- **Tool registry** (`src/tools.ts`): `ToolDefinition` / `ToolRegistry` with `register`, `get`, `getSchemas`, `listNames`. Built-in vs dynamic tool distinction added in 3b.
- **run_command** built-in tool: executes shell commands via `Bun.spawn(["bash", "-c", ...])` with timeout, truncation, and env sanitization (`PAGER=cat`, `GIT_PAGER=cat`, `NO_COLOR=1`, `TERM=dumb`).
- **Function calling integration**: `getSchemas()` produces OpenAI-compatible tool schemas. Agent loop handles `tool_calls` in assistant responses.
- **Agent loop** (`src/agent-loop.ts`): multi-turn loop — send messages → receive response → if tool_calls, execute tools, append results, loop. Streams text deltas to TUI. Handles errors, retries, and budget limits.
- **Tool call prelude**: auto-generated one-line summary for each tool call displayed in TUI (`formatToolCallSummary`).

### Key files
- `src/tools.ts` — registry + run_command
- `src/agent-loop.ts` — multi-turn agent loop
- `src/agent-loop.test.ts` — tests

## Phase 3b — Skills Registry, Tool Loader, load_skill, reload_tools (Complete)

### What was built

- **Skills registry** (`src/skills.ts`): YAML front-matter parser, `SkillsRegistry` with `scan()`, `list()`, `loadContent()`. Indexes `skills/*.md` files.
- **load_skill** built-in tool: loads a skill document into conversation context by name. Returns full markdown content.
- **JS module tool loader** (`src/tool-loader.ts`): scans `tools/*.mjs`, dynamically imports with cache-busting (`?v=<timestamp>`), validates exports (`schema`, `run`), checks optional `requires` dependencies via `which`.
- **reload_tools** built-in tool: clears dynamic tools, rescans tools + skills directories, returns formatted summary.
- **Built-in vs dynamic distinction** (`src/tools.ts`): `builtins: Set<string>` tracks built-in tools that survive `clearDynamic()`. Collision guard prevents dynamic tools from overwriting builtins.
- **System prompt expansion** (`src/prompt.ts`): refactored to `SystemPromptOptions` object. Injects available skills list and dynamic tools list. Prompt now includes tool format, skills format, and creating tools workflow.
- **F5 keybinding**: wired to reload tools + skills and rebuild system prompt.
- **TUI integration** (`src/tui.ts`): `startTui()` made async. Boot sequence: create registries → register builtins → initial load → build system prompt. Reload wraps to also rebuild system prompt.

### Key files
- `src/skills.ts` + `src/skills.test.ts` — skills registry, front-matter parser, load_skill
- `src/tool-loader.ts` + `src/tool-loader.test.ts` — dynamic loader, reload_tools, initialLoad
- `src/tools.ts` + `src/tools.test.ts` — builtin/dynamic distinction
- `src/prompt.ts` + `src/prompt.test.ts` — options object, skill/tool list injection
- `src/tui.ts` — integration wiring

## Phase 3c — Tool Sandbox (Complete)

### What was built

- **Subprocess isolation** (`src/sandbox.ts`): dynamic `.mjs` tools execute in a child process (`Bun.spawn`) instead of in-process. Communication via JSON over stdin/stdout.
- **Sandbox runner** (`src/sandbox-runner.ts`): standalone entry point spawned by `executeSandboxed()`. Reads JSON request from stdin, applies sandbox restrictions, imports tool module, calls `run()`, writes JSON result to stdout.
- **Capability declarations**: tools optionally export `capabilities` object with `filesystem`, `network`, `subprocess`, `env` fields. Defaults to most restrictive: `{ filesystem: "project", network: false, subprocess: false, env: false }`.
- **Environment restriction**: `buildSandboxEnv()` constructs a restricted env for the child process. When `env: false`, only `PATH`, `HOME`, `TMPDIR`, `NODE_ENV` survive (API keys stripped). Sandbox metadata passed via `BMO_SANDBOX_*` env vars.
- **Runtime patches**: sandbox-runner patches `globalThis.fetch` (network restriction) and `Bun.spawn`/`Bun.spawnSync` (subprocess restriction) before importing the tool module.
- **Resource limits**: timeout via `setTimeout` → `proc.kill()`. Output size capped at `config.sandbox.outputLimitBytes`. Memory limiting via `ulimit -v` deferred (incompatible with Bun's virtual memory model).
- **SandboxConfig**: constructed from `config.sandbox` + runtime paths (`projectDir`, `bmoHome`), threaded through `loadDynamicTools`, `createReloadToolsTool`, `initialLoad`, and F5 reload handler.

### Key files
- `src/sandbox.ts` + `src/sandbox.test.ts` — types, resolveCapabilities, buildSandboxEnv, executeSandboxed
- `src/sandbox-runner.ts` — subprocess entry point
- `src/tool-loader.ts` + `src/tool-loader.test.ts` — sandbox integration
- `src/tui.ts` — SandboxConfig wiring

### Design notes
- Built-in tools (run_command, load_skill, reload_tools) remain trusted and in-process
- Enforcement is defense-in-depth via env vars and runtime patches, not a hard security boundary
- `ulimit -v` was attempted but Bun's large virtual address space allocation causes it to crash on startup; deferred to future phase

## Remaining Phase 3 Deferrals

These items from the Phase 3 plan are deferred to future work:

- **External tool support**: descriptor + executable for non-JS tools (polyglot tools)
- **Content sanitization**: strip prompt injection patterns from agent-written tool/skill content before injecting into LLM context
- **Tool usage telemetry**: per-call metrics (count, success/failure, latency, token cost) persisted in session files
- **Graduated tool trust**: probationary state for new tools, promoted after N successful uses
- **Memory limiting**: `ulimit -v` is incompatible with Bun; needs alternative approach (e.g., Bun API if available, or cgroup-based limits)
- **Filesystem restriction enforcement**: currently advisory (env var). Full enforcement would require intercepting fs calls in the sandbox runner.
