# Backlog

UI and UX improvements that require frontend/client changes.

---

## Tool Output Truncation with Expand

**Problem**: `run_command` can produce very large outputs (e.g., `ls -R`, `cat` on large files, verbose command output). This bloats the conversation context and makes it hard to scan results.

**Proposal**: Similar to the truncation we added for `search_code`, add a truncation mechanism for `run_command`:
- Default: show first ~15 lines (or some reasonable limit)
- Include a "click to expand" UI element to reveal full output on demand
- Allows user to dig in when needed without token/readability overhead by default

**Implementation notes**:
- Likely requires client-side UI changes (not something bmo core can do alone)
- Could also apply to other high-output tools as a general pattern
- Consider: character limit vs. line limit vs. both?

**Created**: 2026-02-03
