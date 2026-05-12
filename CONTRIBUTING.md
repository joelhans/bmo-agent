# Contributing to bmo

bmo is a self-improving agent — it builds tools and skills during normal use.
This guide explains how to configure bmo so those improvements flow back to your
fork for contribution.

## The source sync mechanism

bmo distinguishes between two locations:

- **BMO_HOME** — the runtime copy of tools, skills, and docs. Lives in
  `~/.local/share/bmo/` by default (or wherever `$BMO_DATA` points). This is
  where bmo reads from and writes to during sessions.

- **sourceDir / BMO_SOURCE** — your git checkout of the bmo repository. When
  configured, bmo automatically copies tools, skills, and docs from BMO_HOME to
  this location and commits them.

This separation lets you use bmo normally from any working directory while
accumulating improvements in a git repo ready for pull requests.

## Setup for contributors

### 1. Fork and clone

```bash
# Fork on GitHub, then clone your fork
git clone https://github.com/yourusername/bmo.git ~/src/bmo
cd ~/src/bmo
bun install
```

### 2. Build and install the binary

Build bmo and install it to your PATH. This lets you use bmo from any directory
while improvements still sync back to your fork:

```bash
cd ~/src/bmo
bun run build        # Creates dist/bmo

# Option A: Install to ~/.local/bin (recommended)
bun run install

# Option B: Copy to another location in your PATH
cp dist/bmo /usr/local/bin/bmo
```

### 3. Configure sourceDir

Add `sourceDir` to your bmo config (`~/.local/share/bmo/config.json`):

```json
{
  "sourceDir": "/Users/you/src/bmo"
}
```

Or use the environment variable (config takes precedence):

```bash
export BMO_SOURCE=/Users/you/src/bmo
```

### 4. Use bmo from anywhere

```bash
cd ~/projects/my-app
bmo
# Tools and skills bmo creates will sync to ~/src/bmo automatically
```

### Alternative: Run from source (development mode)

If you're actively working on bmo's core (not just contributing tools/skills),
run directly from your checkout:

```bash
cd ~/src/bmo
bun run dev
```

This sets `BMO_HOME` to your checkout, so everything reads from and writes to
your repo directly (no sync needed). However, you'll need to restart from the
checkout directory each time.

**We recommend the binary + sourceDir approach for most contributors** — it
gives you the flexibility to use bmo from any project while improvements still
flow back to your fork.

## What gets synced

When you call `reload_tools` (or press F5), bmo:

1. **Copies tools** — All valid `.mjs` files from `BMO_HOME/tools/` to
   `sourceDir/tools/`. Broken tools (syntax errors, missing exports) are
   skipped.

2. **Copies skills** — All `.md` files from `BMO_HOME/skills/` to
   `sourceDir/skills/`.

3. **Merges docs** — `IMPROVEMENTS.md`, `OPPORTUNITIES.md`, and `EXPERIMENT.md`
   are merged entry-by-entry (entries are `##` sections). Entries from BMO_HOME
   are appended if they don't exist in source.

4. **Commits** — If anything changed, bmo runs `git add` and `git commit` in
   your source repo.

Doc sync also happens:
- **On startup** — pulls entries from source into BMO_HOME
- **On exit** — pushes entries from BMO_HOME to source
- **During maintenance** — bidirectional sync

## Workflow example

```bash
# 1. Configure sourceDir (one time)
echo '{"sourceDir": "/Users/you/src/bmo"}' > ~/.local/share/bmo/config.json

# 2. Build and install (after each core change)
cd ~/src/bmo
bun run build
bun run install

# 3. Use bmo from any project
cd ~/projects/my-website
bmo

# 4. Ask bmo to do something that triggers a new tool
> search for all TODO comments in this codebase

# 5. bmo builds a tool (e.g., search_code.mjs), writes it, calls reload_tools

# 6. Check your source repo
cd ~/src/bmo
git log --oneline -3
# abc1234 sync tools, skills, and docs from BMO_HOME
# ...

# 7. Review and push
git diff HEAD~1
git push origin main

# 8. Open a pull request on GitHub
```

