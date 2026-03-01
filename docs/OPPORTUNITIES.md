# OPPORTUNITIES

Actionable findings from recent sessions and telemetry.
Format: Status (todo/done/dropped), Impact (High/Medium/Low), Effort (S/M/L)

---

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

## Telemetry Targets (2026-02-06)

| Metric | Previous | Current | Target | Status |
|--------|----------|---------|--------|--------|
| run_command success | 87% | 90% | ≥95% | Improving ↑ |
| run_command latency | 230ms | 140ms | ≤300ms | ✅ On target |
| Reflection coverage | 40% | 75% | ≥90% | Improving ↑ |
| Learning event capture | 0% | 50% | ≥60% | Improving ↑ |

---

## 2026-02-15 Maintenance Pass 8 Findings

### Updated Telemetry Targets

| Metric | Previous | Current | Target | Status |
|--------|----------|---------|--------|--------|
| run_command success | 88% | 84% | ≥95% | ⚠️ REGRESSING |
| safe_read success | 96% | 88% | ≥95% | ⚠️ REGRESSING |
| search_code success | 94% | 92% | maintain | Stable |
| test_dev_server success | 50% | 80% | maintain | ✅ Improving |
| Learning event capture | ~20% | ~10% | ≥50% | ⚠️ Still critical |
| Reflection coverage | 100% | uncertain | ≥90% | ⚠️ Check recent nulls |

### New Findings

- **safe_read tilde expansion issue**: safe_read doesn't expand `~` — use full paths. This may explain some of the 12% failure rate.
- **Recent sessions have null reflections**: Multiple sessions from 2026-02-15 show `"reflection": null`. May be user exit behavior or bug.
- **Knowing vs. doing gap remains the core issue**: 2 learning events logged ever; skill exists but behavior doesn't follow.

### No S-effort items to act on this pass
Both todo items are M-effort. No new S-effort opportunities identified.
## 2026-02-15 Maintenance Pass 9 Findings

### Updated Telemetry Targets

| Metric | Previous | Current | Target | Status |
|--------|----------|---------|--------|--------|
| run_command success | 84% | 84% | ≥95% | ⚠️ Stable but low |
| safe_read success | 88% | 87% | ≥95% | ⚠️ Still regressing |
| search_code success | 92% | 93% | maintain | ✅ Stable |
| test_dev_server success | 80% | 80% | maintain | ✅ Validated |
| Learning event capture | 2 | 3 | ≥50% sessions | ⚠️ Tiny improvement |
| Reflection coverage | uncertain | null in recent | ≥90% | ⚠️ Check exit behavior |

### Key Findings This Pass

1. **Recent sessions have null reflections**: Feb 15 sessions mostly have `"reflection": null`. These appear to be very short sessions (quick exits) rather than reflection failures.

2. **Tool regression investigation needed**: Both run_command (84%) and safe_read (87%) have regressed from previous peaks (88%, 96%). May be related to:
   - `$BMO_HOME` not being set early in sessions (fixed Feb 15)
   - Tilde expansion issues with safe_read
   - Increased use of shell commands that fail on edge cases

3. **analyze_token_accuracy tool is broken**: Comparison logic compares per-message estimates to cumulative API totals — fundamentally invalid comparison. Needs fix or removal.

4. **Knowing vs. doing gap confirmed**: 3 learning events total across 60+ sessions despite having skills. This is behavioral, not technical.

### New Opportunity

### Fix or remove analyze_token_accuracy tool
- **Status**: todo
- **Impact**: Low | **Effort**: M
- **What**: Tool compares per-message token estimates to cumulative session totals, which is invalid.
- **Options**: (1) Track per-message real tokens if available, (2) compare cumulative to cumulative properly, (3) remove tool
- **Success criteria**: Produces valid comparison or is removed from inventory

### No S-effort items acted on this pass
Both existing todo items are M-effort. No new S-effort opportunities identified.
## 2026-02-20 Maintenance Pass 10 Findings

### Updated Telemetry (from system prompt)

| Metric | Previous | Current | Target | Status |
|--------|----------|---------|--------|--------|
| run_command success | 84% | 91% | ≥95% | ⬆️ Improving |
| run_command latency | 310ms | 379ms | ≤300ms | ⚠️ Above target |
| safe_read success | 87% | 91% | ≥95% | ⬆️ Improving |
| search_code success | 93% | 97% | maintain | ✅ On target |
| code_snippet success | -- | 100% | maintain | ✅ Excellent |
| Reflection coverage | uncertain | 60% | ≥90% | ⚠️ Below target |
| Learning event capture | 3 total | 3 total | ≥50% sessions | ❌ Critical gap |

### Key Findings

1. **run_command and safe_read recovering**: Both improved from 84%/87% to 91% — may be related to BMO_HOME env var fix taking effect.

