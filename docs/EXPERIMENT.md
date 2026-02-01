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

