# bmo — Architecture

Core components
- TUI (pi-tui)
  - Components: input editor, streaming output viewport, status line.
  - Keybindings: send, reload tools, show help, exit.
  - Differential rendering and synchronized output for flicker-free display.
- LLM Client
  - OpenAI JS SDK with baseURL pointed at ngrok AI gateway.
  - ngrok handles provider routing (OpenAI, Anthropic, Google, Ollama, etc.), failover, retries, key rotation, and rate limiting.
  - bmo sees a single OpenAI-compatible endpoint; adding/switching models is a gateway config change.
  - Streaming chat with function calling; tool schemas sent as OpenAI-format tools.
  - Model tiering: bmo selects a model tier per request (see Model tiering section below).
- Conversation Manager
  - System prompt assembly (see SYSTEM_PROMPT.md), user/assistant/tool messages.
  - Context window management (see below).
  - Log to session file under data dir.
  - Session persistence: sessions serialized to disk; resumable via session ID.
- Tool Registry
  - Built‑in tools (JS modules bundled with bmo) registered at boot.
  - JS module tools: discovered from tools dir, hot-loaded via dynamic `import()`.
  - External tools: discovered from tools dir via JSON descriptors; executed as child processes.
  - Reload on demand: bmo calls reload_tools after writing a tool module or descriptor via run_command.
- Tool Runner
  - Built-in tools: run in-process (trusted code, full access).
  - Agent-written tools (.mjs and external): run in an isolated subprocess via the capability sandbox (see Tool sandbox section).
  - All tools must return a JSON-serializable result object.
- Skills Registry
  - Structured knowledge documents stored at bmo://skills/*.md.
  - Indexed at boot: each skill has a filename-derived name and a front-matter description.
  - Loaded into LLM context on demand (bmo decides which skills are relevant, or loads explicitly via load_skill tool).
  - Skill list (names + descriptions) included in system prompt so bmo knows what's available.
- Config & Paths
  - BMO_HOME: where bmo's code lives (tools/, skills/, docs/). The bmo:// prefix routes here.
    - Resolution: BMO_HOME env var → fallback ~/src/bmo-agent.
    - Contains: tools/, skills/, docs/, source code.
  - Data dir: where runtime state accumulates (sessions, snapshots, telemetry, config).
    - Resolution: BMO_DATA env var → fallback ~/.local/share/bmo (XDG-compliant).
    - Contains: config.json, sessions/, snapshots/, summaries/, telemetry.json, inventory.json.
  - BMO_SOURCE: optional env var pointing to the canonical source checkout for self‑improvement commits. When set, bmo commits changes here instead of BMO_HOME.
  - API key: OPENAI_API_KEY env var (standard for OpenAI SDK). Since ngrok gateway is OpenAI-compatible, this is the gateway key. No key stored in config.json.
- Improvements & Opportunities
  - IMPROVEMENTS.md (append-only): updated on every self‑improvement (tools/skills/core/docs).
  - OPPORTUNITIES.md: populated by a periodic analyzer job.

config.json schema
- Location: <data_dir>/config.json (created with defaults on first run if missing).
- All fields have sensible defaults. The file is optional — bmo runs without it.
- User-managed fields (set by human, bmo reads):
    {
      "gateway": {
        "baseUrl": "https://your-gateway.ngrok.app/v1"
      },
      "models": {
        "reasoning": "anthropic/claude-opus-4-5-20250514",
        "coding": "anthropic/claude-haiku-3-5-20250620"
      },
      "context": {
        "reasoning": { "maxTokens": 200000, "responseHeadroom": 8192 },
        "coding": { "maxTokens": 200000, "responseHeadroom": 4096 }
      },
      "cost": {
        "sessionLimit": 2.00,
        "selfImprovementLimit": 0.50,
        "selfImprovementRetries": 3
      },
      "sandbox": {
        "defaultTimeoutMs": 30000,
        "memoryLimitMb": 256,
        "outputLimitBytes": 1048576
      },
      "maintenance": {
        "threshold": 10,
        "budgetLimit": 1.00
      },
      "toolResultTruncation": 50000
    }
