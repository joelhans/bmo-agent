---
name: reflection-template
description: Template for writing consistent, useful session reflections
triggers:
  - reflection
  - session end
  - wrap up
  - summary
---

# Reflection Template

## When to Use
At the end of every session, before the conversation closes. Reflections feed into maintenance analysis and working memory updates.

## Template

```markdown
# Session Reflection

**Task:** [One sentence describing what the user asked for]

**What went well:**
- [Specific thing that worked]
- [Another success, if applicable]

**What was slow/awkward:**
- [Specific inefficiency or friction point]
- [Or "Nothing significant" if truly smooth]

**What to do differently next time:**
- [Actionable change for future sessions]
- [Could be: build a tool, use a different approach, ask clarifying questions earlier]
```

## Best Practices

1. **Be specific, not generic**
   - Bad: "Things went well"
   - Good: "The config_introspect tool eliminated 4 shell calls"

2. **Focus on actionable insights**
   - What would make the NEXT session better?
   - If you'd build a tool, name it and describe it

3. **Mention tools/skills used**
   - Helps track which are valuable
   - Note any that failed or were awkward

4. **Keep it short**
   - 5-10 lines is ideal
   - Don't rehash the entire conversation

## Example

```markdown
# Session Reflection

**Task:** Debug why provider keys weren't being loaded on startup.

**What went well:**
- config_introspect immediately showed the key was missing from keys.json
- Systematic approach: checked config first, then code, found the issue in 3 steps

**What was slow/awkward:**
- Had to manually cat multiple files to understand the key loading flow
- A "trace_key_loading" tool would have been faster

**What to do differently next time:**
- Build trace tools for common debugging flows before diving in
- Use codebase-exploration skill to map the code structure first
```

## Pitfalls

- **Empty reflections**: Always write something — even "short session, no friction" is useful
- **Too long**: If it's more than 15 lines, you're over-explaining
- **No actionable items**: Include at least one "next time" suggestion
- **Forgetting to write it**: Make reflection the LAST thing before session ends
