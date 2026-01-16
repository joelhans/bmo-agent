AGENTS.md — Project Context and Working Notes

Use this file to capture an evolving understanding of the project. It is loaded into the agent’s system prompt on startup.

Sections
- Project Overview
- File Structure
- Key Components
- Patterns and Conventions
- Tooling Opportunities (incl. “tools that would have helped”)
- Self-Improvement Opportunities

## Project Overview
- bmo is a minimal Node.js CLI coding agent that streams responses from OpenAI and can act on the local workspace via tools.
- bmo’s job: take user input and complete tasks using available tools, prioritizing action over suggestion.
- Current tools:
  - list_cwd(): list files/directories in the current working directory.
  - read_file(filename): read file contents.
  - write_file(filename, content): write or overwrite a file with provided content.

## File Structure
- .env: Environment variables (OPENAI_API_KEY required; NGROKAI optional baseURL override; BMO_DATA_DIR optional for logs).
- AGENTS.md: This file (project memory/context) loaded into the system prompt at startup.
- index.mjs: Main CLI. Implements streaming, tool calls, and a clear system prompt establishing bmo’s identity and action-first behavior.
- package.json: Dependencies and scripts (runs with node index.mjs; optional Bun compile to dist/bmo; install-cli helper).
- pnpm-lock.yaml: Locked dependency versions.
- node_modules/: Installed packages.

Potential/optional folders that could be introduced later
- reports/: For transcripts, summaries, or artifacts (not currently present).
- steps/: For workflows/notes (not currently present).

## Key Components
- Conversation state: conversationHistory accumulates user, assistant, and tool messages.
- System prompt: Built at startup to assert bmo’s identity and behavior, and to inline AGENTS.md for extra context.
- OpenAI client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.NGROKAI })
- Streaming loop (runPrompt):
  1) Ensure system message is present.
  2) Push user input to history.
  3) Create a streaming chat completion with the tools schema.
  4) Accumulate assistant content while capturing tool_calls deltas.
  5) After stream ends, push the full assistant message (and tool_calls, if any) to history.
  6) If tool_calls were present, execute each synchronously, push tool results as tool messages, and loop again until an assistant message arrives with no further tool calls.
- Tools exposed to the model:
  - list_cwd(): returns { ok, files } listing current directory.
  - read_file(filename): returns { ok, content } or { ok: false, error }.
  - write_file(filename, content): writes content, returns { ok, message } or { ok: false, error }.

## Patterns and Conventions
- Action-first: when tasks involve files, the model is instructed to call tools (discover with list/read; change with write) instead of only suggesting steps.
- Tools return JSON-serialized strings so they can be safely added to conversationHistory.
- All edits occur via write_file with full-file content.
- Brief, results-focused replies: after actions, summarize what was done and the outcome.
- Session log is written to ~/.local/share/bmo (or BMO_DATA_DIR), with secure permissions when possible.

## Tooling Opportunities (incl. “tools that would have helped”)
- Recursive/filtered file listing (glob, include/exclude) to navigate larger repos.
- Append/patch utilities (append_line, insert_after, json_patch) to avoid full overwrites when not necessary.
- Diff/preview tool to show proposed changes before writing.
- Structured code mod tools (regex replace, AST transforms for JS/TS) for safer refactors.
- Project summarizer that scans repo structure on first run and seeds File Structure + Key Components.
- Safe shell execution tool with explicit user confirmation for build/test automation.

## Self-Improvement Opportunities
- Add retries/backoff for API calls and better error messages for tool failures.
- Tighten path safety (restrict tool access to within repo; consider allowlists).
- Optional: Persist conversation transcripts/artifacts to reports/ with timestamps.
- Optional: Provide deduplication/merge logic for AGENTS.md updates when a future context-update tool is added.
