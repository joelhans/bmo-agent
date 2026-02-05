---
name: runtime-self-critique
description: Checkpoint for catching improvement opportunities during active tasks, not just maintenance
triggers:
  - friction
  - awkward
  - workaround
  - multiple calls
  - repeated pattern
  - should be easier
---

# Runtime Self-Critique

## When to Invoke This

Trigger this checkpoint when you notice ANY of these during a task:

1. **Shell call chains** — Making 2+ run_command calls that could be one purpose-built tool
2. **Error recovery** — A command failed and you're retrying with adjusted args
3. **Repeated structure** — Doing the same operation shape you've done before
4. **Awkward parsing** — Extracting data from command output that could be structured
5. **"This should be easier"** — Any moment of friction

## The Checkpoint (5 seconds)

When triggered, STOP and ask:

```
CRITIQUE CHECKPOINT
1. What friction did I just encounter?
2. Will this friction recur (in this session or future ones)?
3. Can I build a tool in <5 minutes that eliminates it?
4. What's the hypothesis? (e.g., "This will reduce X calls to 1")

If YES to 2 and 3 → BUILD IT NOW, then continue the original task.
If NO → Continue, but note it for reflection.
```

## Examples

### Example 1: File reading failures
**Friction**: `cat /path/to/file` failed with "No such file"  
**Recur?**: Yes, file existence is a common issue  
**5-min tool?**: Yes — safe_read with existence check  
**Action**: BUILD NOW → safe_read.mjs

### Example 2: Checking provider config
**Friction**: Made 3 calls (ls, cat config.json, cat keys.json)  
**Recur?**: Yes, provider questions come up often  
**5-min tool?**: Yes — config_introspect  
**Action**: BUILD NOW → config_introspect.mjs

### Example 3: Complex git operation
**Friction**: Multi-step rebase with conflict resolution  
**Recur?**: Maybe, but highly context-dependent  
**5-min tool?**: No, too complex and variable  
**Action**: Continue, note in reflection

## Anti-Patterns to Avoid

- ❌ "I'll add this to OPPORTUNITIES.md" — NO, build it now if possible
- ❌ "This is a maintenance task" — NO, maintenance is for things you CAN'T do now
- ❌ "The user is waiting" — Building a 5-min tool saves time overall
- ❌ "run_command works fine" — Working isn't the bar; optimal is the bar

## The Meta-Rule

> If you notice friction and CAN build a tool to fix it, you MUST build it now.
> OPPORTUNITIES.md is for things requiring user input, restarts, or cross-session patterns.

