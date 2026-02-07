# bmo — Centralized Improvements Log (append-only)

Purpose
- Record every new tool and core improvement made by bmo, along with rationale and verification.
- Serves as the source of truth for later analysis that surfaces opportunities.

How entries are added
- Automatically by bmo when it adds a tool, writes a skill, or edits core runtime (self‑improvements only).
- Developers may add entries manually if needed (clearly mark manual).

Entry template (copy/paste)
- Date: YYYY-MM-DDTHH:MM:SSZ
- Scope: tool | skill | core | docs
- Name: <tool_name or component>
- Summary: one sentence
- Rationale: why this was needed now (latency, safety, correctness, ergonomics)
- Hypothesis: testable prediction ("This will reduce X by Y%" or "This will eliminate failure Z")
- Changes: key files touched (paths, brief)
- Verification: minimal call and result (ok:true) or test summary
- Follow-ups: short list (if any)

Example
- Date: 2026-01-31T20:00:00Z
- Scope: tool
- Name: file_stats_simple
- Summary: Count chars/bytes/lines in a file.
- Rationale: Needed quick file sizing without shell.
- Hypothesis: Will eliminate run_command overhead for file stat tasks, saving ~200 tokens per invocation.
- Changes: tools/file_stats_simple.json; tools/bin/file_stats_simple
- Verification: file=README.md → ok:true {chars:1234, lines:56}
- Follow-ups: none
## 2026-02-02 Maintenance validation
- Status update: 'anthropic' provider support in add_provider_key tool — VALIDATED.
  - Evidence: keys.json contains an `anthropic` entry; dynamic tool `add_provider_key_v3` recognizes provider; no subsequent errors recorded in recent sessions related to this tool.
  - Impact: Users can now store Anthropic API keys via the tool, broadening integration.

- Added maintenance artifacts: OPPORTUNITIES.md and EXPERIMENT.md scaffolding.
  - Hypothesis: Making opportunities/action items and experiment scorecards first-class docs will cut maintenance time by 30–50% and improve carryover between sessions.
  - Validation plan: Time-box next maintenance pass and compare edit/count of run_command calls vs. prior pass; track if opportunities convert to tools/skills.
  - Status: PENDING.
- Added smart_grep tool for searching with directory exclusions, preventing accidental searches in large dependency directories
## 2026-02-03 Maintenance — New Tools

### session_digest tool
- **What**: Purpose-built tool to summarize reflections and learning events from recent sessions.
- **Hypothesis**: Reduces maintenance friction by replacing ad-hoc JSON parsing with a single structured call. Expected to cut 4-6 shell commands per maintenance pass.
- **Verification**: Called directly, returned structured summary with reflection rate (3/5), learning events by type, and truncated reflections.
- **Status**: VALIDATED — tool works as designed.

### config_introspect tool  
- **What**: One-shot inspection of BMO config.json and keys.json showing providers, models, API key status, and readiness.
- **Hypothesis**: Addresses repeated piecemeal exploration pattern cited in 3+ session reflections. Expected to reduce 3-6 shell calls to 1 for provider/model queries.
- **Verification**: Called directly, returned complete provider configuration and readiness status in single call.
- **Status**: VALIDATED — tool works as designed.

### WORKING_MEMORY.md
- **What**: New maintenance artifact capturing active preferences, common pitfalls, recurring patterns, key insights, and tool notes.
- **Hypothesis**: Provides compact, actionable context for future sessions without re-analyzing raw session data.
- **Status**: CREATED — will validate utility in subsequent sessions.
## 2026-02-03 — test_dev_server tool

**Hypothesis**: Background shell process management (`command &`, `kill $PID`) is unreliable and caused a 2.5-hour hang in session 20260203225345-jkp1. A purpose-built tool using Node's child_process API will handle process lifecycle safely.

**What**: Created `test_dev_server.mjs` — spawns a dev server, waits for ready signal (pattern or timeout), tests an endpoint, then kills cleanly (SIGTERM → SIGKILL fallback).

**Why**: Session analysis showed the last run_command never completed because background `pnpm start` kept running after attempted kill. Shell PID capture with `$!` is fragile in multi-command pipelines.

