# bmo — Backlog

Known footguns, annoyances, and structural gaps discovered during bmo self-improvement sessions. Ordered by priority — items at the top de-risk the self-improvement loop and reduce daily friction.

## Done

### Cross-platform binary testing ✓ (local)
Local smoke-test script (`scripts/smoke-test.sh`) runs lint, unit tests, build, and binary CLI checks using a temp `BMO_DATA` directory. Run via `bun run smoke`.

**Remaining:** GitHub Actions CI matrix (see #21).

### Session cost limit ✓
Configurable via `config.cost.sessionLimit`. Warning fires at 80% of limit. Hard stop at 100%.

### Multi-provider pricing ✓
Gateway-prefixed models (e.g. `"ngrok/openai/gpt-4o"`) resolve to built-in pricing automatically. Per-model pricing overrides via `config.cost.modelPricing`.

**Remaining:** Anthropic native API transport in `llm.ts`.

## P0 — Daily friction / self-improvement safety

### Read `AGENTS.md` or `CLAUDE.md`, etc

Description to come

### 6. `write_file` built-in tool
The LLM writes files via `run_command` with shell escaping, which is fragile — heredocs sometimes fail, escaping wastes tokens and round-trips on retry. This is the single most common source of wasted tokens.

**Fix:** Add a `write_file` built-in tool that accepts `path` and `content` as string parameters, bypassing shell escaping entirely.

### 5. No rollback for bad self-improvements
If bmo writes a tool that crashes the sandbox runner, there's no automated undo. You have to manually delete the `.mjs` file. The git commit in `BMO_SOURCE` is your only safety net.

**Workaround:** Keep `BMO_SOURCE` as a git repo and commit before each `--maintain` run.

**Fix:** Snapshot the previous version of a tool file before overwriting. Provide a `rollback_tool <name>` built-in that restores from snapshot.

### 9. No tool tests
bmo verifies a tool by calling it once. If it works on the happy path, it's shipped. There's no way to attach test cases to a tool definition.

**Fix:** Support an optional `tests` export in `.mjs` tool files — an array of `{ input, expected }` pairs. `reload_tools` runs them before accepting the tool.

### 19. Cross-machine learning portability
Each machine accumulates its own sessions, telemetry, and learnings in `~/.local/share/bmo/`. When running bmo on multiple machines, learnings diverge and potentially conflict. Tools and skills sync via git (BMO_SOURCE), but learning events stay trapped in each machine's local `telemetry.json`.

**Problem:** Machine A logs `[correction] "prefer functional style"` while Machine B logs `[preference] "use class-based components"`. Each maintenance pass draws conclusions from local data only. OPPORTUNITIES.md and EXPERIMENT.md diverge on push/pull.

**Key insight:** Tool telemetry stats (call counts, timing) are local performance data — hardware/network-dependent, not meaningful across machines. Learning events (corrections, preferences, patterns) ARE portable knowledge and need to flow through the git repo.

**Fix — crystallize learnings into git:**
1. During `--maintain`, distill `recentLearnings` from `telemetry.json` into a committed file (e.g. `docs/LEARNINGS.md`) — structured, deduplicated, human-readable.
2. On startup, load that file into the system prompt alongside inventory and telemetry.
3. Git push/pull carries learnings between machines naturally.
4. Conflicting learnings in the file get reconciled by the next `--maintain` pass on whichever machine pulls the merge.

This makes git the transport layer and the LLM the conflict resolver. No new sync infrastructure needed. The original `bmo --aggregate` idea from summaries is subsumed — learnings are the thing worth aggregating, and they flow through the repo.

**Status:** `summariesDir` exists in path resolution. No export, crystallization, or aggregation code.

## P1 — Reliability and hygiene

### 3. No deletion sync
`syncToSource` only copies files — it never deletes. If you remove a tool from `BMO_HOME/tools/`, the stale `.mjs` file persists in `BMO_SOURCE`. The source repo accumulates dead tools over time.

**Fix:** After copying valid files, diff the destination directory against the allowlist and remove files that no longer exist in `BMO_HOME`.

### 4. Config gets overwritten mid-session
`saveConfig` writes the full config object on every session start (to increment the maintenance counter). If you edit `config.json` by hand while bmo is running, your edits get clobbered on next save.

**Fix:** Read-modify-write with a merge strategy, or use a lockfile. Alternatively, only write the fields that changed.

### 14. Content sanitization for prompt injection
Self-written content (skills, tool descriptions) is loaded into LLM context without filtering for prompt injection patterns. Not needed for the self-improvement loop to function, but matters once tools/skills are shared or if the LLM writes adversarial content by accident.

**Status:** Not implemented. `secrets.ts` handles API key masking (different concern).

**Fix:** Add a `sanitizeContent()` function applied when loading skills and tool descriptions. Strip or flag lines matching injection patterns. Log stripped content for review.

### 10. No concurrent session safety
Two bmo instances sharing the same `BMO_HOME` will step on each other's `tools/` directory and `config.json`.

**Fix:** Use file locking on `config.json` writes. For tools, either use per-session staging directories or accept that concurrent self-improvement is unsupported and document it.

## P2 — Quality of life

### Tool output truncation with expand
`run_command` can produce very large outputs (e.g., `ls -R`, `cat` on large files, verbose command output). This bloats the conversation context and makes it hard to scan results.

**Proposal**: Similar to the truncation we added for `search_code`, add a truncation mechanism for `run_command`:
- Default: show first ~15 lines (or some reasonable limit)
- Include a "click to expand" UI element to reveal full output on demand
- Allows user to dig in when needed without token/readability overhead by default

**Implementation notes**:
- Likely requires client-side UI changes (not something bmo core can do alone)
- Could also apply to other high-output tools as a general pattern
- Consider: character limit vs. line limit vs. both?

**Created**: 2026-02-03

### 16. Context window Phase B/C
Current truncation just drops oldest messages. Phase B would summarize dropped turns into a "conversation so far" message. Phase C would use semantic compression — keep tool results still referenced, aggressively drop the rest.

**Status:** Phase A (oldest-turn dropping) works.

### 11. Pruning has no data
The system prompt tells the LLM to prune obsolete tools/skills, but there's no usage tracking to identify candidates.

**Status:** Prompt instruction exists. Telemetry data now exists in `telemetry.json`.

**Fix:** Use telemetry data to add a `suggest_pruning` tool or include stale-tool analysis in the maintenance pass.

### 13. User signal capture is manual only
Only the manual `log_learning_event` tool exists — bmo has to decide to call it.

**Fix:** Add heuristics in the agent loop: if a user message contains correction language ("no", "wrong", "actually", "instead") or immediately follows a tool result referencing the same file, auto-log a learning event.

### 20. Git context helpers / project indexers
Git-aware context (branch, recent commits, changed files), project structure indexing, semantic search of workspace.

**Status:** Not implemented.

### 21. GitHub Actions CI for smoke tests
The local smoke-test script (`bun run smoke`) exists but only runs manually.

**Fix:** Add `.github/workflows/ci.yml` with a matrix of `[ubuntu-latest, macos-latest]`, install Bun, and run `bun run smoke`. Requires no secrets.

## P3 — Stretch

### 17. Tool versioning with archive
Archive old tool versions to `tools/archive/<name>.v<N>.mjs` on rewrite. Versions that perform better survive. Distinct from #5 (immediate rollback) — this is long-term version competition.

**Status:** Not implemented. Depends on telemetry data to compare version performance.

### 18. Cross-project skill generalization
Skills gain optional `scope` in front-matter (`universal | language:X | framework:Y`). The analyzer identifies recurring project-specific patterns and suggests promoting to universal skills.

**Status:** Not implemented. Skills exist but have no scope metadata.

### 2. Auto-update mechanism
No mechanism for bmo to detect or apply updates to itself.

**Fix:** Future concern. Version file in BMO_SOURCE, compare against running version, prompt user to rebuild.

### 8. No mechanism for announcing updates after rebuild
The prompt says "announce update available" after a binary rebuild, but there's no actual detection.

**Fix:** Either remove the misleading prompt text, or implement actual version detection.

### 12. Background analyzer
A lighter-weight non-LLM analyzer that reads session logs and writes OPPORTUNITIES.md entries without burning tokens.

**Status:** Partially addressed by `bmo --maintain`. A non-LLM complement could handle mechanical aggregation (most-failed tool, most-common correction type) cheaply.
