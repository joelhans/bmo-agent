# bmo

A self-improving AI coding agent with a terminal UI.

bmo is a coding assistant that runs in your terminal, uses LLM-powered tool execution to complete tasks, and autonomously builds new tools and skills to get better over time. It features multi-provider LLM routing, sandboxed tool execution, session persistence with cost tracking, and a self-improvement loop driven by reflections, telemetry, and periodic maintenance passes.

## Quick start

```bash
# Install dependencies
bun install

# Set an API key (stored in ~/.local/share/bmo/keys.json)
bun run dev -- key add openai <your-key>

# Or use an environment variable
export OPENAI_API_KEY=your-key-here

# Start bmo
bun run dev
```

For a compiled binary:

```bash
bun run build        # Produces dist/bmo
./dist/bmo           # Run the binary directly
```

## Usage

Once running, bmo presents a terminal UI with a chat interface. Type a message and press Enter. bmo selects a model tier based on your request, streams a response, and executes tool calls as needed.

**Keybindings:**

| Key | Action |
|-----|--------|
| Enter | Submit message |
| Ctrl+C | Exit (triggers a reflection on the session) |
| F5 | Reload tools and skills |

**CLI flags:**

```bash
bmo --sessions          # List recent sessions
bmo --session <id>      # Resume a previous session
bmo --maintain          # Force a maintenance pass
bmo --no-maintain       # Suppress auto-maintenance this run
```

**Key management:**

```bash
bmo key list                    # Show configured providers and key status
bmo key add <provider> <key>    # Store an API key
bmo key remove <provider>       # Remove a stored key
```

## How it works

### What happens when you send a message

1. **Tier selection.** bmo picks a model tier — `coding` (cheaper, for straightforward tasks) or `reasoning` (more capable, for debugging and architecture). Keywords like "debug", "refactor", "why does", and "architect" trigger the reasoning tier automatically. So does a failed previous response.

2. **Agent loop.** Your message enters a streaming loop (max 20 iterations). Each iteration: truncate context to fit the token budget, stream the LLM response, and if the response contains tool calls, execute each one and loop back. If the response is text-only, return to the user.

3. **Tool execution.** Built-in tools (`run_command`, `load_skill`, `reload_tools`) run in-process. Dynamic tools (`.mjs` files in `tools/`) run in a sandboxed subprocess with capability restrictions (filesystem scope, network, subprocess access). Each tool call is timed and recorded for telemetry.

4. **Session save.** After every assistant turn, the full conversation history, token usage, cost, and any learning events are saved to disk. Sessions can be resumed across restarts.

### The self-improvement loop

bmo doesn't just execute tasks — it builds tools for tasks it encounters repeatedly.

**During a session:**
- When bmo encounters a limitation or inefficiency, it can write a new `.mjs` tool to `tools/`, call `reload_tools` to register it, and immediately use it.
- It can write `.md` skill documents to `skills/` — reusable knowledge that gets loaded into context on demand.
- Learning events (corrections, preferences, patterns) are logged via the `log_learning_event` tool and accumulated in telemetry.

**After a session:**
- On exit, bmo writes a reflection — a brief assessment of what went well, what was slow or awkward, and what it would do differently.
- Reflections and learning events are persisted in the session file.

**Maintenance passes:**
- After a configurable number of sessions (default: 10), bmo triggers a maintenance pass (`--maintain`). This is a full agent session where bmo:
  - Reviews recent session reflections and learning events
  - Validates or invalidates hypotheses from `IMPROVEMENTS.md`
  - Scans tool telemetry for failure patterns
  - Updates `OPPORTUNITIES.md` with actionable findings
  - Appends an entry to `EXPERIMENT.md`
  - Saves a state snapshot

**Source sync:**
- If `BMO_SOURCE` is configured (a git repo), `reload_tools` automatically copies validated tools and skills to the repo and commits. This gives you version history and a sync point across machines.

### Context and cost management

- **Token estimation** uses a conservative heuristic (`ceil(chars / 3.5) + 4` per message). Truncation drops oldest non-system messages first, preserving the system prompt.
- **Cost tracking** computes per-turn cost from a built-in pricing table covering OpenAI, Anthropic, and Google models. Gateway-prefixed models (e.g. `ngrok/openai/gpt-4o`) resolve automatically by stripping the gateway prefix. Custom models can be priced via config.
- **Budget warning** fires at 80% of the session cost limit. A hard stop prevents further interaction once the limit is reached.

### Sandboxed tool execution

Dynamic tools declare capabilities in their module exports:

```javascript
export const capabilities = {
  filesystem: "project",  // "project" | "bmo" | "both" | "none"
  network: false,
  subprocess: false,
  env: false,
};
```

Tools run in a subprocess where restricted APIs (fetch, Bun.spawn) are replaced with stubs that throw errors. This is advisory isolation — not a security boundary — but it prevents accidental network calls or subprocess spawning from tools that don't need them.

## Configuration

