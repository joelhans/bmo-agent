# bmo — Requirements by Phase

Phase 0 — Foundations
- Functional
  - package.json, bun scripts (dev, build, test, lint), TypeScript configuration (bun handles TS natively).
  - Path resolution: BMO_HOME (env var → ~/src/bmo-agent), data dir (BMO_DATA env var → ~/.local/share/bmo). Create data dir and subdirectories (sessions/, snapshots/, summaries/) on first run.
  - config.json: read from data dir, merge with defaults, create with defaults if missing. Schema per ARCHITECTURE.md.
  - API key: read from OPENAI_API_KEY env var. Clear error if missing.
  - Logging: session log file under data dir with timestamps; file permissions sane.
- Non‑functional
  - Cross‑platform (Linux/macOS first); minimal external deps.
  - Clear error messages for missing env vars and config.
- Acceptance
  - Running the application prints runtime banner (showing resolved BMO_HOME, data dir, model names) and exits cleanly (no API key required for banner).
  - config.json created in data dir on first run with sensible defaults.

Phase 1 — Minimal TUI
- Functional
  - pi-tui app with input editor, output viewport, status line.
  - Keybindings: Enter=send, Ctrl+C=exit, F5=Reload Tools.
- Non‑functional
  - No freezing; responsive typing; bounded output buffer.
- Acceptance
  - Can type, see echo, and exit; session log file created.

Phase 2 — LLM integration
- Functional
  - OpenAI JS SDK with baseURL pointed at ngrok AI gateway; streaming chat with function calling.
  - Model tiering: reasoning tier (Opus 4.5 / GPT-4o) for complex tasks; coding tier (Haiku / GPT-4o-mini) for routine work. Conversation manager selects tier per request; user can override via TUI command.
  - System prompt injection at first turn; conversation history maintained.
  - Context window management (MVP): token counting (tier-aware budgets), tool-result truncation at ingestion, oldest-turn dropping when budget exceeded. Token usage and cost shown in status line.
  - Token cost budget: configurable session cost limit; bmo pauses and asks before exceeding it.
  - Session persistence: auto-save after each assistant turn; re-attach via `bmo --session <id>`; list sessions via `bmo --sessions`.
  - Post-session reflection: on exit, bmo writes a short reflection (coding tier) to the session file — what worked, what didn't, what to change.
- Non‑functional
  - Graceful network error handling; resumable after transient errors.
  - Adding a new model is a ngrok gateway config change, not a code change.
  - Default to coding tier to minimize cost; escalate to reasoning tier only when justified.
- Acceptance
  - Simple Q&A works; streaming tokens render in TUI; tool_calls captured into state.
  - Token count and cost visible in status line; long conversations degrade gracefully (no crash on context overflow).
  - Can exit and re-attach to a session with history intact; session file contains a reflection.
  - Model tier selection observable in TUI (status line or prelude shows which tier is active).

Phase 3 — Tooling, skills, and sandbox
- Functional
  - Built‑in tools (minimal starting set): run_command (safe), load_skill, reload_tools. All file operations handled via run_command initially; bmo builds purpose-built tools as it discovers friction.
  - JS module tools (.mjs): discovered from tools dir, hot-loaded via dynamic `import()`. Export `schema` + `async function run(args)`.
  - External tools (secondary): load JSON descriptors, validate (including dependency checks via "requires"), execute as child processes.
  - Tool sandbox: all agent-written tools (.mjs and external) execute in an isolated subprocess with capability-based restrictions (filesystem scope, network, subprocess, env). Built-in tools are trusted and run in-process. Resource limits (timeout, memory, disk) enforced on all sandboxed tools.
  - Capability declarations: tools declare `capabilities` export (or descriptor field). Undeclared capabilities default to most restrictive. First use of elevated capabilities requires user confirmation.
  - Content sanitization: self-written content (skills, tool descriptions) stripped of prompt injection patterns before loading into LLM context.
  - Tool usage telemetry: every tool call instrumented with invocation count, success/failure, latency, token cost. Persisted in session file. Feeds pruning, graduated trust, hypothesis validation, and self-maintenance.
  - Skills: indexed from bmo://skills/*.md at boot; list injected into system prompt; load_skill tool reads full content into context.
- Non‑functional
  - Safety guards in run_command; configurable timeouts; no pager/colors for common CLIs.
  - Agent-written tools cannot bypass run_command safety guards (subprocess: false by default).
