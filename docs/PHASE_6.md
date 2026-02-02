# Phase 6: Self-Improvement Safety & Quality of Life

Backlog of known footguns, annoyances, and structural gaps discovered during bmo self-improvement sessions.

## Sync & Persistence

### 2. No deletion sync
`syncToSource` only copies files — it never deletes. If you remove a tool from `BMO_HOME/tools/`, the stale `.mjs` file persists in `BMO_SOURCE`. The source repo accumulates dead tools over time.

**Fix:** After copying valid files, diff the destination directory against the allowlist and remove files that no longer exist in `BMO_HOME`.

### 3. Config gets overwritten mid-session
`saveConfig` writes the full config object on every session start (to increment the maintenance counter). If you edit `config.json` by hand while bmo is running, your edits get clobbered on next save.

**Fix:** Read-modify-write with a merge strategy, or use a lockfile. Alternatively, only write the fields that changed.

## Recovery & Rollback

### 4. No rollback for bad self-improvements
If bmo writes a tool that crashes the sandbox runner, there's no automated undo. You have to manually delete the `.mjs` file. The git commit in `BMO_SOURCE` is your only safety net (and with item 1 fixed, at least it won't commit the broken version).

**Fix:** Snapshot the previous version of a tool file before overwriting. Provide a `rollback_tool <name>` built-in that restores from snapshot.

### 5. Escape sequence hell
The LLM struggles with echo escaping when writing `.mjs` files via `run_command`. Heredoc works but isn't always chosen. This wastes tokens and round-trips on retry.

**Fix:** Add a `write_file` built-in tool that accepts content as a string parameter, bypassing shell escaping entirely.

## System Prompt & Session Limits

### 6. Maintenance notice never goes away
The maintenance counter keeps incrementing and the notice is injected into every system prompt. The LLM ignores it in favor of the user's actual task.

**Fix:** Either auto-run maintenance silently, cap the notice frequency, or remove it from the system prompt and only surface it as a startup message.

### 7. Session cost limit is $2.00
For complex self-improvement sessions with reasoning-tier escalation, this is too low. The session stops accepting input with a message.

**Fix:** Make the limit configurable in `config.json` (it may already be — verify). Consider a warning at 80% rather than a hard stop.

### 8. No mechanism for announcing updates after rebuild
The prompt says "announce update available" after a binary rebuild, but there's no actual detection — it's just instructional text. You still have to restart manually.

**Fix:** Either remove the misleading prompt text, or implement actual version detection (compare running binary hash against on-disk hash).

## Testing & Learning

### 9. No tool tests
bmo verifies a tool by calling it once. If it works on the happy path, it's shipped. There's no way to attach test cases to a tool definition.

**Fix:** Support an optional `tests` export in `.mjs` tool files — an array of `{ input, expected }` pairs. `reload_tools` runs them before accepting the tool.

### 10. Learning events go nowhere
Learning events are recorded in session JSON files but nothing reads them back or surfaces them in future sessions.

**Fix:** Aggregate learning events into a persistent knowledge base (e.g. `BMO_DATA/learnings.json`). Inject relevant learnings into the system prompt or make them searchable via a built-in tool.

## Concurrency

### 11. No concurrent session safety
Two bmo instances sharing the same `BMO_HOME` will step on each other's `tools/` directory and `config.json`.

**Fix:** Use file locking on `config.json` writes. For tools, either use per-session staging directories or accept that concurrent self-improvement is unsupported and document it.

## Self-Improvement Loop

### 12. Maintenance protocol doesn't actually run
The battery-check infrastructure exists (counter, threshold, `complete_maintenance` tool, system prompt notice) but the LLM consistently ignores the maintenance notice in favor of the user's task. The experiment journal (`docs/EXPERIMENT.md`) remains empty because no maintenance pass has ever completed.

**Status:** Scaffolding complete (`src/config.ts`, `src/snapshots.ts`, `tui.ts:310-351`). Blocked by item #6 (notice ignored).

**Fix:** Decouple maintenance from the user-facing session. Options: (a) run maintenance as a separate non-interactive session on startup when threshold is reached, (b) make it a CLI subcommand (`bmo maintain`), (c) auto-run a minimal pass (snapshot + journal entry) without LLM involvement.

### 13. Pruning has no data
The system prompt tells the LLM to prune obsolete tools/skills, but there's no usage tracking to identify candidates. Without telemetry, "unused" is unknowable.

**Status:** Prompt instruction exists. No implementation.

