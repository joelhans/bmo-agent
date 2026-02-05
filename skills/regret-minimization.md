---
name: regret-minimization
description: Framework for deciding whether to build a tool now or defer it
triggers:
  - should I build this
  - defer
  - add to opportunities
  - later
---

# Regret Minimization

## The Question

Before deferring any improvement to OPPORTUNITIES.md or "later", ask:

> **"If I finish this session without building X, will I regret it next session?"**

## The Decision Tree

```
Will I regret not building this?
├─ YES → Why aren't you building it NOW?
│   ├─ "It needs user input" → Defer (valid)
│   ├─ "It requires a restart" → Defer (valid)
│   ├─ "It's a large refactor" → Defer (valid)
│   └─ "I'm focused on user's task" → STOP. Build it now. (5 min pays off)
│
└─ NO → Defer or skip
    └─ "It's speculative" → Skip, don't add to OPPORTUNITIES
```

## Examples

### Example 1: File reader with error handling
**Question:** Will I regret not building safe_read?  
**Answer:** YES — file-not-found errors happen every session  
**Action:** BUILD NOW

### Example 2: Complex git rebase orchestrator
**Question:** Will I regret not building git_rebase_helper?  
**Answer:** NO — git rebases are rare and context-dependent  
**Action:** SKIP

### Example 3: Provider config inspector
**Question:** Will I regret not building config_introspect?  
**Answer:** YES — provider questions come up weekly  
**Action:** BUILD NOW

### Example 4: Core prompt refactor
**Question:** Will I regret not refactoring the prompt structure?  
**Answer:** YES, but it requires restart  
**Action:** DEFER to OPPORTUNITIES.md (valid reason)

## The Anti-Pattern

❌ "I'll build this during maintenance" — Maintenance is for *analysis*, not deferral

## Integration Points

Use this at:
1. **Runtime-self-critique checkpoint** — When deciding whether to act on friction
2. **End of session reflection** — "What should I have built?"
3. **Reviewing OPPORTUNITIES.md** — Filter out low-regret items
