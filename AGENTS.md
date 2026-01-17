AGENTS.md — Project Context and Working Notes

Use this file to capture an evolving understanding of the project. It is inlined into the agent's system prompt when running inside this repo by default, or when BMO_INLINE_NOTES=1 or BMO_NOTES_FILE is set. Set BMO_DISABLE_NOTES=1 to prevent inlining.

Sections
- Project Overview
- File Structure
- Key Components
- Self-Improvement Architecture
- Patterns and Conventions
- Tooling Opportunities

## Project Overview

bmo is a self-improving Node.js CLI coding agent that streams responses from OpenAI and can act on the local workspace via tools. bmo can also modify its own codebase to add new capabilities while running.

Core principles:
- Action over suggestion: complete tasks using tools rather than explaining steps
- Self-improvement: when lacking a capability, build a new tool and reload
- Pragmatism: err on the side of building tools that improve future experiences

## File Structure

```
bmo/                              # BMO_HOME
├── index.mjs                     # Core loop with path resolution and dynamic tool loader
├── AGENTS.md                     # This file (bmo's understanding of itself)
├── .env                          # OPENAI_API_KEY, optional NGROKAI, BMO_DATA_DIR
├── package.json                  # Dependencies and scripts
└── tools/                        # One file per tool, loaded dynamically at startup
    ├── list_files.mjs            # List files/directories (supports bmo:// prefix)
    ├── read_file.mjs             # Read file contents (supports bmo:// prefix)
    ├── write_file.mjs            # Write/create files (supports bmo:// prefix)
    └── reload_tools.mjs          # Hot-reload tools without restart
```

## Key Components

### Path Resolution

The `bmo://` prefix routes file operations to BMO_HOME:
- Regular paths like `src/config.ts` → current working directory
- `bmo://tools/grep.mjs` → BMO_HOME/tools/grep.mjs

BMO_HOME is determined by:
1. The BMO_HOME environment variable if set
2. Otherwise, the directory containing index.mjs (works for compiled binaries too)

### Dynamic Tool Loader

At startup, bmo scans BMO_HOME/tools/ and imports all .mjs files. Each tool exports:
- `schema`: OpenAI function tool definition
- `execute(args)`: async function returning JSON string

Cache-busting ensures hot reload works even in compiled binaries: imports use `?update=${Date.now()}` query strings.

### Tool File Format

```js
import { resolvePath } from "../index.mjs";

export const schema = {
  type: "function",
  function: {
    name: "tool_name",
    description: "What this tool does",
    parameters: {
      type: "object",
      properties: { /* ... */ },
      required: [],
    },
  },
};

export async function execute(args) {
  // implementation
  return JSON.stringify({ ok: true, result: "..." });
}
```

### Core Loop

1. Load tools from BMO_HOME/tools/ at startup
2. Build system prompt with self-improvement instructions
3. Stream chat completions with tool schemas
4. Execute tool calls, push results to history
5. Loop until assistant responds without tool calls

## Self-Improvement Architecture

When a task requires capabilities beyond current tools:
1. Investigate the smallest viable solution as a new tool
2. Write the tool to bmo://tools/{name}.mjs
3. Call reload_tools to load it immediately
4. Verify it works by calling it
5. Continue with the original task

This works when bmo runs as:
- Direct node execution: `node index.mjs`
- Compiled binary: tools directory remains external, not bundled

## Patterns and Conventions

- Tools return JSON-serialized strings for safe inclusion in conversationHistory
- All file edits use write_file with full content (no partial updates)
- Session logs go to ~/.local/share/bmo (or BMO_DATA_DIR)
- Brief, results-focused replies after actions

### Environment Variables

- `OPENAI_API_KEY`: Required
- `NGROKAI`: Optional baseURL override for OpenAI client
- `BMO_HOME`: Override bmo's runtime codebase location (where tools are loaded from)
- `BMO_SOURCE`: Source codebase for persisting new tools (writes go here AND to BMO_HOME)
- `BMO_DATA_DIR`: Override session log directory
- `BMO_INLINE_NOTES=1`: Inline AGENTS.md in any repo
- `BMO_NOTES_FILE=/path/to/notes.md`: Inline specific notes file
- `BMO_DISABLE_NOTES=1`: Never inline notes

When running the compiled binary, set `BMO_SOURCE` to the source repo so new tools persist:
```bash
export BMO_SOURCE=~/src/bmo-agent
```

## Tooling Opportunities

Ideas for future tools bmo might build for itself:
- grep/search: Find patterns across files
- glob: List files matching patterns recursively
- patch: Apply partial edits without full file rewrites
- shell: Execute commands with user confirmation
- summarize: Generate project overview from file structure