**Fix:** Depends on tool telemetry (#14). Once usage data exists, add a `suggest_pruning` tool or include stale-tool analysis in the maintenance pass.

### 14. Tool telemetry / graduated trust
No persistent tracking of tool execution success/failure rates. Learning events are recorded per-session but never aggregated or surfaced. No trust scoring or graduated access.

**Status:** `log_learning_event` tool exists. Learning events saved to session JSON. No aggregation, no cross-session persistence, no trust system.

**Fix:** Track per-tool call counts, success/failure rates, and average latency in a persistent store (`BMO_DATA/telemetry.json`). Use this data to drive pruning suggestions, maintenance insights, and eventually graduated trust (e.g. new tools require confirmation before execution).

## Feedback Loop Infrastructure

### 15. Background analyzer doesn't exist
The architecture describes a periodic analyzer that reads session logs (reflections, learning events, tool metrics) and writes OPPORTUNITIES.md entries. Nothing like this exists. Without it, telemetry (#14), reflections, and hypotheses accumulate but are never acted on.

**Status:** Not implemented. OPPORTUNITIES.md exists as a template but nothing writes to it programmatically.

**Fix:** Implement as a CLI subcommand (`bmo analyze`) or as part of the maintenance pass (#12). Reads recent sessions, aggregates tool metrics, scans reflections for patterns, validates hypotheses against telemetry, and writes structured entries to OPPORTUNITIES.md.

### 16. User signal capture is manual only
The architecture describes automatic detection of user corrections (re-edits a file, says "no/wrong/instead"). Only the manual `log_learning_event` tool exists — bmo has to decide to call it.

**Status:** `log_learning_event` tool implemented. No automatic detection.

**Fix:** Add heuristics in the agent loop: if a user message immediately follows a tool result and references the same file, or contains correction language ("no", "wrong", "actually", "instead"), auto-log a learning event. Low-confidence detections can be logged silently; high-confidence ones surfaced.

### 17. Content sanitization for prompt injection
Self-written content (skills, tool descriptions) is loaded into LLM context without filtering for prompt injection patterns. The architecture specifies stripping lines matching heuristics ("Ignore previous", "System:", "You are", etc.) but this was deferred during Phase 3.

**Status:** Not implemented. `secrets.ts` handles API key masking (different concern). Not needed for the self-improvement loop to function, but matters once tools/skills are shared or if the LLM writes adversarial content by accident.

**Fix:** Add a `sanitizeContent()` function applied when loading skills and tool descriptions. Strip or flag lines matching injection patterns. Log stripped content for review.

## Build & Distribution

### 18. Cross-platform binary testing
macOS and Linux builds are both supported by `bun build --compile --target`, but only Linux is verified. No CI or test harness for macOS.

**Fix:** Add a CI matrix that builds and smoke-tests on both platforms. Low priority unless macOS users appear.

### 19. Auto-update mechanism
No mechanism for bmo to detect or apply updates to itself beyond the misleading prompt text (see #8).

**Fix:** Future concern. If needed: version file in BMO_SOURCE, compare against running version, prompt user to rebuild.

## Stretch

### 20. Context window Phase B/C
Current truncation just drops oldest messages. Phase B would summarize dropped turns into a "conversation so far" message. Phase C would use semantic compression — keep tool results still referenced, aggressively drop the rest.

**Status:** Not implemented. Phase A (oldest-turn dropping) works.

### 21. Tool versioning with archive
Archive old tool versions to `tools/archive/<name>.v<N>.mjs` on rewrite. If the new version has more failures, bmo can roll back. Versions that perform better survive. Distinct from #4 (immediate rollback of broken tools) — this is long-term version competition.

**Status:** Not implemented. Depends on telemetry (#14) to compare version performance.

### 22. Cross-project skill generalization
Skills gain optional `scope` in front-matter (`universal | language:X | framework:Y`). The analyzer identifies recurring project-specific patterns and suggests promoting to universal skills.

**Status:** Not implemented. Skills exist but have no scope metadata.

### 23. Cross-machine session summaries
Sanitized summary export (metrics, tool usage, hypothesis outcomes, reflection — no code or secrets). `bmo --aggregate` collates summaries from multiple sources.

**Status:** `summariesDir` exists in path resolution. No export or aggregation code.

### 24. Git context helpers / project indexers
Git-aware context (branch, recent commits, changed files), project structure indexing, semantic search of workspace.

**Status:** Not implemented.
