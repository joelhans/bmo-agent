# bmo

A self-improving AI coding agent that runs in your terminal.

bmo uses LLM-powered tool execution to complete tasks, and autonomously builds new tools and skills when it encounters limitations. It features multi-provider LLM routing, sandboxed tool execution, session persistence with cost tracking, and a self-improvement loop driven by reflections and periodic maintenance.

## Quick start

```bash
# Install dependencies
bun install

# Set an API key
bun run dev -- key add openai <your-key>

# Or use environment variables
export OPENAI_API_KEY=your-key

# Start bmo
bun run dev
```

For a compiled binary:

```bash
bun run build        # Produces dist/bmo
./dist/bmo           # Run directly
```

## Installation

The install script builds bmo and sets up everything:

```bash
bun run install              # Build and install to ~/.local/bin
bun run install --no-binary  # Just sync tools and skills to BMO_DATA
```

You can also customize install locations:

```bash
INSTALL_BIN=/usr/local/bin BMO_DATA=/opt/bmo bun run install
```

## Usage

bmo presents a terminal UI with a chat interface. Type a message and press Enter. bmo selects a model tier, streams a response, and executes tool calls as needed.

**Keybindings:**

| Key | Action |
|-----|--------|
| Enter | Submit message |
| Ctrl+C | Exit (triggers reflection) |
| F5 | Reload tools and skills |

**CLI flags:**

```bash
bmo --sessions          # List recent sessions
bmo --session <id>      # Resume a previous session
bmo --maintain          # Force a maintenance pass
bmo --no-maintain       # Suppress auto-maintenance
```

**Key management:**

```bash
bmo key list                    # Show configured providers
bmo key add <provider> <key>    # Store an API key
bmo key remove <provider>       # Remove a stored key
```

## How it works

### Message flow

1. **Tier selection.** bmo picks a model tier — `coding` (cheaper) or `reasoning` (more capable). Keywords like "debug", "refactor", "why does", and "architect" trigger reasoning automatically, as does a failed previous response.

2. **Agent loop.** Your message enters a streaming loop (max 20 iterations). Each iteration: truncate context to fit the token budget, stream the LLM response, execute any tool calls, and loop back. Text-only responses return to the user.

3. **Tool execution.** Built-in tools run in-process. Dynamic tools (`.mjs` files) run in sandboxed subprocesses with capability restrictions. Each tool call is timed and recorded.

4. **Session save.** After every assistant turn, the conversation history, token usage, cost, and learning events are saved. Sessions can be resumed across restarts.

### Self-improvement

bmo doesn't just execute tasks — it builds tools for tasks it encounters repeatedly.

**During sessions:**
- When bmo encounters a limitation, it writes a new `.mjs` tool to `tools/`, calls `reload_tools` to register it, and immediately uses it.
- It writes `.md` skill documents to `skills/` — reusable knowledge loaded into context on demand.
- Learning events (corrections, preferences, patterns) are logged and accumulated.

**After sessions:**
- On exit, bmo writes a reflection assessing what went well and what was slow or awkward.

**Maintenance passes:**
- After 10 sessions (configurable), bmo triggers a maintenance pass:
  - Reviews recent reflections and learning events
  - Validates hypotheses from `IMPROVEMENTS.md`
  - Scans tool telemetry for failure patterns
  - Updates `OPPORTUNITIES.md` with actionable findings
  - Saves a state snapshot

**Source sync:**
- With `BMO_SOURCE` configured, `reload_tools` automatically copies tools and skills to the source repo and commits.

### Dynamic tools

bmo includes 8 self-built tools:

| Tool | Purpose |
|------|---------|
| `safe_read` | File reading with existence checks, glob support, recent-file mode |
| `search_code` | Code search with ripgrep, smart directory exclusions |
| `smart_grep` | Grep with automatic directory exclusions |
| `list_files_filtered` | Directory listing with extension filtering |
| `config_introspect` | One-shot provider/model/key status inspection |
| `session_digest` | Summarize reflections and learning events |
| `session_pattern_check` | Detect repeated patterns in sessions |
| `test_dev_server` | Spawn server, test endpoint, kill cleanly |

### Skills

bmo includes 6 self-written skills:

| Skill | Purpose |
|-------|---------|
| `codebase-exploration` | Patterns for exploring unfamiliar codebases |
| `learning-event-capture` | Recognizing and logging learning events |
| `reflection-template` | Template for consistent session reflections |
| `regret-minimization` | Framework for deciding whether to build now or defer |
| `runtime-self-critique` | Catching improvement opportunities during tasks |
| `session-kickoff` | Turning greetings into productive sessions |