- bmo-managed fields (updated by bmo, human can read):
    {
      "maintenance": {
        "sessionsSinceLastMaintenance": 0,
        "lastMaintenanceDate": null
      }
    }
- Notes:
  - gateway.baseUrl: the ngrok AI gateway endpoint. OpenAI SDK's baseURL is set to this.
  - models.*: model name strings passed to the OpenAI SDK model field. ngrok routes based on these. The prefix (e.g., "anthropic/") depends on your gateway config.
  - context.*.maxTokens: the provider's context window size for that model. Used by the conversation manager to compute budget.
  - context.*.responseHeadroom: tokens reserved for the model's response. Budget = maxTokens - responseHeadroom - system prompt - tool schemas.
  - cost.sessionLimit: bmo pauses and asks before exceeding this per-session cost ($).
  - cost.selfImprovementLimit: circuit breaker for a single self-improvement attempt.
  - sandbox.*: resource limits for agent-written tools running in subprocess.
  - maintenance.threshold: sessions between battery checks.
  - toolResultTruncation: max characters for a single tool result before truncation.
  - Cost estimation uses token counts from the API response (usage.prompt_tokens, usage.completion_tokens) multiplied by per-model rates. Per-model pricing is hardcoded initially (fewer moving parts); can move to config later if needed.

System prompt assembly
- The system prompt is built at session start by concatenating:
  1. Static content from SYSTEM_PROMPT.md (the core behavioral instructions).
  2. Dynamic preamble: "BMO_HOME is <resolved_path>. Data dir is <resolved_path>. Working directory is <cwd>."
  3. Capability inventory summary (from data/inventory.json if it exists): tool names + one-line descriptions, skill names + descriptions, known limitations.
  4. Skill list: names and descriptions of all available skills (from the skills registry).
- The assembled prompt is a single system message at the start of the conversation.
- On session re-attach, the same prompt is rebuilt (capability inventory may have changed between sessions).
- Token cost of the system prompt is measured and subtracted from the context budget.

Model tiering
- Two tiers, configured in config.json as model name strings routed by ngrok:
  - Reasoning tier (e.g., Opus 4.5, GPT-4o): architecture decisions, complex debugging, multi-file reasoning, self-improvement decisions (tool/skill design), analyzing errors, writing skills.
  - Coding tier (e.g., Haiku, GPT-4o-mini, Codestral): straightforward code generation, simple file edits, routine tool calls, summarization for context compaction.
- Selection: the conversation manager picks the tier per request based on heuristics:
  - Default is coding tier (cheaper, faster).
  - Escalate to reasoning tier when: the user's request involves multi-file changes, debugging, architectural questions, or self-improvement; or when the coding tier fails or produces low-confidence output.
  - Explicit override: user can force a tier via a TUI command or config flag.
- Implementation: bmo sets the `model` field in the OpenAI SDK request. ngrok routes to the appropriate provider/model based on this field.
- Context budget is tier-aware: each tier may have a different max context length (configured in config.json). The conversation manager uses the budget for the currently selected tier.