- Acceptance
  - From the TUI, use run_command to write a .mjs module tool, call reload_tools, call the new tool, see result.
  - Agent-written tool cannot read files outside project dir or BMO_HOME without declaring filesystem: "both".
  - Agent-written tool with network: false cannot make HTTP requests.
  - load_skill loads a skill document into context and bmo references it.
  - Tool call metrics (count, latency, success) visible in session file after a session with tool use.

Phase 4 — Self‑improvement loop
- Functional
  - Golden Path for tools: write .mjs module (or descriptor + executable for non-JS), auto-reload, verify, use. Error recovery: 3 retries max, cost circuit breaker, clean up broken tools.
  - Golden Path for skills: write markdown to bmo://skills/, reload skill index, reference in future tasks.
  - Improvement hypotheses: before each self-improvement, state a testable prediction. Logged in IMPROVEMENTS.md.
  - User signal capture: detect corrections and log as learning events for the analyzer.
  - Self-maintenance protocol ("battery check"): after N sessions (default 10) without maintenance, bmo offers to run an introspection pass. Reviews telemetry, validates hypotheses, scans reflections for patterns, updates OPPORTUNITIES.md, writes a state snapshot and experiment journal entry. User can decline.
  - Capability inventory (self-model): structured summary of current tools, skills, known limitations, and recent changes. Regenerated during self-maintenance. Compact summary injected into system prompt.
  - State snapshots: versioned capture of tool/skill inventory, config (sanitized), aggregate metrics, hypothesis scorecard. Stored in data/snapshots/.
  - Experiment journal (docs/EXPERIMENT.md): higher-level narrative log of bmo's evolution. Updated during self-maintenance.
  - Self-improvement uses reasoning tier; routine tool calls use coding tier.
  - Mirror writes to BMO_SOURCE when set; never auto‑commit user repos.
  - Auto-generated one‑line prelude for every tool call (tool name + args summary).
  - Append an entry to docs/IMPROVEMENTS.md for each new tool/skill/core/docs change.
  - Reload the registry via reload_tools after writing to tools/.
- Non‑functional
  - Clear errors when tool modules fail to load or descriptors are invalid.
- Acceptance
  - Agent can add, verify, and use a new tool in the same session without manual reload; IMPROVEMENTS.md contains a new structured entry.
  - Agent can write a new skill and reference it within the same session.
  - After N sessions, bmo offers a self-maintenance pass; maintenance produces a state snapshot and experiment journal entry.
  - Capability inventory is present in system prompt and reflects current tool/skill state.

Phase 5 — Ergonomics/distribution
- Functional
  - Mask secrets in logs (API keys, tokens detected via pattern matching).
  - Binary distribution: `bun build --compile` produces a single executable. bmo binary can be run from any codebase without a local clone or bun install.
- Non‑functional
  - Fast startup; minimal overhead per streamed token.
  - Binary works cross-platform (Linux/macOS at minimum).
- Acceptance
  - run_command refuses `rm -rf /` unless explicitly allowed; logs mask API keys.
  - Compiled binary runs correctly outside the source tree; tools dir resolved via BMO_HOME.

Phase 6 — Advanced (optional)
- Functional
  - Git context helpers; project indexers; semantic search of workspace.
  - Additional model routing via ngrok AI gateway configuration; configuration UI in TUI.
  - Background analyzer: after X days or Y invocations, analyze logs (including reflections + learning events) + IMPROVEMENTS.md and write OPPORTUNITIES.md items. Validate improvement hypotheses.
  - Evaluation metrics: per-session token/cost/tool stats persisted; cross-session aggregates surfaced by analyzer.
  - Context window Phase B: summarize dropped turns instead of discarding; Phase C: semantic compression.
  - Graduated tool trust: new agent-written tools start in probationary state (user confirms each call). After N successful uses, promoted to autonomous. Skipped tools flagged for review.
  - Tool versioning: old versions archived to tools/archive/<name>.v<N>.mjs on rewrite. If the new version has more failures, bmo can roll back. Versions that perform better survive.
  - Cross-project skill generalization: skills gain optional `scope` in front-matter (universal | language:X | framework:Y). Analyzer can identify recurring project-specific patterns and suggest promoting to universal skills.
  - Cross-machine session summaries: sanitized summary export (metrics, tool usage, hypothesis outcomes, reflection — no code or secrets). `bmo --aggregate` collates summaries from multiple sources into a combined report.
- Acceptance
  - Demonstrable productivity improvement on multi‑file tasks; OPPORTUNITIES.md populated with quantitative signals.
  - Multiple models routable via gateway configuration.
  - At least one improvement hypothesis validated or invalidated by the analyzer.