**Verification**: Tool loaded successfully. Next time we need to test a dev server endpoint, use this tool instead of shell backgrounding. Expected outcome: no hung processes, clean teardown every time.
## 2026-02-05 — Maintenance Pass 4: Skills + safe_read tool

### safe_read tool
- **Scope**: tool
- **Summary**: File reader with existence checks, clear errors, glob support, and recent-file mode.
- **Rationale**: run_command failures often due to file-not-found; this provides helpful error messages and suggestions.
- **Hypothesis**: Will reduce file-related run_command failures and provide better UX for file operations.
- **Changes**: tools/safe_read.mjs
- **Verification**: Tested 3 modes — single file read (ok), nonexistent file (helpful error), recent-in-directory (ok).
- **Status**: VALIDATED

### session-kickoff skill
- **Scope**: skill
- **Summary**: Patterns for turning greeting-only conversations into productive sessions.
- **Rationale**: 3+ reflections mentioned sessions starting with greetings without defined tasks.
- **Hypothesis**: Will improve session productivity by prompting users earlier.
- **Changes**: skills/session-kickoff.md
- **Status**: CREATED — will validate by observing session start patterns.

### learning-event-capture skill
- **Scope**: skill
- **Summary**: Checklist for recognizing and logging learning events during sessions.
- **Rationale**: 0 learning events across 10+ sessions despite opportunities; critical gap.
- **Hypothesis**: Will increase learning event capture rate to ≥60%.
- **Changes**: skills/learning-event-capture.md
- **Status**: CREATED — will validate by tracking learning event count in future sessions.

### reflection-template skill
- **Scope**: skill
- **Summary**: Template for writing consistent, useful session reflections.
- **Rationale**: Reflection coverage was inconsistent; template provides structure.
- **Hypothesis**: Will increase reflection coverage to ≥90% and improve reflection quality.
- **Changes**: skills/reflection-template.md
- **Status**: CREATED — will validate by tracking reflection coverage.

### WORKING_MEMORY.md regenerated
- **Scope**: docs
- **Summary**: Regenerated working memory from Phase 1 analysis of recent sessions.
- **Key updates**: run_command success improved to 98%, smart_grep flagged as unreliable, learning event gap highlighted.
## 2026-02-05 — Runtime Self-Critique Skill (DURING ACTIVE SESSION)

### runtime-self-critique skill
- **Scope**: skill
- **Summary**: Checkpoint for catching improvement opportunities during active tasks, not just maintenance.
- **Rationale**: User observation + data showed ALL tools were built during maintenance, never during active tasks — despite system prompt saying "build IMMEDIATELY". This skill provides an explicit mental checkpoint.
- **Hypothesis**: Will increase runtime tool creation rate from 0% to ≥30% of new tools.
- **Changes**: skills/runtime-self-critique.md
- **Status**: CREATED — will validate by tracking when future tools are built.
- **Note**: This skill was created DURING an active conversation about the problem, not deferred to maintenance. This is the correct behavior.
## 2026-02-05 — Reflection Status Logging (Core Patch)

**Context:** User reported session 20260205144027-3jsp ended with an empty reflection after a highly self-reflective conversation. Investigation showed the LLM returned 0 characters without error.

**Hypothesis:** Empty reflections are silent failures that make it hard to diagnose (1) context window exhaustion, (2) meta-task confusion (reflection on reflection), or (3) model refusal.

**What I built:**
- Added `reflectionStatus` tracking with 4 states: `success`, `empty`, `error`, `skipped`
- Log **warning** (not info) when model returns empty reflection with diagnostic hints
- Distinguish between "model returned empty" vs. "model threw error"
- Always log final reflection status at session end for diagnostics

**Verification:**
- Code compiles successfully with `npm run build`
- Committed to git: `ef55c5c`

**Impact:** Next time a reflection is empty, the log will show:
```
[WARN] reflection: model returned empty response (0 chars). This may indicate: (1) context window exhaustion, (2) meta-task confusion (e.g., reflecting on a reflection), or (3) model refusal for self-referential prompts.
[INFO] reflection status: empty
```

This makes debugging much easier and provides actionable hints.

## 2025-02-06 — Project context loading (AGENTS.md / CLAUDE.md)

