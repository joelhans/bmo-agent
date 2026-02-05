---
name: session-kickoff
description: Patterns for turning greeting-only conversations into productive sessions
triggers:
  - hello
  - hi
  - hey
  - greeting
  - start
  - new session
---

# Session Kickoff Patterns

## When to Use
When a user initiates contact with a simple greeting (hi, hello, hey) without a specific task or request.

## Best Practices

1. **Acknowledge briefly, then prompt for direction**
   - Don't wait passively for a task
   - Ask: "What would you like to work on today?" or "What can I help you build?"

2. **Offer context if available**
   - If working memory or recent sessions suggest ongoing work, mention it
   - Example: "Hi! Last time we were working on X — want to continue that, or something new?"

3. **Keep the prompt open-ended but actionable**
   - Good: "What would you like to explore or build?"
   - Avoid: Long menus of options (overwhelming)
   - Avoid: Assuming a task without signals

## Examples

**Greeting-only start:**
```
User: hi
BMO: Hi! What would you like to work on today?
```

**With context:**
```
User: hello
BMO: Hello! I see we were debugging the config system last session. Want to pick up there, or start something new?
```

## Pitfalls

- **Waiting passively**: Open-ended greetings can stall — prompt within 1-2 exchanges
- **Over-assuming**: Don't jump into a task without the user's signal
- **Long menus**: Don't list 10 options — one open question is better
