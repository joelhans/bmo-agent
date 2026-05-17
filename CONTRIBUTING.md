# Contributing to bmo

bmo is a self-improving agent—it builds tools and skills during normal use.
This guide explains how your improvements can flow back to the project.

## Philosophy: Personal vs Shared

bmo separates **personal learning** from **shared capabilities**:

**Personal (stays in your BMO_HOME):**
- Learning docs (IMPROVEMENTS.md, OPPORTUNITIES.md, EXPERIMENT.md)
- Session history and reflections
- Working memory (your preferences and patterns)

**Shared (contributed back to repo):**
- Tools (`.mjs` files) - capabilities
- Skills (`.md` files) - reusable knowledge

This prevents your personal learning patterns from biasing other users' bmo
instances while still enabling contribution of useful tools and skills.

## Quick start for contributors

### 1. Fork and clone

```bash
# Fork on GitHub, then clone your fork
git clone https://github.com/yourusername/bmo.git ~/src/bmo
cd ~/src/bmo
bun install
```

### 2. Build and install the binary

```bash
cd ~/src/bmo
bun run build        # Creates dist/bmo
bun run install      # Install to ~/.local/bin
```

### 3. Configure sourceDir

Add `sourceDir` to your bmo config (`~/.local/share/bmo/config.json`):

```json
{
  "sourceDir": "/Users/you/src/bmo"
}
```

Or use the environment variable:

```bash
export BMO_SOURCE=/Users/you/src/bmo
```

### 4. Use bmo from anywhere

```bash
cd ~/projects/my-app
bmo
# Tools and skills bmo creates will be local-only until you explicitly contribute them
```

## Contributing improvements

### Check what you've built locally

```bash
# In a bmo session
> bmo status

# Or ask naturally
> What tools have I built that aren't in the repo yet?
```

This shows:
- Tools/skills only in your BMO_HOME (local)
- Tools/skills only in the repo (not pulled)

### Contribute a tool or skill

When you've built something useful:

```bash
# Explicit
> bmo contribute tool my_awesome_tool

# Or natural language
> This search_api_docs tool is solid, let's contribute it to the repo
```

bmo will:
1. Copy the file from BMO_HOME to your fork
2. Git add + commit with a meaningful message
3. Tell you to `git push`

Then:
```bash
cd ~/src/bmo
git push origin main
# Open a PR on GitHub
```

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

Before contributing:
- Test the tool manually (invoke it in a session)
- Check for lint issues (`cd ~/src/bmo && bun run lint`)
- Ensure it handles errors gracefully
- Use `bmo contribute tool <name>` to copy to repo

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

Contribute with `bmo contribute skill <name>`.

### Learning docs (IMPROVEMENTS.md, OPPORTUNITIES.md)

These stay **local** to your BMO_HOME. They track your personal journey and
hypotheses. They don't sync to the repo.

If you discover something useful from your docs (e.g., "we should add a
validate_json tool"), build the tool and contribute it—but the doc entry stays
yours.

## Alternative: Run from source (development mode)

If you're working on bmo's core (not just tools/skills), run directly from your
checkout:

```bash
cd ~/src/bmo
bun run dev
```

This sets `BMO_HOME` to your checkout, so everything reads from and writes to
your repo directly. For most contributors, use the binary + `sourceDir` approach.

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

Before opening a PR:

1. Keep each PR to one improvement—easier to review and merge.
2. Include context. What limitation triggered this? Link to a session
   reflection if relevant.
3. Run `bun run test` and `bun run smoke`.
4. Keep tools focused: single responsibility, clear error messages.
5. Rebuild and test the binary with `bun run build && bun run install`, then
   use it from a test project.

## Troubleshooting

### Contribution not appearing in fork

If you used `bmo contribute` but don't see changes:

1. Check the tool exists: `ls ~/.local/share/bmo/tools/`
2. Verify the commit: `cd ~/src/bmo && git log --oneline -1`
3. Check `bmo contribute` output for errors
4. Ensure BMO_SOURCE is configured: `echo $BMO_SOURCE`

### Which mode am I in?

| Command | BMO_HOME | Contribution flow | Use case |
|---------|----------|-------------------|----------|
| `bmo` (binary) | `~/.local/share/bmo` | Explicit via `bmo contribute` | **Recommended** |
| `cd ~/src/bmo && bun run dev` | Your checkout | Direct writes | Core development |

For contributing tools/skills, use the binary. For core changes, use dev mode.

## Architecture notes

For deeper understanding:

- `tools/bmo_status.mjs`: Shows local vs shared divergence
- `tools/bmo_contribute.mjs`: Explicit contribution mechanism
- `src/paths.ts`: Resolution order for BMO_HOME, BMO_DATA, BMO_SOURCE
- `CLAUDE.md`: Full architecture reference

## Questions?

Open an issue or start a discussion. bmo's self-improvement loop means
contributed tools and skills benefit everyone using the agent.