**Hypothesis:** Loading project-specific context files automatically will reduce manual context-setting and make bmo immediately useful when starting in a new project.

**Implementation:**
- Added `projectContext?: string` to `SystemPromptOptions` in `src/prompt.ts`
- Added section in `assembleSystemPrompt` to include project context when present
- Modified `src/tui.ts` to search for `AGENTS.md` then `CLAUDE.md` in cwd at startup
- Modified `src/maintain.ts` similarly for maintenance mode
- Added tests for the new prompt section

**Files changed:** `src/prompt.ts`, `src/tui.ts`, `src/maintain.ts`, `src/prompt.test.ts`

**Verification:** All 301 tests pass. Feature will be verified on next restart.
## 2026-02-06 — Maintenance Pass 5

### safe-file-editing skill
- **Scope**: skill
- **Summary**: Patterns for safely editing files without accidental breakage or feature removal.
- **Rationale**: 3+ reflections cited sed editing fragility, accidental feature removal, and file overwrite issues.
- **Hypothesis**: Will reduce file editing failures and accidental breakage.
- **Changes**: skills/safe-file-editing.md
- **Verification**: Skill created and indexed.
- **Status**: CREATED — will validate by tracking file editing issues in future sessions.

### test_dev_server capabilities fix
- **Scope**: tool
- **Summary**: Added missing `capabilities: { subprocess: true, network: true }` export.
- **Rationale**: Tool had 0% success rate; investigation showed sandbox was blocking spawn() and fetch() calls.
- **Hypothesis**: Tool will now work correctly when subprocess and network operations are needed.
- **Changes**: tools/test_dev_server.mjs
- **Verification**: Tool reloaded successfully with capabilities declared.
- **Status**: FIX APPLIED — will validate on next use.

### WORKING_MEMORY.md regenerated
- **Scope**: docs
- **Summary**: Regenerated working memory capturing preferences, pitfalls, patterns, and tool notes from 5 recent sessions.
- **Key findings**:
  - Learning event capture remains at 0% despite skill existing
  - run_command success regressed from 98% to 87%
  - safe_read and search_code have 100% success rates
  - Reflection template working well (100% coverage)
## 2026-02-06 — test_dev_server rewrite (hang prevention)

**Problem:** Previous version could hang indefinitely because:
1. No fetch timeout — if endpoint accepted connection but never responded, hung forever
2. Blind waiting — waited full timeout before even trying endpoint
3. No process group management — child processes could escape cleanup

**Hypothesis:** Polling with timeouts on every operation will prevent hangs while being faster for responsive servers.

**Solution:**
- Poll endpoint from the start instead of blind wait
- `AbortController` timeout on every fetch attempt
- `detached: true` spawning with process group kill (`process.kill(-pid)`)
- Hard overall timeout as backstop
- Timeline tracking for debugging what happened

**Verification:** Tested against Astrolabe — server responded in 55ms on first poll, clean shutdown, no orphan processes.

**Result:** Tool is now reliable and faster (no unnecessary waits).

## 2026-02-07 — Model Tier Switching Fix

**Problem**: Model tiering was documented and tested but never actually worked. `selectInitialTier` always returned "reasoning" tier, meaning simple tasks paid full reasoning-tier pricing.

**Root cause**: The function had no code path that returned "coding" - it checked for reasoning keywords, then defaulted to reasoning. Sessions `20260207175212-y9hh` and `20260207212303-4hj6` confirmed: model field never changed despite following test script.

**Fix**:
- Added `CODING_KEYWORDS` array (read, list, show, run, execute, cat, ls, etc.)
- Short messages (<50 chars) default to coding tier
- Reasoning keywords take priority over coding keywords (order matters)
- Expanded reasoning keywords to include "why is", "why did", "explain how", "debug", "analyze", "compare", "trade-off"

**Verification**:
- All 38 tiering tests pass (17 new tests for coding tier paths)
- All 320 tests pass system-wide
- Status line already shows current model via `onModelChange` callback

**Hypothesis**: This will reduce costs by 50%+ for simple read/list/info queries that don't need reasoning-tier capabilities.

**Impact**: Users can now observe tier switches in the status line (`anthropic/claude-...` changes per turn based on task complexity).