Context window management
- Token counting: track token usage from the API response (usage.prompt_tokens, usage.completion_tokens). For pre-request budget estimation, use js-tiktoken or a character-based heuristic (chars/4). Maintain a running total.
- Budget: reserve tokens for system prompt + tool schemas + skill list + response headroom. Remaining budget is available for conversation history. Budget limit is tier-aware (reasoning tier typically has a larger window).
- Truncation strategy (phased):
  - Phase A (MVP): when history exceeds budget, drop the oldest user/assistant/tool turns (keep system prompt and the most recent N turns). Tool results are truncated first (they're the largest and least re-readable).
  - Phase B: summarize dropped turns into a single "conversation so far" assistant message prepended after the system prompt. The summary is generated via the coding tier (cheap).
  - Phase C: semantic compression — identify which prior tool results are still referenced and keep those; aggressively drop the rest.
- Tool result truncation: large tool outputs (e.g., run_command on a big file) are capped at a configurable max length with a trailing "[truncated — N chars omitted]" marker. Applied at ingestion, not retroactively.
- Skill loading: loading a skill via load_skill injects its content as a system-level message. This counts against the context budget. If loading a skill would exceed budget, warn and truncate older history first.
- Token usage displayed in status line (current / budget).

Token cost budget
- Per-session cost tracking: accumulate estimated cost from prompt + completion tokens across all requests (using per-model pricing from config).
- Configurable session cost limit (config.json, e.g., $2.00 default). When the limit is hit, bmo pauses and asks the user before continuing.
- Self-improvement circuit breaker: if a tool-creation or skill-writing attempt exceeds N retries (default 3) or $X in cost (default $0.50), abandon the attempt, log the failure to IMPROVEMENTS.md, and continue with the original task using existing tools.
- Cost displayed in status line alongside token count.

Session persistence
- Each session gets a unique ID and is serialized to data dir (sessions/<id>.json).
- Session file contains: full message history, active tool registry snapshot, session metadata (start time, working dir, token counts).
- Re-attach: `bmo --session <id>` loads the session file and resumes. The conversation history is fed back to the LLM as context (subject to truncation if it exceeds the window).
- Session list: `bmo --sessions` shows recent sessions with timestamps and last-message preview.
- Auto-save: session state written after every assistant turn.

Paths and conventions
- bmo:// prefix resolves to BMO_HOME (see Config & Paths above for resolution order).
- Regular relative/absolute paths are the user's project workspace (cwd).
- Writes to bmo:// mirror to BMO_SOURCE when that env var is set.
- The system prompt tells bmo the resolved BMO_HOME and data dir paths so it can use them in run_command calls.

Tool model
- Two tool formats, both registered in the same registry:

  JS module tools (primary):
  - File: tools/<name>.mjs (ES modules, plain JavaScript)
  - Exports: `schema` (JSON schema object) and `async function run(args)` (returns result object).
  - Optional export: `requires` (string array of external deps).
  - Loaded via dynamic `import()` at registration; re-importable on change (requires cache-busting — see Reloading section).
  - Example (tools/file_stats.mjs):
    export const schema = {
      type: "object",
      properties: {
        filename: { type: "string", description: "Path to the file" }
      },
      required: ["filename"]
    };
    export async function run({ filename }) {
      const { stat } = await import("node:fs/promises");
      const s = await stat(filename);
      return { ok: true, result: { size: s.size } };
    }

  External tools (secondary, for non-JS tools):
  - Descriptor (JSON): tools/<name>.json (name, description, schema, command, requires).
  - Executable: tools/bin/<name> (reads JSON from stdin, writes JSON to stdout).
  - Example descriptor (tools/file_stats_simple.json):
    {
      "name": "file_stats_simple",
      "description": "Character/byte/line counts for a file",
      "schema": {
        "type": "object",
        "properties": {
          "filename": { "type": "string", "description": "Path to the file" }
        },
        "required": ["filename"]
      },
      "command": "./bin/file_stats_simple",
      "requires": ["wc"]
    }
  - Executable contract: read JSON from stdin, write single JSON line to stdout with ok: true/false.

- Tool call prelude: the TUI auto-generates a one-line summary for each tool call from the tool name and arguments (e.g., "file_stats(filename=README.md)"). No per-tool configuration needed.
- Dependency declarations: optional "requires" lists external binaries needed. Checked at registration (via `which`); tools with missing deps are marked unavailable with a clear error.

Tool sandbox
- Applies to all agent-written tools (.mjs modules and external executables). Built-in tools are trusted and exempt.
- Execution model: agent-written .mjs tools and external tools both run in a subprocess (bun spawns a child process). Communication is via stdin (JSON args) / stdout (JSON result). This gives .mjs tools and external tools the same execution model and the same security boundary.
- Capability declarations: tools declare what they need in their exports (or descriptor for external tools):
    export const capabilities = {
      filesystem: "project",  // "project" | "bmo" | "both" | "none" (default: "project")
      network: false,          // default: false
      subprocess: false,       // default: false
      env: false               // default: false
    };
- Enforcement: the subprocess wrapper restricts access based on declared capabilities:
  - filesystem: "project" — fs operations scoped to current working directory tree.
  - filesystem: "bmo" — scoped to BMO_HOME.
  - filesystem: "both" — project dir + BMO_HOME.
  - network: false — fetch, http, net, tls unavailable.
  - subprocess: false — child_process, Bun.spawn unavailable. Prevents bypassing run_command safety guards.
  - env: false — process.env returns empty object. Prevents API key exfiltration.
- Undeclared capabilities default to the most restrictive option.
- Resource limits enforced by the subprocess:
  - Timeout: configurable per tool (default 30s), killed on exceed.
  - Memory: ulimit-based cap (default 256MB).
  - Disk: output size cap on stdout (default 1MB).
- Content sanitization: when loading self-written content (skills, tool descriptions) into the LLM context, strip lines matching prompt injection heuristics (lines starting with "Ignore", "System:", "You are", or containing "previous instructions"). Log stripped content for review.

Skills model
- Skills are structured markdown documents at bmo://skills/<name>.md.
- Front-matter (YAML) declares metadata:
  ---
  name: ripgrep_mastery
  description: Best practices for using ripgrep effectively in code search tasks
  triggers: [search, grep, find, code search, ripgrep, rg]
  ---
- Body contains procedural knowledge, examples, common patterns, pitfalls.
- Skill list (name + description) injected into system prompt so bmo can choose which to load.
- load_skill built-in tool reads a skill's full content into the current conversation context.
- bmo can write new skills from experience (part of the self-improvement loop).

Built‑in tools (minimal starting set)
- run_command: execute a shell command with safety guards (pipefail, timeout, no pager/color, destructive-command confirmation). Returns stdout, stderr, and exit code. This is bmo's universal tool — all file operations (ls, cat, mkdir, cp, mv, write via heredoc/echo), git, and any shell utility are available through it. Verbose in tokens compared to purpose-built tools, but that friction is intentional: it creates pressure for bmo to self-improve.
- load_skill: read a skill document from bmo://skills/ and inject its content into the conversation context. Takes a skill name; returns the full markdown body. This is a runtime operation (modifying message history), not a file operation — it cannot be replicated via run_command.
- reload_tools: trigger the tool registry to rescan the tools directory. bmo calls this after writing a new tool via run_command. Validates tools, checks dependency availability, updates the function calling tools list, and shows a concise summary (loaded/unavailable/errors).
- Everything else (file listing, reading, writing, moving, secret scanning, user preferences, progress reporting) can be done through run_command initially. bmo is expected to build purpose-built tools for common operations as it discovers friction — that's the self-improvement loop in action.

Reloading
- Explicit: bmo calls reload_tools after writing a tool module or descriptor via run_command.
- Manual: TUI action (Reload Tools / F5) re-imports JS modules and re-scans descriptors.
- Cache busting: the runtime caches dynamic `import()` results. On reload, append a query string (`?v=<timestamp>`) to the module path to force a fresh import. Without this, updated tool modules silently return stale code.
- On reload: validate tools; check dependency availability; update function calling tools list; show concise summary (loaded/unavailable/errors).
- Optional: file watcher to auto‑reload on filesystem changes (behind a flag).

Tool usage telemetry
- Every tool call is instrumented with lightweight counters persisted in the session file:
  - Invocation count (per tool, per session).
  - Success / failure count and failure reasons.
  - Latency (wall-clock ms per call).
  - Token cost (prompt + completion tokens attributed to the call).
- Aggregated across sessions by the background analyzer into a tool health table:
  - Total uses, success rate, mean latency, mean token cost, last-used session.
  - Stored in data/telemetry.json (overwritten on each analyzer run).
- Telemetry feeds: pruning decisions (unused tools), graduated trust (success count), hypothesis validation (before/after comparisons), and the self-maintenance protocol.
- No telemetry leaves the machine. All data stays under the bmo data dir.

Capability inventory (self-model)
- bmo maintains a structured summary of its current capabilities, updated after each self-improvement:
  - Tool inventory: name, description, capability declarations, telemetry summary (uses, success rate).
  - Skill inventory: name, description, triggers, load count.
  - Known limitations: explicit list of things bmo cannot currently do, inferred from recent failures and user corrections.
  - Recent changes: last N improvements with hypothesis status.
- Stored in data/inventory.json; regenerated during self-maintenance or on demand.
- Injected into the system prompt as a compact summary (tool names + one-line descriptions + known limitations) so bmo can reason about what it can and cannot do before choosing an approach.
- This is what separates "an agent with tools" from "an agent that knows itself."

State snapshots
- Periodically (during self-maintenance or on demand via `bmo --snapshot`), capture a versioned snapshot:
  - Tool inventory + telemetry summary.
  - Skill inventory.
  - Config (sanitized — no API keys).
  - Aggregate metrics: total sessions, total tool calls, hypothesis scorecard, token efficiency trend.
- Stored in data/snapshots/<session-id>.json.
- Enables diffing "bmo at session 10" vs "bmo at session 50" to see exactly what evolved.
- Snapshots are append-only; never modified after creation.

Self-maintenance protocol ("battery check")
- Proactive introspection triggered by staleness:
  - Counter: sessions since last maintenance pass (stored in config.json).
  - Threshold: configurable (default 10 sessions).
  - When threshold is reached, bmo prompts: "I haven't checked my own batteries in a while. Mind if I take a look?" User can decline.
- What the maintenance pass does (reasoning tier):
  1. Review tool telemetry — flag unused tools (0 uses in last N sessions) and high-failure tools (>30% failure rate) for pruning or repair.
  2. Check pending hypothesis outcomes — compare predicted improvements against actual telemetry. Mark validated or invalidated in OPPORTUNITIES.md.
  3. Scan recent session reflections for recurring patterns (e.g., "I keep struggling with X").
  4. Update OPPORTUNITIES.md with findings.
  5. Write a state snapshot.
  6. Append an entry to the experiment journal (EXPERIMENT.md).
  7. Suggest concrete actions: prune tool X, write skill for pattern Y, investigate failure Z.
  8. Reset the staleness counter.
- The maintenance pass is the mechanism that closes the loop between collecting data and acting on it. Without it, telemetry and reflections just accumulate.
- Cost guard: maintenance pass has a budget cap (default $1.00). If exceeded, stop and log partial results.

Post-session reflection
- At the end of every session (on exit or idle timeout), bmo writes a short reflection using the coding tier:
  - What was the task?
  - What went well?
  - What was slow, awkward, or failed?
  - What would bmo do differently next time?
- Stored as a `reflection` field in the session file (3-5 sentences).
- Gives the periodic analyzer much richer input than raw tool-call logs. Reflections surface patterns ("I keep hitting X problem") that metrics alone miss.

Logging
- Session file under data dir with timestamps for messages and tool calls.
- IMPROVEMENTS.md appended with structured entry for each self‑improvement.
- OPPORTUNITIES.md updated by background analyzer job.
- Stdout/stderr from external tools captured; stderr summarized on failure.

Improvement hypotheses
- Before making a self-improvement, bmo states a testable claim:
  - "I believe creating tool X will reduce token usage for Y-type tasks by Z%."
  - "I believe skill X will prevent the repeated mistake I made in sessions A, B, C."
- Recorded in IMPROVEMENTS.md (Hypothesis field) alongside the improvement entry.
- The evaluation framework validates hypotheses: after N sessions, did the predicted improvement materialize?
- Validated/invalidated hypotheses are recorded in OPPORTUNITIES.md (Validated field) so the analyzer can learn which kinds of improvements actually work.
- Makes the improvement loop empirical — bmo doesn't just build things, it predicts outcomes and checks them.

User signal capture
- When a user corrects bmo (re-does a file edit, says "no/wrong/instead", modifies output bmo just produced), log it as a learning event in the session file.
- Detection heuristic: user message immediately after a tool result that touches the same file, or explicit correction language.
- Learning events feed into post-session reflection and the periodic analyzer.
- Over time, patterns in corrections reveal systematic weaknesses (e.g., "bmo always gets import paths wrong in this project").

Background analyzer
- Scheduler triggers the analyzer after X days or Y invocations.
- Analyzer reads session logs (including reflections and learning events) and IMPROVEMENTS.md, writes OPPORTUNITIES.md entries.

Evaluation
- Per-session metrics (persisted in session file):
  - Token usage: prompt tokens, completion tokens, total cost estimate.
  - Tool call counts: per tool, successes vs failures.
  - Self-improvement events: tools created, skills written, tools modified, tools pruned.
  - Task outcome: did the user's request get completed (inferred from conversation end — explicit "done" or new topic).
- Cross-session aggregates (computed by background analyzer or on-demand):
  - Tool reuse frequency: which tools are used across sessions vs one-offs.
  - Skill utilization: which skills are loaded and how often.
  - Token efficiency trends: tokens per completed task over time.
  - Failure hotspots: tools or patterns that frequently produce errors.
  - Self-improvement ROI: does a new tool/skill reduce token/call counts for similar tasks in later sessions?
- Surfaced in OPPORTUNITIES.md with quantitative backing (not just qualitative observations).
- Hypothesis scorecard: total hypotheses stated, validated, invalidated, pending. The primary indicator of whether bmo's self-improvement is well-targeted.

Experiment journal
- docs/EXPERIMENT.md: a higher-level narrative log distinct from IMPROVEMENTS.md (individual changes) and OPPORTUNITIES.md (actionable items).
- Captures the arc of bmo's evolution: milestones, aggregate stats, notable successes and failures, hypothesis scorecard at each checkpoint.
- Updated during self-maintenance passes and available via `bmo --stats`.
- Entry template:
  - Date, session range (e.g., sessions 20-30), snapshot ID.
  - Tool inventory delta: tools added, pruned, modified since last entry.
  - Skill inventory delta.
  - Hypothesis scorecard: N validated, M invalidated, P pending.
  - Key metrics: avg token efficiency, avg session cost, tool success rate.
  - Narrative: 2-3 sentences on what changed and why.
- This is the document you hand to someone who asks "what did bmo actually learn?"

Cross-machine session summaries
- Each session can export a sanitized summary to data/summaries/<session-id>.json:
  - Metrics: token usage, cost, tool call counts, session duration.
  - Tool usage: per-tool invocation/success/failure counts.
  - Hypothesis outcomes: any validated/invalidated this session.
  - Reflection text (no code, file contents, or project paths).
  - Machine identifier (hostname or user-chosen label).
- Summaries are safe to aggregate across machines — they contain no code, secrets, or project-specific content.
- Collation: `bmo --aggregate <dir1> <dir2> ...` reads summaries from multiple sources (local dirs, mounted drives, scp'd files) and produces a combined report.
- The combined report feeds into the experiment journal and cross-machine OPPORTUNITIES.md analysis.
- No network communication — summaries are plain files moved manually by the user.

Commit policy
- Autonomous commits allowed only for self‑improvements to bmo:// paths and only in BMO_SOURCE when set.
- Never auto‑commit user projects unless the user explicitly requests.
