---
name: learning-event-capture
description: Checklist for recognizing and logging learning events during sessions
triggers:
  - correction
  - preference
  - pattern
  - learning
  - feedback
  - mistake
---

# Learning Event Capture

## When to Use
Continuously during every session. Learning events are corrections, preferences, or patterns that should inform future behavior.

## Recognition Cues

### Corrections (type: "correction")
- User says "no", "not that", "wrong", "actually..."
- User repeats an instruction you missed
- User undoes something you did
- User expresses frustration or disappointment
- User provides the correct answer after your attempt

### Preferences (type: "preference")
- User specifies a style choice ("use TypeScript", "keep it concise")
- User chooses between options you offered
- User describes their workflow or habits
- User says "I always...", "I prefer...", "I like..."

### Patterns (type: "pattern")
- User does the same type of task repeatedly
- User follows a consistent workflow shape
- You notice a recurring problem type or domain

## Best Practices

1. **Log immediately when you detect a cue**
   - Call `log_learning_event` right away, don't wait for session end
   - Include specific context (what task, what happened)

2. **Be specific in descriptions**
   - Bad: "User prefers concise code"
   - Good: "User prefers single-line arrow functions over multi-line function declarations"

3. **Capture the context**
   - What task were you doing?
   - What did you do that triggered the feedback?
   - What was the correction or preference?

## Example Calls

```
log_learning_event({
  type: "correction",
  description: "User corrected: use 'pnpm' not 'npm' for this project",
  context: "Installing dependencies in bmo-agent project"
})

log_learning_event({
  type: "preference",
  description: "User prefers tools over core changes for flexibility",
  context: "Discussing retry logic implementation approach"
})

log_learning_event({
  type: "pattern",
  description: "Maintenance cycles are structured 5-phase processes",
  context: "Running improvement cycle maintenance pass"
})
```

## Pitfalls

- **Not logging at all**: Target ≥1 event per session when applicable
- **Logging too late**: Call immediately, not at session end
- **Vague descriptions**: Be specific enough to act on later
- **Missing subtle cues**: Re-read user messages for preference signals
