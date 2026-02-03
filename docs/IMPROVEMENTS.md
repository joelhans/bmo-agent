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
