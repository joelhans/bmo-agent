---
name: safe-file-editing
description: Patterns for safely editing files without accidental breakage or feature removal
triggers: [edit, modify, change, update, sed, patch, rewrite, file]
---

# Safe File Editing

## When to use
- Modifying existing source files
- Making targeted changes to configuration
- Any file edit where correctness matters

## Core Principles

1. **Read before modify** — Always use `safe_read` to understand the full file structure before making changes
2. **Check recent history** — Before large changes, check git log/diff to avoid removing recent features
3. **Prefer full rewrites over sed chains** — Multiple sed commands are fragile; a single heredoc write is safer
4. **Test before commit** — Run tests after every change, before committing

## Workflow

```
1. safe_read the file
2. Understand the structure and recent changes (git log -p --follow -1 filename)
3. Make the change:
   - Small/targeted: single sed command or manual edit
   - Large/complex: full file rewrite via heredoc
4. Run tests
5. Commit
```

## When to use sed vs. heredoc

**Use single sed for:**
- One-line changes
- Simple substitutions with no special characters
- Adding a line at a known location

**Use heredoc (cat << 'EOF') for:**
- Multiple changes in the same file
- Complex changes with special characters
- Any change where sed escaping becomes awkward
- When you need to reason about the whole file

## Common Pitfalls

### Chained sed commands
```bash
# BAD: fragile, hard to debug
sed -i 's/foo/bar/' file.ts
sed -i 's/baz/qux/' file.ts
sed -i '/pattern/a new line' file.ts

# GOOD: single rewrite
cat << 'EOF' > file.ts
<full file contents with all changes>
