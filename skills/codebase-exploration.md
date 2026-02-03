---
name: codebase-exploration
description: Patterns for efficiently exploring unfamiliar codebases without wasted effort
triggers: [explore, search, find, grep, where, locate, codebase, understand]
---

# Codebase Exploration

## When to use
- Starting work on an unfamiliar project
- Searching for where something is defined/used
- Understanding project structure

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
   - `run_command` with `cat` — reading specific files you've identified

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
