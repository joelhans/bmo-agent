# Working Memory
Generated: 2026-02-15T01:30:00Z
Updated: Includes analysis of 45 previously-unanalyzed sessions (Feb 1-15, 2026)

## Active Preferences
- Use `safe_read` for file reads — 88% success, existence checks, clear errors
- Use `search_code` first when exploring — find the function, then read the file
- Run tests BEFORE committing (test → fix → commit, never commit → test)
- Make surgical edits, not full file rewrites — avoid accidental feature removal
- Prefer heredoc for multi-line file writes over sed editing chains
- Ask "what were we trying to accomplish" before diving into failed session forensics
- Expand `~` paths to full paths when using safe_read (it doesn't expand tilde)
- Use unique heredoc delimiters (like `SKILLEOF`) when content contains backticks
- When investigating system issues, check version info (kernel/mesa) alongside logs immediately

## Common Pitfalls
- **Sed editing chains** — Fragile, escape issues; use safe_read + heredoc rewrite instead
- **Reading multiple files before searching** — Start with search_code, then read only what's needed
- **Accidental feature removal** — Check git history before large file changes
- **Learning events not captured** — Must actively call log_learning_event; skill alone doesn't trigger behavior
- **Empty tool capabilities** — Dynamic tools need explicit `capabilities` export for subprocess/network/filesystem
- **Tilde expansion** — safe_read doesn't expand `~`; use full paths like $BMO_HOME or /var/home/user/...
- **Assuming lockfile type** — Check what actually exists in directory
- **Tool path confusion** — Early sessions had repeated failures from saving tools to wrong directory; always verify BMO_HOME/tools/ path
- **Invoking tools as shell commands** — New tools must be called via tool interface, not shell execution
- **Escape sequences in heredocs** — Use unique delimiters and avoid nested backticks; caused multiple failures in early sessions
- **Rewriting large files** — Several sessions broke tests by rewriting files instead of surgical edits (context.ts, tui.ts)

## Recurring Patterns
- **Debugging workflow**: search_code for error/function → read source → understand interface → compare with working code
- **File editing workflow**: safe_read → understand structure → heredoc rewrite → test → commit
- **Package manager conversion**: remove old lockfile → install with new manager → verify build → update .gitignore
- **Session forensics**: ask about goal first, then investigate technical details
- **When infrastructure exists but doesn't work**: the producer is broken, not the consumer
- **Maintenance pattern**: analyze → distill working memory → generate skills → act on opportunities → wrap up
- **Tool creation workflow**: write .mjs → reload_tools → call tool directly to verify (not shell)
- **README/doc updates**: list_files_filtered + safe_read to understand state → write concise updates → link to details rather than duplicate
- **System log analysis**: fewer broader captures first, then targeted queries (avoid 6+ redundant journalctl calls)

## Key Insights
- **Knowing vs. doing gap** — The core self-improvement failure mode: having skills/knowledge ≠ using them
- **Learning event capture still low** — Only 2 events logged via tool ever; requires active behavioral change
- **Reflection coverage uncertain** — Recent sessions show null reflections; may be user exit behavior
- **run_command regressing** — 84% success (was 88%), 224ms avg latency; prefer specialized tools
- **safe_read also regressed** — 88% success (was 96%); investigate tilde expansion issues
- **test_dev_server validated** — 80% success on 5 calls, hang prevention working
- **Model tiering working** — Coding tier activates for simple queries
- **Early tool creation was painful** — Sessions Feb 1-2 show 10+ attempts to create simple echo tools with path/invocation confusion
- **Cost estimation was broken** — Token heuristic had 6x overestimate; pricing table keys mismatched model names (fixed Feb 5)
- **TUI scroll implementation complex** — Required careful state management to not break terminal scrollback
- **Skill usage tracking added** — Feb 6 session added skill load tracking after discovering only 1 historical use across 40+ sessions

## Tool & Skill Notes
**High reliability (use these):**
- `search_code` — 92% success, 40ms avg; start here when exploring
- `reload_tools` — 100% success, 437ms avg
- `list_files_filtered` — 100% success, 43ms avg
- `test_dev_server` — 80% success, 663ms avg; hang prevention validated

**Regression concerns:**
- `run_command` — 84% success, 224ms avg; regressed from 88%
- `safe_read` — 88% success, 31ms avg; regressed from 96%

**Tool known issues:**
- `analyze_token_accuracy` — Comparison logic is broken (compares cumulative to per-message); needs fix or removal

**Skills in active use:**
- `reflection-template` — Was driving 100% coverage, status uncertain in recent sessions
- `safe-file-editing` — Addresses sed fragility pattern
- `codebase-exploration` — Includes "search first" debugging strategy

**Skills needing behavioral attention:**
- `learning-event-capture` — Skill exists but behavior requires active effort
- `runtime-self-critique` — Critical for runtime improvement, not just maintenance

## Validated Hypotheses
- safe_read reduces file errors ✅ (though recently regressed)
- Reflection template improves coverage ✅ (100% stable historically)
- Model tiering reduces costs ✅
- test_dev_server rewrite prevents hangs ✅
- Learning event capture requires active attention ✅ (skill alone insufficient)
- code_snippet tool works for targeted extraction ✅
- Heredoc is safer than sed for file writes ✅ (multiple sessions confirm)
- Surgical edits > full rewrites ✅ (broke tests multiple times with rewrites)

## Invalidated Hypotheses
- Learning event capture skill alone improves rate ❌
- Simple echo/sed commands work for complex file edits ❌

## Pending Validation
- safe-file-editing skill reduces editing failures
- run_command success rate reaches ≥95%
- safe_read regression investigation

## Historical Recovery Note (2026-02-15)
This memory now includes patterns from 45 sessions (Feb 1-15) that were never analyzed due to a bug where maintenance analyzed only 5 sessions despite running every 10. Key recovered insights:
- Tool creation learning curve was steep (path confusion, invocation method)
- Escape sequence handling in heredocs was a recurring failure mode
- Large file rewrites caused multiple test failures
- Cost estimation bug affected early usage perception
- Session forensics pattern emerged from debugging interrupted sessions

## Telemetry Targets
| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| run_command success | 84% | ≥95% | **Regressing** from 88% |
| safe_read success | 88% | ≥95% | **Regressing** from 96% |
| search_code success | 92% | maintain | Stable |
| test_dev_server | 80% | maintain | Validated ✅ |
| Learning event capture | ~2 total | ≥50% sessions | Critical behavioral gap |