## Configuration

Config lives at `~/.local/share/bmo/config.json`:

```jsonc
{
  // LLM provider endpoints
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY"
    }
  },

  // Model selection per tier
  "models": {
    "reasoning": "openai/gpt-4o",
    "coding": "openai/gpt-4o-mini"
  },

  // Context budgets
  "context": {
    "reasoning": { "maxTokens": 200000, "responseHeadroom": 8192 },
    "coding": { "maxTokens": 200000, "responseHeadroom": 4096 }
  },

  // Cost controls
  "cost": {
    "sessionLimit": 2.00,
    "selfImprovementLimit": 0.50
  },

  // Maintenance triggers
  "maintenance": {
    "threshold": 10
  }
}
```

### Multi-provider setup

bmo routes calls through the OpenAI SDK with configurable `baseURL`. Any OpenAI-compatible API works:

```jsonc
{
  "providers": {
    "openai": { "baseUrl": "https://api.openai.com/v1" },
    "ngrok": { "baseUrl": "https://gateway.ngrok.app/v1" }
  },
  "models": {
    "reasoning": "ngrok/anthropic/claude-sonnet-4-20250514",
    "coding": "ngrok/openai/gpt-4o-mini"
  }
}
```

## Directory structure

**BMO_HOME** — the agent's codebase (auto-detected, or set `$BMO_HOME`):

```
BMO_HOME/
  tools/          # Dynamic tools (.mjs)
  skills/         # Skill documents (.md)
  docs/           # Self-improvement notes
    IMPROVEMENTS.md
    OPPORTUNITIES.md
    EXPERIMENT.md
```

**Data directory** — `~/.local/share/bmo` (or set `$BMO_DATA`):

```
~/.local/share/bmo/
  config.json     # Configuration
  keys.json       # Stored API keys (mode 0600)
  telemetry.json  # Tool call stats
  sessions/       # Session history
  snapshots/      # Maintenance snapshots
```

## Writing tools

Dynamic tools are `.mjs` files in `tools/`:

```javascript
export const schema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search query" },
  },
  required: ["query"],
};

export const description = "Search the project codebase.";

// Optional: binary dependencies
export const requires = ["rg"];

// Optional: sandbox capabilities
export const capabilities = {
  filesystem: "project",  // "project" | "bmo" | "both" | "none"
  network: false,
  subprocess: true,
  env: false,
};

export async function run(args) {
  return { ok: true, result: "matched 42 files" };
  // Or: { ok: false, error: "rg not found" }
}
```

After writing a tool, call `reload_tools` to register it.

## Writing skills

Skills are Markdown files in `skills/` with YAML front-matter:

```markdown
---
name: git-workflow
description: Standard git workflow for feature branches
triggers: [git, branch, merge, PR]
---

# Git Workflow

When working on a new feature...
```

Skills are listed in the system prompt. Load them via `load_skill`.

## Development

```bash
bun run dev          # Development mode
bun run build        # Build to dist/bmo
bun run test         # Run tests
bun run lint         # Check with Biome
bun run lint:fix     # Auto-fix lint issues
bun run format       # Format with Biome
bun run smoke        # Full smoke test
```

## Architecture

```
src/
  main.ts           # CLI entry, startup orchestration
  tui.ts            # Terminal UI (pi-tui), input loop
  agent-loop.ts     # Streaming loop: LLM → tool execution → repeat
  llm.ts            # Multi-provider LLM client
  tools.ts          # Tool registry, run_command
  tool-loader.ts    # Dynamic .mjs tool loading, source sync
  sandbox.ts        # Capability-restricted subprocess execution
  skills.ts         # Skills registry, load_skill
  context.ts        # Token estimation, truncation, cost tracking
  tiering.ts        # Model tier selection
  config.ts         # Configuration loading
  session.ts        # Session persistence
  prompt.ts         # System prompt assembly
  paths.ts          # BMO_HOME / data dir resolution
  telemetry.ts      # Tool call recording
  maintain.ts       # Maintenance pass
  doc-sync.ts       # Tool/skill sync to source repo
```

For detailed architecture reference, see [CLAUDE.md](CLAUDE.md).

## License

MIT License. See [LICENSE](LICENSE).