2. **Learning event capture remains at 0% for recent sessions**: Despite skill existing, no events logged in 10 analyzed sessions. This is behavioral, not technical — requires active intervention during sessions.

3. **Reflection coverage dropped to 60%**: 4/10 recent sessions had null reflections. Appears to be quick exits rather than generation failures.

4. **code_snippet tool validated**: 100% success, 30 calls — working well for targeted code reads.

5. **run_command latency above target**: 379ms vs 300ms target. May be due to increased complexity of commands.

### New Skill Created

- **clarify-before-diving**: Patterns for asking clarifying questions early to avoid wasted investigation. Based on 3+ reflections citing "should have asked first" patterns.

### No S-effort items acted on

All remaining todo items are M-effort. No new S-effort opportunities identified.
## 2026-02-24 Maintenance Pass 11 Findings

### Updated Telemetry

| Metric | Previous | Current | Target | Status |
|--------|----------|---------|--------|--------|
| run_command success | 91% | 92% | ≥95% | ⬆️ Improving |
| run_command latency | 379ms | 391ms | ≤300ms | ⚠️ Above target |
| safe_read success | 91% | 92% | ≥95% | ⬆️ Improving |
| search_code success | 97% | 98% | maintain | ✅ On target |
| code_snippet success | 100% | 99% | maintain | ✅ Excellent |
| write_file success | -- | 96% | maintain | ✅ New, validated |
| Reflection coverage | 60% | 40% | ≥90% | ⚠️ Regressed (user behavior) |
| Learning event capture | ~10% | ~10% | ≥50% | ❌ Critical gap |

### Key Findings

1. **write_file tool validated**: 96% success, eliminates escaping issues. Use instead of heredocs.

2. **Reflection coverage regression not a bug**: 40% (4/10) reflects quick exit sessions, not system failure.

3. **Learning event capture still critical**: Only 2 events in 10 sessions despite skill existing. Post-turn self-improvement architecture (pending restart) may help.

4. **run_command latency trending up**: 391ms (was 379ms). Above 300ms target. Continue preferring purpose-built tools.

5. **No S-effort opportunities remaining**: Both todo items (consolidate shell calls, output truncation) are M-effort.

### New Opportunities

#### Early reflection prompting
- **Status**: todo
- **Impact**: Medium | **Effort**: M
- **What**: Prompt reflection earlier in short sessions to improve coverage
- **Why**: 60% of recent sessions exit before reflection. Could prompt after ~5 turns.
- **Note**: Requires core change to session lifecycle

### No S-effort items acted on this pass
All remaining todo items are M-effort. Focused on validation and documentation.
## 2026-03-01 Maintenance Pass 12 Findings

### Updated Telemetry

| Metric | Previous | Current | Target | Status |
|--------|----------|---------|--------|--------|
| run_command success | 92% | 92% | ≥95% | ⚠️ Stable below target |
| run_command latency | 391ms | 409ms | ≤300ms | ⚠️ Above target |
| safe_read success | 92% | 92% | ≥95% | ⚠️ Stable below target |
| search_code success | 98% | 99% | maintain | ✅ Excellent |
| code_snippet success | 99% | 98% | maintain | ✅ Excellent |
| write_file success | 96% | 98% | maintain | ✅ Excellent |
| Reflection coverage | 40% | 60% | ≥90% | ⚠️ Improving (user behavior) |
| Learning event capture | ~10% | ~0% | ≥50% | ❌ Critical - 0 in recent 10 |

### Key Findings

1. **Learning event capture at 0% in recent sessions**: Despite skill existing since Feb 5, no events logged in the 10 most recent session JSONs. The 5 historical events in telemetry are all from before Feb 21.

2. **Reflection coverage recovering**: 6/10 sessions have reflections (60%), up from 40%. Null reflections correlate with quick exits or sessions without meaningful interaction.

3. **Post-turn self-improvement still pending**: Built 2026-02-23, requires restart to activate. This architectural change may help with learning event capture.

4. **run_command latency trending up**: 409ms (was 391ms). Consistently above 300ms target. Continue preferring purpose-built tools.

5. **High-reliability tools validated**: write_file (98%), search_code (99%), code_snippet (98%) all excellent.

### New Opportunity

### Deprecate smart_grep in favor of search_code
- **Status**: todo
- **Impact**: Low | **Effort**: S
- **What**: Remove smart_grep.mjs from tools/ since search_code supersedes it with better features and 99% success rate.
- **Why**: Reduces tool inventory confusion. smart_grep barely used in telemetry.
- **Risk**: Low — no sessions rely on it.

### No S-effort items acted on this pass
Identified smart_grep deprecation as S-effort but deferred to avoid scope creep during analysis-heavy pass.

