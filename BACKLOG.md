
## Dynamic context window management from provider API
**Date**: 2026-02-03
**Rationale**: The 200k `maxTokens` config is hardcoded, but models have different context windows (Sonnet 4.5 = 1M, GPT-4o = 128k, etc.). Anthropic injects `<budget:token_budget>` in responses indicating actual limit.

**Proposal**:
1. Parse `<budget:token_budget>` or equivalent from streaming API responses
2. Store per-model context limits in config or dynamically update on first usage
3. Use actual limit for `truncateToFit` instead of hardcoded 200k
4. Consider provider-specific response parsing (OpenAI may expose differently)

**Benefits**: Better context utilization, prevents premature truncation on large-context models

**Complexity**: Medium — requires parsing streaming responses, handling provider differences

**Blocked by**: Need to verify all providers expose this info in a parseable way
