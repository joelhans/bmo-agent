AGENTS.md — Project Context and Working Notes

Use this file to capture an evolving understanding of the project. It is loaded into the agent’s system prompt on startup. Update it via the update_agent_context tool as the project changes.

Sections
- Project Overview
- File Structure
- Key Components
- Patterns and Conventions
- Tooling Opportunities (incl. “tools that would have helped”)
- Self-Improvement Opportunities

## Project Overview
- A minimal Node.js CLI chat agent that streams responses from OpenAI and allows the model to call local file tools during a conversation.
- Two entry points exist:
  - index.mjs: Basic streaming CLI with three file tools; now extended with persistent memories and two new update_* tools.
  - index-tool-reasoning.mjs: Variant that asks the model to include a short reason in tool calls and prints a clear tool execution banner; also extended with persistent memories and update_* tools.
- Goal: rapidly iterate on agent behaviors and local tooling for coding/automation tasks.

## File Structure
- .env: Environment variables (OPENAI_API_KEY required, NGROKAI optional baseURL override).
- AGENTS.md: This file (project memory/context) loaded into the system prompt at startup.
- index.mjs: Main CLI variant (model set to "gpt-5" as in the original code). Implements streaming, tool calls, and the memory tools.
- index-tool-reasoning.mjs: Alternative CLI variant (model set to gpt-4o) that displays a tool banner and supports a "reason" argument in tool calls; now also includes memory tools.
- package.json: Dependencies and scripts. Note: scripts reference ts-node, while code uses .mjs (Node ESM). Running with node index.mjs works.
- pnpm-lock.yaml: Locked dependency versions.
- node_modules/: Installed packages.

Potential/optional folders that could be introduced later
- reports/: For transcripts, summaries, or artifacts (not currently present).
- steps/: For workflows/notes (not currently present).

## Key Components
- Conversation state: conversationHistory accumulates user messages, assistant messages, and tool results.
- OpenAI client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.NGROKAI })
- Streaming loop (runPrompt):
  1) Push user input to history.
  2) Create a streaming chat completion with the tools schema.
  3) Accumulate assistant content while capturing any tool_calls deltas.
  4) After stream ends, push the full assistant message (and tool_calls, if any) to history.
  5) If tool_calls were present, execute each synchronously, push tool results as tool messages, and loop again until an assistant message arrives with no further tool calls.
- Tools exposed to the model (both CLIs):
  - list_cwd(): returns { files } listing current working directory.
  - read_file(filename): returns { content } of a file.
  - write_file(filename, content): writes content, returns { success, message }.
  - update_preferences(section, text): persists global preferences to ~/.my-agent/PREFERENCES.md (sections: Coding Style, Workflow, Communication).
  - update_agent_context(section, text): appends bullets to this AGENTS.md (sections: Project Overview, File Structure, Key Components, Patterns and Conventions, Tooling Opportunities, Self-Improvement Opportunities).
- Memory loading at startup: The system prompt includes a blurb explaining the two memory types and inlines the current contents of PREFERENCES.md and AGENTS.md.

## Patterns and Conventions
- Tools return JSON-serialized strings so they can be safely added to conversationHistory.
- index-tool-reasoning.mjs encourages the model to include a short "reason" field for tool calls and prints a compact banner before execution.
- Preferences and agent context updates are appended as timestamped bullets under specific markdown headers (for auditability and easy merges).
- The original docs mentioned a "switch <model>" command, but that is not currently implemented in either CLI.

## Tooling Opportunities (incl. “tools that would have helped”)
- File search/glob tool (e.g., list files matching patterns, recursive directory listing) to speed up navigation.
- Append/patch utilities (append_line, insert_after, json_patch) to avoid full file overwrites.
- Diff/preview tool to show proposed changes before writing.
- Structured code mod tools (regex replace, AST transforms for JS/TS) for safer edits.
- Project summarizer that scans repo structure on first run and seeds File Structure + Key Components.
- Safe shell execution tool with explicit user confirmation per command (for build/test automation).

## Self-Improvement Opportunities
- Align package.json scripts with actual entry points (either switch scripts to "node index.mjs" or migrate to TS and use ts-node properly).
- Improve error handling around JSON.parse for tool args and fs operations; return rich error objects.
- Add rate limit/backoff handling for API calls.
- Tighten path safety (restrict tool access to within repo; consider allowlists).
- Optional: Persist conversation transcripts to reports/ with timestamps.
- Optional: Provide a small deduplication pass when appending bullets to avoid near-duplicate entries in PREFERENCES.md and AGENTS.md.
- Ensure that whenever an existing tool accomplishes a task sub-optimally, an optimized tool is developed and integrated, followed by direct addition and commit to GitHub.

## Best Practices for Building New Tools
- Name all functions explicitly to avoid syntax errors and improve readability.
- Use consistent error handling; wrap operations in try/catch blocks and return informative JSON error messages.
- When designing tools, ensure they only have access to necessary resources to minimize security risks.
- Construct asynchronous operations thoughtfully to avoid blocking the event loop.