## Contributing improvements

### Tools

bmo-built tools live in `tools/`. Each is a self-contained `.mjs` file:

```javascript
export const schema = { /* JSON Schema for parameters */ };
export const description = "What this tool does";
export const requires = ["rg"];  // Optional: binary dependencies
export const capabilities = {    // Optional: sandbox permissions
  filesystem: "project",
  subprocess: true,
};

export async function run(args) {
  // Implementation
  return { ok: true, result: "..." };
}
```

Before submitting:
- Test the tool manually (invoke it in a session)
- Check for lint issues (`cd ~/src/bmo && bun run lint`)
- Ensure it handles errors gracefully

### Skills

Skills are markdown files in `skills/` with YAML front-matter:

```markdown
---
name: skill-name
description: One-line description shown in system prompt
triggers: [keyword1, keyword2]
---

# Skill Title

Content loaded when the skill is invoked...
```

### Docs (IMPROVEMENTS.md, etc.)

These track bmo's learning and hypotheses. Each entry is a `##` section. When
syncing, entries are merged by heading — existing entries aren't overwritten.

If you want to contribute a fix based on an `OPPORTUNITIES.md` entry, reference
it in your PR description.

## Running tests

```bash
cd ~/src/bmo
bun run test              # All tests
bun test src/tools.test.ts  # Single file
bun run lint              # Biome linting
bun run smoke             # Full smoke test
```

## Code style

- **Biome** for linting and formatting (not ESLint/Prettier)
- Tabs, 120 char lines, double quotes, always semicolons
- Run `bun run lint:fix` before committing

## Pull request guidelines

1. **One improvement per PR** — easier to review and merge
2. **Include context** — what limitation triggered this? Link to session
   reflection if relevant
3. **Test your changes** — run `bun run test` and `bun run smoke`
4. **Keep tools focused** — single responsibility, clear error messages
5. **Rebuild and test the binary** — `bun run build && bun run install`, then
   use it from a test project

## Troubleshooting

### Sync not happening

- Check `sourceDir` is set: `cat ~/.local/share/bmo/config.json | grep sourceDir`
- Ensure the path exists and is a git repo
- Look for sync messages after `reload_tools` (or press F5 in the UI)
- Verify you're running the installed binary, not `bun run dev` from a
  different directory

### Broken tools not syncing

By design — tools with syntax errors or missing exports are excluded to prevent
committing broken code. Fix the tool first (check `~/.local/share/bmo/tools/`).

### Merge conflicts in docs

Doc files use entry-based merging. If you see conflicts:
```bash
cd ~/src/bmo
git status
# Resolve manually, then commit
```

### Changes not appearing in my fork

If you created a tool but don't see it in your fork:

1. Check the tool was created: `ls ~/.local/share/bmo/tools/`
2. Press F5 or call `reload_tools` to trigger sync
3. Check git status: `cd ~/src/bmo && git status`
4. Look for sync messages in bmo's output

### Which mode am I in?

| Command | BMO_HOME | Sync behavior | Use case |
|---------|----------|---------------|----------|
| `bmo` (binary) | `~/.local/share/bmo` | Via sourceDir → fork | **Recommended**: Use from any project |
| `cd ~/src/bmo && bun run dev` | Your checkout | Direct writes | Core development |

For contributing tools/skills, use the binary. For core changes, use dev mode.

## Architecture notes

For deeper understanding:

- `src/tool-loader.ts` — `syncToSource()` handles the copy and commit logic
- `src/doc-sync.ts` — Entry-based merging for doc files
- `src/paths.ts` — Resolution order for BMO_HOME, BMO_DATA, BMO_SOURCE
- `CLAUDE.md` — Full architecture reference for AI assistants

## Questions?

Open an issue or start a discussion. bmo's self-improvement loop means
contributed tools and skills benefit everyone using the agent.
