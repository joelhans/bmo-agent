# Planning

This document outlines improvements to make to BMO, the code agent capable
of self-improvement.

## Self-improvement loop

Will update this section as I notice issues with the self-improvement
loop.

## API key management

Right now the `bmo` binary is looking for the environment for an API key, and
if I open up `bmo` in a different directory than this one, it doesn't
exist. There should be some way, like `bmo api-key ...` to add an API key and
store it in a user config directory.

### Implementation

Status: Implemented

CLI
- bmo api-key set <OPENAI_API_KEY>
- bmo api-key get (prints masked value)
- bmo api-key unset

Storage
- Persisted to ~/.config/bmo/.env in .env format. Quotes are added when needed.
- loadEnv() now loads from current .env or ~/.config/bmo/.env; process.env takes precedence over file values.

Details
- index.mjs handles the api-key subcommand early and exits after completing it.
- Keys are masked when displayed (e.g., sk-xx…abcd).
- Helper functions: ensureConfigDir, readConfigEnv, writeConfigEnv, maskKey.

Acceptance
- Setting a key writes it to ~/.config/bmo/.env and subsequent runs use it automatically.
- Getting shows a masked key from config or environment.
- Unsetting removes the key from config file (does not unset current process env).

## Sessions

I would prefer to start bmo by default without restarting an existing session, *except* in the case of having just built a new tool.

- `bmo` should start a new session, which is stored in the user config
  directory under some random string generator
- `bmo session` should list existing sessions
- `bmo session abc123` should rsstart a specific session

When doing the self-improvement loop, the current session needs to be noted so
that during the subsequent execution, it can use `bmo session
$current_session`.

This would be a good way to start building out more CLI arguments.

## UX / tool usage

I would like a few improvements to how BMO reveals what tools are being used and
how:

1. I would like to see which files are being read, written, or deleted using
   tools
2. I would like some explanation as to *why* the agent is using a certain
   tool in a certain way
3. Ideally, this includes the full execution command e.g. (`git add . &&
   git commit -m "Some commit message" && push push -u origin main`)

### Implementation

Goals
- Always show the files touched and the exact command(s) executed.
- Give a short “why” before the tool runs and a short “outcome” after.
- Keep secrets safe via redaction. Make this trace persist per session.

Agent loop instrumentation (index.mjs)
- Before executeTool:
  - Parse and keep a sanitized copy of tool args.
  - Derive and print a one‑line Why if the assistant didn’t provide one.
    - Heuristic: by tool name
      - read_file → “Why: Inspecting file to gather context”
      - write_file → “Why: Persisting changes to file”
      - delete_file → “Why: Removing file per requested change”
      - run_command → “Why: Running shell to perform requested action”
      - default → “Why: Using tool to progress the task”
- During/after executeTool:
  - Print a structured trace line per tool call, e.g.:
    - READ: <path>
    - WRITE: <path>
    - DELETE: <path>
    - CMD: <command>
  - On failure, print ERROR with exit code/message and the tool name.
- Redaction utility
  - Add a small redact(text) helper used on args and command strings.
  - Patterns: Env‑like tokens (API keys), bearer tokens, basic auth in URLs, git remotes with embedded creds.
- Persistence
  - Write a JSONL trace to .bmo/sessions/<id>/trace.jsonl with entries:
    - { t, type: "tool_call", tool, args_sanitized }
    - { t, type: "tool_result", tool, success, side_effects, output_snippet }

Side‑effects schema for tools
- Define a light convention all tools should follow in their return JSON:
  - success: boolean
  - result: string | object
  - side_effects: { reads?: string[], writes?: string[], deletes?: string[], command?: string }
- Update built‑ins to populate side_effects:
  - read_file: side_effects.reads = [filename]
  - write_file: side_effects.writes = [filename]
  - delete_file: side_effects.deletes = [filename]
  - run_command: side_effects.command = command
- Update the tool execution handler to prefer tool‑reported side_effects; fall back to inference by tool name/args when missing.

Prompting for “why”
- Update lib/system-prompt.mjs to instruct the assistant:
  - Before calling a tool, emit one short line starting with “Why:” describing the intent in plain English.
  - After tool results are returned, briefly summarize the outcome (one line), then continue.
- Even if the model omits the Why, the agent loop heuristic will still print a generic reason.

Full command visibility
- Log the exact run_command string before execution, after redaction.
- For multi‑step sequences, encourage use of a single run_command with `set -euo pipefail` and `&&` to make the full pipeline visible.
- Optional future tool: run_commands with an array of commands; agent prints the full list and executes sequentially with early exit on failure.

Config and UX toggles
- Env/CLI flags:
  - BMO_TRACE=1 to enable trace (default on)
  - BMO_TRACE_VERBOSE=1 to include full sanitized args JSON
  - BMO_CONFIRM_DESTRUCTIVE=1 to require Y/N before delete_file or potentially destructive run_command (e.g., rm -rf, git push --force)

Acceptance criteria
- When the agent reads/writes/deletes a file, the filename is printed and recorded in trace.jsonl.
- When the agent runs a command, the exact command line is printed (sanitized) and recorded.
- A “Why:” line appears prior to each tool call and an “Outcome:” line after.
- Secrets are redacted in both console output and trace.
- Built‑in tools populate side_effects as described; non‑compliant tools still produce reasonable traces via inference.

## UX / TUI

The current readline implementation is lacking. I would prefer a TUI where
it's easier to do multiline writing and editing, and you can scroll up
through the conversation history while keeping the chat section "pinned" to
the bottom of the TUI, and maybe display other information, like the model
you're engaging with, in other places.

## UX / file mentions

TK
