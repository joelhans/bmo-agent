# bmo — Planning Overview

Vision
- Build bmo: a fast, pragmatic, and relentlessly self‑improving coding agent.
- Tech stack: TypeScript/Bun, pi-tui (TUI), OpenAI JS SDK via ngrok AI gateway.
- Ethos: do the task and improve the system—fix limitations and eliminate inefficiencies; simplify code and prune tools when warranted.

Roadmap (phased)
- Phase 0 — Foundations
  - Repository scaffold, package.json, bun scripts (dev, build, test, lint), TypeScript config.
  - Path resolution: BMO_HOME (env var → ~/src/bmo-agent), data dir (BMO_DATA env var → ~/.local/share/bmo).
  - config.json with defaults (gateway, models, context budgets, cost limits, sandbox, maintenance).
  - API key via OPENAI_API_KEY env var; logging to data dir.
- Phase 1 — Minimal TUI
  - pi-tui app with input editor, streaming output pane, and status line.
  - Session log file and concise runtime banner.
- Phase 2 — LLM integration
  - OpenAI JS SDK with baseURL pointed at ngrok AI gateway (multi-provider routing, failover, and key management handled by ngrok).
  - Model tiering: reasoning tier (Opus 4.5) for complex tasks, coding tier (Haiku) for routine work. Tier selected per request, user-overridable.
  - Conversation history management and system prompt bootstrapping.
  - Context window management (MVP): token counting (tier-aware), truncation, budget tracking. Cost tracking with session limit.
  - Session persistence and re-attach (`bmo --session <id>`).
  - Post-session reflection: on exit, bmo writes a short reflection to the session file (coding tier).
- Phase 3 — Tooling and skills framework
  - Built‑in tools (minimal starting set): run_command (safe), load_skill, reload_tools. File operations via run_command; bmo self-builds purpose-built tools as needed.
  - JS module tools (.mjs): `export schema` + `export async function run(args)` — hot-loadable via dynamic `import()`.
  - External tool support (secondary): descriptor + executable for non-JS tools.
  - Skills: structured knowledge documents (bmo://skills/*.md) that encode procedures, best practices, and domain expertise. Loaded into context on demand.
  - Tool sandbox: agent-written tools (.mjs and external) execute in isolated subprocess with capability-based restrictions. Built-in tools trusted and in-process.
  - Tool usage telemetry: lightweight per-call metrics (count, success/failure, latency, token cost) persisted in session files.
  - Tool execution contract (JSON in/out), auto-generated TUI prelude.
- Phase 4 — Self‑improvement loop
  - Golden Path for tools: write .mjs module (or descriptor + executable for non-JS), reload_tools, verify, use.
  - Golden Path for skills: write markdown to bmo://skills/, reload skill index, reference in future tasks.
  - Improvement hypotheses: state a testable prediction before each self-improvement; validate later.
  - User signal capture: detect corrections and log as learning events.
  - Core improvements: when needed, propose minimal, safe patches and announce "update available" (restart required). Do not auto‑restart.
  - Centralized improvements log: append an entry to docs/IMPROVEMENTS.md for each added tool/skill/core change.
  - BMO_SOURCE mirroring and commit policy (self‑improvements only, never commit user repos by default).
  - Self-maintenance protocol ("battery check"): after N sessions, bmo offers a proactive introspection pass — reviews telemetry, validates hypotheses, updates opportunities, writes state snapshot and experiment journal entry.
  - Capability inventory (self-model): structured summary of tools, skills, known limitations. Compact version in system prompt.
  - State snapshots and experiment journal (docs/EXPERIMENT.md): versioned captures of bmo's state; narrative log of evolution over time.
  - Pruning: deprecate/remove obsolete tools, skills, or code paths when superseded or unused.
- Phase 5 — Ergonomics, distribution
  - Clear errors and minimal interfaces for tools.
  - Sensible defaults for data locations and permissions.
  - Binary distribution via `bun build --compile`: produce a single executable so bmo can be run from any codebase without requiring a local clone or bun install.
- Phase 6 — Advanced (stretch)
  - Project discovery helpers, git-aware context, editor integrations.
  - Additional model routing via ngrok AI gateway configuration.
  - Optional file watcher to auto‑reload tools dir on changes (behind a flag).
  - Periodic opportunity analysis job: analyze logs + IMPROVEMENTS.md → write OPPORTUNITIES.md entries.
  - Evaluation framework: per-session metrics, cross-session aggregates, quantitative OPPORTUNITIES.md entries. Hypothesis validation.
  - Context window Phase B/C: conversation summarization and semantic compression.
  - Graduated tool trust: probationary state for new tools, promoted after N successful uses.
  - Tool versioning: archive old versions, roll back if new version underperforms.
  - Cross-project skill generalization: `scope` metadata, pattern promotion.
  - Cross-machine session summaries: sanitized export, offline collation via `bmo --aggregate`.

Key design decisions
- JS module tools (.mjs) as primary format: `export schema` + `export async function run(args)`. Hot-loadable via dynamic `import()`, no separate descriptor/executable pair needed. External executables supported as secondary path for polyglot tools.
- Bun as runtime and distribution: TypeScript for core, .mjs for agent-written tools, `bun build --compile` for single-binary distribution.
- ngrok AI gateway as LLM routing layer: bmo uses one SDK (OpenAI-compatible), ngrok handles multi-provider routing, failover, rate limiting, and key rotation. Adding a new model is a gateway config change, not a code change.
- Model tiering: reasoning tier (expensive, powerful) for architecture/debugging/self-improvement; coding tier (cheap, fast) for routine code generation and tool calls. Default to coding tier; escalate when justified.
- Skills as self-improvable knowledge: bmo can write skills that encode best practices (e.g., "how to use ripgrep effectively") and reference them in future sessions, building institutional knowledge over time.
- Tool descriptors support "requires" for dependency pre-flight checks (external tools only).

Success criteria
- Agent can: stream chat; manage files; add and immediately use new tools and skills via auto‑reload; propose core patches with "update available"; log improvements; prune obsolete tools; surface and optionally act on opportunities; resume sessions; track and report on its own efficiency; proactively introspect via self-maintenance; produce a quantifiable record of its own evolution.
