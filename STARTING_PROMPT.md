I want to implement a self-improvement architecture for bmo that lets it 
modify its own tools while working on any project, including when running 
as a compiled binary.

## The architecture: path prefixes

Introduce a `bmo://` prefix that routes file operations to bmo's own codebase:

- Regular paths like `src/config.ts` target the current working directory
- Paths like `bmo://tools/grep.mjs` target bmo's codebase at BMO_HOME

BMO_HOME should be determined by:
1. The BMO_HOME environment variable if set
2. Otherwise, the directory containing the entry point (use import.meta.url, 
   accounting for the fact that this may be a compiled binary)

All file tools (read_file, write_file, list_files) should check for this 
prefix and resolve paths accordingly.

## Directory structure
```
~/code/bmo/                      # BMO_HOME (bmo's codebase)
├── index.mjs                    # Core loop with path resolution
├── AGENTS.md                    # bmo's understanding of itself
└── tools/                       # One file per tool, loaded dynamically
    ├── list_files.mjs
    ├── read_file.mjs
    ├── write_file.mjs
    └── reload_tools.mjs
```

## Tool file format

Each tool in bmo://tools/ exports:

- schema: the tool definition for the OpenAI API  
- execute: an async function that performs the action

Example:
```js
export const schema = {
  type: "function",
  function: {
    name: "example_tool",
    description: "What this tool does",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

export async function execute(args) {
  // implementation
  return JSON.stringify({ result: "..." });
}
```

## Dynamic tool loader

At startup, scan BMO_HOME/tools/ and dynamically import all .mjs files. 
Store schemas in an array for the OpenAI API, and store execute functions 
in a Map keyed by tool name.

Critical for binary compatibility:
- Use absolute paths for all imports
- Tools directory must be external to the binary, not bundled
- Bust Node's import cache on reload: append a query string like 
  `?update=${Date.now()}` to force re-import

## reload_tools

A tool that re-scans the tools directory and updates the in-memory registry.
After creating or modifying a tool file, call reload_tools to use it 
immediately without restarting.

This must work when bmo is running as a compiled binary—test this explicitly.

## System prompt

Update the system prompt to include:
```
You are bmo—a fast, pragmatic, and self-improving coding agent. Your job is 
to complete tasks using available tools, and autonomously improve yourself 
when you encounter limitations.

## Self-improvement loop

When a task requires capabilities beyond your current tools:
1. Investigate the smallest viable solution as a new tool
2. Write the tool to bmo://tools/{name}.mjs
3. Call reload_tools to load it
4. Verify it works by calling it to complete part of the task
5. Continue with the original task

Err on the side of building new tools. It's okay to make the user wait once 
while you build a tool that improves their experience many times in the future.

## Path prefixes

- Regular paths target the current working directory (the user's project)
- Paths starting with bmo:// target your own codebase at {BMO_HOME}

Your codebase structure:
- bmo://index.mjs — core loop (modify carefully)
- bmo://tools/ — your tools, one per file
- bmo://AGENTS.md — your understanding of yourself
```

## Implementation order

1. Create the path resolution helper (handles bmo:// prefix)
2. Update existing file tools to use path resolution
3. Create bmo://tools/ directory
4. Move existing tools into separate files following the schema/execute format
5. Implement the dynamic tool loader with cache-busting for binary compatibility
6. Implement reload_tools
8. Update the system prompt
9. Update AGENTS.md

## Verification

Do not explain these steps—execute them and report results:

1. Run: `node index.mjs` (or the binary) and list bmo://tools/
2. Create a trivial test tool (e.g., returns current timestamp)
3. Call reload_tools
4. Call the new test tool and confirm it works
5. Delete the test tool, reload, confirm it's gone

If any step fails, debug and fix before proceeding.

Begin. 