Config lives at `~/.local/share/bmo/config.json`. It's created with defaults on first run and deep-merged on subsequent loads, so new fields always have defaults.

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

  // Context window budgets per tier
  "context": {
    "reasoning": { "maxTokens": 200000, "responseHeadroom": 8192 },
    "coding": { "maxTokens": 200000, "responseHeadroom": 4096 }
  },

  // Cost controls
  "cost": {
    "sessionLimit": 2.00,
    "selfImprovementLimit": 0.50,
    "selfImprovementRetries": 3,
    // Optional: per-model pricing for custom/unknown models
    "modelPricing": {
      "custom/my-model": { "promptPer1M": 1.0, "completionPer1M": 4.0 }
    }
  },

  // Sandbox limits for dynamic tools
  "sandbox": {
    "defaultTimeoutMs": 30000,
    "memoryLimitMb": 256,
    "outputLimitBytes": 1048576
  },

  // Self-improvement maintenance triggers
  "maintenance": {
    "threshold": 10,
    "budgetLimit": 1.00,
    "sessionsSinceLastMaintenance": 0,
    "lastMaintenanceDate": null
  },

  // Max chars in tool result before truncation
  "toolResultTruncation": 50000,

  // Optional: path to git repo for tool/skill sync
  "sourceDir": null
}
```

### Multi-provider setup

bmo routes all LLM calls through the OpenAI SDK with configurable `baseURL` per provider. Any OpenAI-compatible API works. Model strings use `"provider/model-name"` format.

```jsonc
{
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY"
    },
    "ngrok": {
      "baseUrl": "https://gateway.ngrok.app/v1",
      "apiKeyEnv": "NGROK_API_KEY"
    }
  },
  "models": {
    "reasoning": "ngrok/anthropic/claude-sonnet-4-20250514",
    "coding": "ngrok/openai/gpt-4o-mini"
  }
}
```

Gateway-prefixed models like `ngrok/openai/gpt-4o-mini` resolve to built-in pricing automatically. Only truly custom models need `modelPricing` entries.

## Directory structure

bmo uses two root directories:

**BMO_HOME** — the agent's own codebase. Auto-detected in dev, configurable via `$BMO_HOME`.

```
BMO_HOME/
  tools/          # Dynamic tools (.mjs)
  skills/         # Skill documents (.md with YAML front-matter)
  docs/           # Self-improvement notes
    IMPROVEMENTS.md
    OPPORTUNITIES.md
    EXPERIMENT.md
```

**Data directory** — `~/.local/share/bmo`, configurable via `$BMO_DATA`.

```
~/.local/share/bmo/
  config.json     # Configuration
  keys.json       # Stored API keys (mode 0600)
  telemetry.json  # Tool call stats and learning events
  inventory.json  # Capability inventory
  sessions/       # Session history (.json + .log per session)
  snapshots/      # State snapshots from maintenance
```

## Writing tools

Dynamic tools are `.mjs` files in `tools/` that export a standard interface:

```javascript
export const schema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search query" },
  },
  required: ["query"],
};

export const description = "Search the project codebase for a pattern.";

// Optional: binary dependencies (checked at load time)
export const requires = ["rg"];

// Optional: sandbox capabilities
export const capabilities = {
  filesystem: "project",
  network: false,
  subprocess: true,
  env: false,
};

export async function run(args) {
  // Your tool logic here
  return { ok: true, result: "matched 42 files" };
  // Or on failure:
  // return { ok: false, error: "rg not found" };
}
```

After writing a tool file, call `reload_tools` to register it. The tool becomes available as a first-class function call alongside built-in tools.

## Writing skills

Skills are Markdown files in `skills/` with YAML front-matter:

```markdown
---
name: git-workflow
description: Standard git workflow for feature branches
triggers: [git, branch, merge, PR]
---

# Git Workflow

When working on a new feature:
1. Create a branch from main...
```

Skills are listed in the system prompt by name and description. The agent loads them into context on demand via `load_skill`.

## Development

```bash
bun run dev          # Run in development mode
bun run build        # Build to dist/bmo
bun run test         # Run all tests
bun run lint         # Check with Biome
bun run lint:fix     # Auto-fix lint issues
bun run format       # Format with Biome
bun run smoke        # Full smoke test (lint + test + build + CLI checks)
```

## Architecture

For a detailed architecture reference (module responsibilities, data flow, and conventions), see [CLAUDE.md](CLAUDE.md).

```
src/
  main.ts           # CLI entry point, arg parsing, startup orchestration
  tui.ts            # Terminal UI (pi-tui), input loop, tool/skill registration
  agent-loop.ts     # Core streaming loop: LLM response → tool execution → repeat
  llm.ts            # Multi-provider LLM client, streaming event emission
  tools.ts          # Tool registry, built-in run_command tool
  tool-loader.ts    # Dynamic .mjs tool loading, dependency checking, source sync
  sandbox.ts        # Capability-restricted subprocess execution
  sandbox-runner.ts # Subprocess entry point for sandboxed tools
  skills.ts         # Skills registry, YAML front-matter parsing, load_skill tool
  context.ts        # Token estimation, context truncation, cost tracking
  tiering.ts        # Model tier selection (coding vs reasoning)
  config.ts         # Configuration loading, deep-merge, defaults
  session.ts        # Session persistence (save/load/list)
  prompt.ts         # System prompt assembly
  paths.ts          # BMO_HOME / data dir resolution
  telemetry.ts      # Tool call recording, learning event aggregation
  inventory.ts      # Capability inventory generation
  snapshots.ts      # State snapshots for maintenance
  maintain.ts       # Self-improvement maintenance pass
  secrets.ts        # API key masking for logs and output
  keys.ts           # API key storage and injection
  logger.ts         # Timestamped, masked session logging
```

## License

Private.
