# bmo — Experiment Journal (append-only)

Purpose
- Track the arc of bmo's evolution across sessions: what changed, what improved, what didn't work.
- Distinct from IMPROVEMENTS.md (individual changes) and OPPORTUNITIES.md (actionable items).
- This is the document you hand to someone who asks "what did bmo actually learn?"

How entries are added
- Automatically by bmo during self-maintenance passes ("battery check").
- Developers may add entries manually (clearly mark manual).

Entry template (copy/paste)
- Date: YYYY-MM-DDTHH:MM:SSZ
- Session range: <first>–<last> (sessions covered since previous entry)
- Snapshot: <snapshot-id> (reference to data/snapshots/)
- Tool inventory delta: tools added, pruned, modified since last entry
- Skill inventory delta: skills added, retired since last entry
- Hypothesis scorecard: N validated, M invalidated, P pending
- Key metrics: avg token efficiency, avg session cost, tool success rate
- Narrative: 2-3 sentences on what changed and why

Example
- Date: 2026-03-01T12:00:00Z
- Session range: 20–30
- Snapshot: snapshot-030
- Tool inventory delta: +search_code (new), -file_stats_simple (pruned, superseded by file_stats.mjs)
- Skill inventory delta: +ripgrep_mastery
- Hypothesis scorecard: 3 validated, 1 invalidated, 2 pending
- Key metrics: token efficiency 12% better than sessions 10-20; avg session cost $0.42; tool success rate 94%
- Narrative: search_code tool eliminated repeated grep invocations and reduced token usage for code search tasks. The hypothesis that file_stats_simple was redundant was validated — file_stats.mjs handles all use cases. One hypothesis invalidated: caching file listings did not measurably reduce latency (filesystem calls are already fast).

## 2026-02-02 Maintenance Experiment

Sessions reviewed: 20260202165426-mipb.json, 20260202165413-1yqk.json, 20260202163012-ztu6.json, 20260202153303-9ujq.json, 20260202153259-vyrp.json

Tool/skill delta:
- Docs: created OPPORTUNITIES.md; appended maintenance validation to IMPROVEMENTS.md.
- No new tools/skills added during this pass (captured as opportunities).

Hypothesis scorecard:
- Anthropic provider support in add_provider_key: VALIDATED (keys.json contains provider; no recent errors).
- Maintenance artifacts (OPPORTUNITIES/EXPERIMENT) reduce pass time: PENDING (assess next pass).

Key metrics:
- run_command: 34 calls, 94% ok, ~428 ms avg.
- reload_tools: 8 calls, 100% ok, ~74 ms avg.
- Sessions processed: 5; reflections present: 3/5; learningEvents found: 0.

Narrative:
Reflections repeatedly cite slow, piecemeal exploration to answer provider/model questions. Action: build a config_introspect tool and a session_digest tool, and add a targeted code spelunking skill to reduce round-trips and latency.

## 2026-02-03 Maintenance Experiment (Pass 3)

Sessions reviewed: 20260203224503-l98l, 20260203224409-5lvv, 20260203215138-rqie, 20260203212913-ptl5, 20260203212407-76xl (plus 5 additional for broader context)

**Tool/skill delta:**
- Created: session_digest.mjs — summarizes reflections and learning events from recent sessions
- Created: config_introspect.mjs — one-shot inspection of BMO config/keys/readiness
- Created: docs/WORKING_MEMORY.md — compact actionable context for future sessions
- Updated: OPPORTUNITIES.md with structured Status/Impact/Effort format

**Hypothesis scorecard:**
| Hypothesis | Status | Evidence |
|------------|--------|----------|
| Anthropic provider support | VALIDATED | keys.json contains provider, no errors |
| Maintenance artifacts reduce pass time | PARTIAL | OPPORTUNITIES.md useful for tracking; need more passes to measure time reduction |
| session_digest reduces maintenance calls | VALIDATED | Single call replaces 5-10 jq/grep commands |
| config_introspect reduces exploration | VALIDATED | Single call replaces 3-6 cat/grep commands |
| WORKING_MEMORY improves session context | PENDING | Will validate in subsequent sessions |

**Key metrics:**
- run_command: 140 calls, 88% ok, ~169ms avg (improved latency from 347ms)
- reload_tools: 11 calls, 100% ok, ~1144ms avg
- search_code: 5 calls, 80% ok, ~110ms avg
- Sessions processed: 10; reflections present: 4/10 (40%); learningEvents found: 1

**Telemetry trends:**
- run_command success improved: 91% → 88% → need to investigate regression
- run_command latency improved significantly: 428ms → 347ms → 169ms
- Learning event capture still critically low (1 total)

**Narrative:**
This maintenance pass focused on building the two highest-value tools identified in previous passes: session_digest and config_introspect. Both directly address the recurring "slow, piecemeal exploration" pattern cited in multiple reflections. Also introduced WORKING_MEMORY.md as a compact distillation of cross-session learnings.

Key insight: run_command success rate dropped from 91% to 88% despite improvements — need to investigate specific failure modes. Likely causes: grep misses on non-existent files, edge cases in path handling.

Next priorities:
1. Build learning-event-capture skill (critical: only 1 event in 10 sessions)
2. Build reflection-template skill (40% coverage is too low)
3. Investigate run_command failure regression
