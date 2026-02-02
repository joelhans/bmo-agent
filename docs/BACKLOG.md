# bmo — Backlog

Known footguns, annoyances, and structural gaps discovered during bmo self-improvement sessions.

## Build & Distribution

### 1. Cross-platform binary testing ✓ (local)
Local smoke-test script (`scripts/smoke-test.sh`) runs lint, unit tests, build, and binary CLI checks using a temp `BMO_DATA` directory. Run via `bun run smoke`.

**Remaining:** Add GitHub Actions CI matrix that runs the smoke tests on both macOS and Linux. See item #21.

### 2. Auto-update mechanism
No mechanism for bmo to detect or apply updates to itself beyond the misleading prompt text (see #7).

**Fix:** Future concern. If needed: version file in BMO_SOURCE, compare against running version, prompt user to rebuild.

## Sync & Persistence

### 3. No deletion sync
`syncToSource` only copies files — it never deletes. If you remove a tool from `BMO_HOME/tools/`, the stale `.mjs` file persists in `BMO_SOURCE`. The source repo accumulates dead tools over time.

**Fix:** After copying valid files, diff the destination directory against the allowlist and remove files that no longer exist in `BMO_HOME`.

### 4. Config gets overwritten mid-session
`saveConfig` writes the full config object on every session start (to increment the maintenance counter). If you edit `config.json` by hand while bmo is running, your edits get clobbered on next save.

**Fix:** Read-modify-write with a merge strategy, or use a lockfile. Alternatively, only write the fields that changed.

## Recovery & Rollback

### 5. No rollback for bad self-improvements
If bmo writes a tool that crashes the sandbox runner, there's no automated undo. You have to manually delete the `.mjs` file. The git commit in `BMO_SOURCE` is your only safety net (and with item 1 fixed, at least it won't commit the broken version).

**Fix:** Snapshot the previous version of a tool file before overwriting. Provide a `rollback_tool <name>` built-in that restores from snapshot.

### 6. Escape sequence hell
The LLM struggles with echo escaping when writing `.mjs` files via `run_command`. Heredoc works but isn't always chosen. This wastes tokens and round-trips on retry.

**Fix:** Add a `write_file` built-in tool that accepts content as a string parameter, bypassing shell escaping entirely.

## System Prompt & Session Limits

### 7. Session cost limit is $2.00 ✓
The limit is configurable via `config.cost.sessionLimit` in `config.json`. A warning message now fires at 80% of the limit after each agent loop turn. The hard stop remains at 100%.

**Remaining:** None.

### 8. No mechanism for announcing updates after rebuild
The prompt says "announce update available" after a binary rebuild, but there's no actual detection — it's just instructional text. You still have to restart manually.

**Fix:** Either remove the misleading prompt text, or implement actual version detection (compare running binary hash against on-disk hash).

## Testing

### 9. No tool tests
bmo verifies a tool by calling it once. If it works on the happy path, it's shipped. There's no way to attach test cases to a tool definition.

**Fix:** Support an optional `tests` export in `.mjs` tool files — an array of `{ input, expected }` pairs. `reload_tools` runs them before accepting the tool.

## Concurrency

### 10. No concurrent session safety
Two bmo instances sharing the same `BMO_HOME` will step on each other's `tools/` directory and `config.json`.

**Fix:** Use file locking on `config.json` writes. For tools, either use per-session staging directories or accept that concurrent self-improvement is unsupported and document it.

## Self-Improvement Loop

### 11. Pruning has no data
The system prompt tells the LLM to prune obsolete tools/skills, but there's no usage tracking to identify candidates. Without telemetry, "unused" is unknowable.

**Status:** Prompt instruction exists. No implementation.

**Fix:** Use existing telemetry data from `telemetry.json` to add a `suggest_pruning` tool or include stale-tool analysis in the maintenance pass.

## Feedback Loop Infrastructure

