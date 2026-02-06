# bmo — Backlog

Known footguns, annoyances, and structural gaps discovered during bmo self-improvement sessions. Ordered by priority — items at the top de-risk the self-improvement loop and reduce daily friction.

## Analyze token usage

- I don't trust the token values I'm seeing.
- I really don't trust the cost values.
- There must be a way to make bmo more efficent.

## The 20-iteration tool loop is annoying

It seems like it allows 20 tools at a time, not in a single loop, which is
problematic for more complex tasks.

## Analyze model tiering

Does it actually work?

## Cross-machine learning portability

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

## No deletion sync

`syncToSource` only copies files — it never deletes. If you remove a tool from `BMO_HOME/tools/`, the stale `.mjs` file persists in `BMO_SOURCE`. The source repo accumulates dead tools over time.

**Fix:** After copying valid files, diff the destination directory against the allowlist and remove files that no longer exist in `BMO_HOME`.

## Config gets overwritten mid-session

`saveConfig` writes the full config object on every session start (to increment the maintenance counter). If you edit `config.json` by hand while bmo is running, your edits get clobbered on next save.

**Fix:** Read-modify-write with a merge strategy, or use a lockfile. Alternatively, only write the fields that changed.

## Content sanitization for prompt injection

Self-written content (skills, tool descriptions) is loaded into LLM context without filtering for prompt injection patterns. Not needed for the self-improvement loop to function, but matters once tools/skills are shared or if the LLM writes adversarial content by accident.

**Status:** Not implemented. `secrets.ts` handles API key masking (different concern).

**Fix:** Add a `sanitizeContent()` function applied when loading skills and tool descriptions. Strip or flag lines matching injection patterns. Log stripped content for review.

## No concurrent session safety

Two bmo instances sharing the same `BMO_HOME` will step on each other's `tools/` directory and `config.json`.

**Fix:** Use file locking on `config.json` writes. For tools, either use per-session staging directories or accept that concurrent self-improvement is unsupported and document it.

## Tool output truncation with expand

`run_command` can produce very large outputs (e.g., `ls -R`, `cat` on large files, verbose command output). This bloats the conversation context and makes it hard to scan results. Similar to the truncation we added for `search_code`, add a truncation mechanism for `run_command`:
- Default: show first ~15 lines (or some reasonable limit)
- Include a "click to expand" UI element to reveal full output on demand
- Allows user to dig in when needed without token/readability overhead by default

**Implementation notes**:
- Likely requires client-side UI changes (not something bmo core can do alone)
- Could also apply to other high-output tools as a general pattern
- Consider: character limit vs. line limit vs. both?

## Context window Phase B/C
Current truncation just drops oldest messages. Phase B would summarize dropped turns into a "conversation so far" message. Phase C would use semantic compression — keep tool results still referenced, aggressively drop the rest.

## Pruning has no data

The system prompt tells the LLM to prune obsolete tools/skills, but there's no usage tracking to identify candidates. Prompt instruction exists. Telemetry data now exists in `telemetry.json`. Use telemetry data to add a `suggest_pruning` tool or include stale-tool analysis in the maintenance pass.

## User signal capture is manual only

Only the manual `log_learning_event` tool exists — bmo has to decide to call it. Add heuristics in the agent loop: if a user message contains correction language ("no", "wrong", "actually", "instead") or immediately follows a tool result referencing the same file, auto-log a learning event.

## Tool versioning with archive

Archive old tool versions to `tools/archive/<name>.v<N>.mjs` on rewrite. Versions that perform better survive. Distinct from #5 (immediate rollback) — this is long-term version competition. Depends on telemetry data to compare version performance.

## Cross-project skill generalization

Skills gain optional `scope` in front-matter (`universal | language:X | framework:Y`). The analyzer identifies recurring project-specific patterns and suggests promoting to universal skills.

## Auto-update mechanism

No mechanism for bmo to detect or apply updates to itself.

## Background analyzer

A lighter-weight non-LLM analyzer that reads session logs and writes OPPORTUNITIES.md entries without burning tokens. A non-LLM complement could handle mechanical aggregation (most-failed tool, most-common correction type) cheaply.
