# bmo — Opportunities (Insights backlog)

Purpose
- Capture opportunities discovered by periodic analysis of IMPROVEMENTS.md, session logs, and tool usage.
- Prioritize and track actionable improvements.

Entry template (copy/paste)
- Date: YYYY-MM-DDTHH:MM:SSZ
- Observation: what the data shows (signals, patterns, metrics)
- Root cause hypothesis: brief
- Recommendation: concrete action (new tool, new skill, refactor, safety guard, UX tweak)
- Impact: High | Medium | Low (with rationale)
- Effort: S | M | L (rough)
- Owner: core | human
- Status: todo | investigating | in-progress | done
- Validated: pending | confirmed (<evidence>) | invalidated (<evidence>) — tracks whether the original improvement hypothesis held up
- Links: related improvements, logs

Example
- Date: 2026-02-15T10:00:00Z
- Observation: run_command usage high with repeated grep invocations across sessions; timeouts occasionally hit.
- Root cause hypothesis: missing focused code search tool with guards.
- Recommendation: build search_code tool with ripgrep under safe_run; add result summarization.
- Impact: High; reduces latency and tokens.
- Effort: S
- Owner: core
- Status: todo
- Links: IMPROVEMENTS.md (2026-01-31 file_stats_simple), session logs 2026-02-01..15

---

## 2026-02-03

- Improve learning event capture
  - What: Add a small skill/playbook to proactively log learning events (correction, preference, pattern) when cues appear; add checklist to maintenance to review missing events.
  - Why: Last 5 sessions contained 0 learningEvents despite opportunities. Increases feedback quality and future automation.
  - Success criteria: ≥60% of sessions contain ≥1 learningEvent when applicable.

- Add a reflection template skill
  - What: Short reflection scaffold (what worked, what didn't, do differently) injected at session end.
  - Why: 2/5 recent sessions had empty reflections; consistency improves maintenance signal.
  - Success criteria: ≥90% sessions have non-empty reflection.

- Build safe_read/fs_inspect helper tool
  - What: Purpose-built reader that checks existence and prints clear errors, optionally globs recent files.
  - Why: run_command failure rate at 9% suggests avoidable file-not-found/grep misses; this can reduce noise and latency.
  - Success criteria: Reduce run_command failure rate to <5% and avg latency to <300 ms on maintenance tasks.

- Prioritize config_introspect and session_digest (from 2026-02-02)
  - Why: Directly addresses repeated piecemeal exploration; should cut 3–6 shell calls per task.
  - Success criteria: One-call answers for provider/model readiness and session pattern summaries.

- Telemetry targets
  - What: Track run_command success rate and latency over next 3 passes; attribute changes to new tools/skills when possible.
  - Targets: Success ≥95%, avg latency ≤300 ms.
## Done

### config_introspect tool
- **Status**: done (2026-02-03)
- **Impact**: High | **Effort**: S
- **What**: One-shot inspection of config.json and keys.json. Shows providers, baseUrls, apiKeyEnv, key status, and readiness.
- **Result**: Implemented and validated. Reduces 3-6 shell calls to 1 for provider/model queries.

### session_digest tool
- **Status**: done (2026-02-03)
- **Impact**: High | **Effort**: S
- **What**: Summarize last N sessions' reflections and learningEvents; output patterns and counts.
- **Result**: Implemented and validated. Structured maintenance helper, single call.

---

## Todo

### safe_read/fs_inspect helper tool
- **Status**: todo
- **Impact**: Medium | **Effort**: S
- **What**: Purpose-built reader that checks existence and prints clear errors, optionally globs recent files.
- **Why**: run_command failure rate still at 12% suggests avoidable file-not-found/grep misses.
- **Success criteria**: Reduce run_command failure rate to <5%.

### Learning event capture skill/playbook
- **Status**: todo
- **Impact**: Medium | **Effort**: S
- **What**: Proactive checklist to log learning events when cues appear (corrections, preferences, patterns).
- **Why**: Only 1 learning event across 10 sessions despite opportunities. Need ≥60% capture rate.
- **Success criteria**: ≥60% of sessions contain ≥1 learningEvent when applicable.

### Reflection template skill
- **Status**: todo
- **Impact**: Medium | **Effort**: S
- **What**: Short reflection scaffold (what worked, what didn't, do differently) injected at session end.
- **Why**: 60% of sessions have empty reflections; consistency improves maintenance signal.
- **Success criteria**: ≥90% sessions have non-empty reflection.

### Targeted code spelunking skill
- **Status**: todo
- **Impact**: Medium | **Effort**: S
- **What**: Playbook for debugging provider/CLI issues (start with config.ts/keys.ts, use ripgrep patterns).
- **Why**: Reflections cite inefficient, piecemeal exploration.
- **Note**: Partially addressed by codebase-exploration skill; may be able to extend rather than create new.

### Consolidate shell calls
- **Status**: todo (ongoing)
- **Impact**: Medium | **Effort**: M
- **What**: Replace multi-step run_command sequences with focused tools for common workflows.
- **Why**: run_command at 88% success rate, target is ≥95%.
- **Progress**: config_introspect and session_digest address two key patterns.

---

## Telemetry Targets

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| run_command success | 88% | ≥95% | Improved from 91% baseline |
| run_command latency | 169ms | ≤300ms | On target |
| Reflection coverage | 40% | ≥90% | Need reflection template |
| Learning event capture | 10% | ≥60% | Need capture playbook |

---

## Dropped/Deferred

### Add hypothesis tracking in IMPROVEMENTS.md
- **Status**: dropped
- **Reason**: Already implemented informally; not worth formal structure overhead.
