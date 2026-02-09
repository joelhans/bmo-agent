---
name: codebase-exploration
description: Patterns for efficiently exploring unfamiliar codebases without wasted effort
triggers: [explore, search, find, grep, where, locate, codebase, understand, debug, trace, investigate]
---

# Codebase Exploration

## When to use
- Starting work on an unfamiliar project
- Searching for where something is defined/used
- Understanding project structure
- **Debugging issues** — search first, then read

## Core Principles

1. **Never scan everything** — always exclude noise directories:
   - `node_modules`, `build`, `dist`, `.git`, `coverage`, `.next`, `__pycache__`, `vendor`

2. **Start narrow, expand if needed**:
   - Search specific file types first (e.g., `fileTypes: ["ts", "tsx"]`)
   - Use `list_files_filtered` for structure overview
   - Use `search_code` for content search

3. **Use the right tool**:
   - `search_code` — content search with smart defaults (uses ripgrep)
   - `list_files_filtered` — directory structure with exclusions
   - `safe_read` — reading specific files you've identified

## Debugging Strategy: Search First

**Critical insight from session reflections:**
> "I read multiple files to understand the flow when I could have started with search_code to jump directly to the bug."

### The pattern

BAD:
1. Read file A to understand structure
2. Read file B to trace dependency
3. Read file C to find the function
4. Finally find the bug in file C

GOOD:
1. `search_code` for the function/error/pattern name
2. Read only the file containing the match
3. Understand → fix

### Debugging workflow

1. **Start with search_code** for the error message, function name, or key pattern
2. **Read only matched files** — don't speculatively read adjacent files
3. **Understand the interface** — read type definitions if needed
4. **Assume the producer is broken** — when infrastructure exists but doesn't work, the generator is broken, not the consumer

## Common Patterns

### Finding where something is defined
```
search_code pattern="export (function|const|class) ThingName" fileTypes=["ts", "tsx"]
```

### Finding usages/imports
```
search_code pattern="import.*ThingName|from.*thing-module"
```

### Understanding project structure
```
list_files_filtered directory="." fileExtensions=[".ts", ".tsx", ".js"]
```

### Finding config/entry points
Look for: `package.json`, `tsconfig.json`, `index.ts`, `main.ts`, `app.ts`

## Pitfalls

- **Don't use raw `grep -r`** — it will scan node_modules and be slow
- **Don't use `find` without exclusions** — same problem
- **Don't read files speculatively** — search first, then read specific files
- **Limit context** — use `maxResults` and `context` params to avoid token bloat
- **Don't read multiple files before searching** — search_code → targeted read is faster
