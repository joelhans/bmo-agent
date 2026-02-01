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