### 12. Background analyzer doesn't exist
The architecture describes a periodic analyzer that reads session logs (reflections, learning events, tool metrics) and writes OPPORTUNITIES.md entries. Nothing like this exists. Without it, reflections and hypotheses accumulate but are never acted on.

**Status:** Partially addressed by `bmo --maintain`, which runs an LLM-driven maintenance pass that reads sessions and updates OPPORTUNITIES.md. A lighter-weight non-LLM analyzer could complement this.

### 13. User signal capture is manual only
The architecture describes automatic detection of user corrections (re-edits a file, says "no/wrong/instead"). Only the manual `log_learning_event` tool exists — bmo has to decide to call it.

**Status:** `log_learning_event` tool implemented. No automatic detection.

**Fix:** Add heuristics in the agent loop: if a user message immediately follows a tool result and references the same file, or contains correction language ("no", "wrong", "actually", "instead"), auto-log a learning event. Low-confidence detections can be logged silently; high-confidence ones surfaced.

### 14. Content sanitization for prompt injection
Self-written content (skills, tool descriptions) is loaded into LLM context without filtering for prompt injection patterns. The architecture specifies stripping lines matching heuristics ("Ignore previous", "System:", "You are", etc.) but this was deferred during Phase 3.

**Status:** Not implemented. `secrets.ts` handles API key masking (different concern). Not needed for the self-improvement loop to function, but matters once tools/skills are shared or if the LLM writes adversarial content by accident.

**Fix:** Add a `sanitizeContent()` function applied when loading skills and tool descriptions. Strip or flag lines matching injection patterns. Log stripped content for review.

## CLI & Configuration

### 15. Multi-provider model switching ✓ (pricing)
The LLM client uses the OpenAI SDK for all providers, routing via `baseURL`. Gateway-prefixed models (e.g. `"ngrok/openai/gpt-4o"`) now automatically resolve to built-in pricing by stripping the gateway prefix. Users can also set per-model pricing via `config.cost.modelPricing` for custom or unknown models.

**Status:** Pricing resolution implemented. Anthropic native API transport still unsupported (OpenAI-compatible endpoints only).

**Remaining:** (a) Add Anthropic SDK as an alternative transport in `llm.ts`, selected by provider name.

## Stretch

### 16. Context window Phase B/C
Current truncation just drops oldest messages. Phase B would summarize dropped turns into a "conversation so far" message. Phase C would use semantic compression — keep tool results still referenced, aggressively drop the rest.

**Status:** Not implemented. Phase A (oldest-turn dropping) works.

### 17. Tool versioning with archive
Archive old tool versions to `tools/archive/<name>.v<N>.mjs` on rewrite. If the new version has more failures, bmo can roll back. Versions that perform better survive. Distinct from #5 (immediate rollback of broken tools) — this is long-term version competition.

**Status:** Not implemented. Depends on telemetry data to compare version performance.

### 18. Cross-project skill generalization
Skills gain optional `scope` in front-matter (`universal | language:X | framework:Y`). The analyzer identifies recurring project-specific patterns and suggests promoting to universal skills.

**Status:** Not implemented. Skills exist but have no scope metadata.

### 19. Cross-machine session summaries
Sanitized summary export (metrics, tool usage, hypothesis outcomes, reflection — no code or secrets). `bmo --aggregate` collates summaries from multiple sources.

**Status:** `summariesDir` exists in path resolution. No export or aggregation code.

### 20. Git context helpers / project indexers
Git-aware context (branch, recent commits, changed files), project structure indexing, semantic search of workspace.

**Status:** Not implemented.

## CI / CD

### 21. GitHub Actions CI for smoke tests
The local smoke-test script (`bun run smoke`) exists but only runs manually. A GitHub Actions workflow should run the smoke tests on every push/PR across a macOS + Linux matrix.

**Fix:** Add `.github/workflows/ci.yml` with a matrix of `[ubuntu-latest, macos-latest]`, install Bun, and run `bun run smoke`. Requires no secrets since smoke tests use a temp data dir and don't call any LLM APIs.
