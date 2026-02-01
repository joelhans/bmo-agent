# bmo — Golden Path for Adding New Tools and Skills

Purpose
- Make adding tools and skills predictable, fast, and repeatable. Favor smallest viable tools and continuous simplification.

Quickstart — Tools (TL;DR)
1) Discover: list existing tools and confirm none fit
   - Use run_command to list bmo://tools/ and scan names
2) Hypothesize: state what you expect this tool to improve (tokens, speed, reliability) and by how much
3) Write: create a JS module tool (preferred) or descriptor + executable, with capability declarations
4) Reload: call reload_tools to pick up the new tool
5) Verify: call the new tool once with a simple input; confirm it works
6) Use: continue with the original task
7) Prune: if the new tool supersedes an old one, deprecate/remove the old tool after validation
8) Commit (self‑improvement only): record changes ONLY for bmo:// paths

Quickstart — Skills (TL;DR)
1) Identify: recognize a recurring pattern, best practice, or domain knowledge worth encoding
2) Write: create bmo://skills/<name>.md with front-matter (name, description, triggers) and body
3) Reload: skill index refreshes automatically
4) Verify: use load_skill to confirm the skill loads and contains useful content
5) Reference: use the skill in the current or future tasks
6) Commit (self‑improvement only): record changes ONLY for bmo:// paths

Environment specifics
- Tools directory: bmo://tools/
  - JS module tools: tools/<name>.mjs
  - External descriptors: tools/<name>.json
  - External executables: tools/bin/*
- Skills directory: bmo://skills/
  - Skill files: skills/<name>.md (with YAML front-matter)
- Writes to bmo:// mirror to BMO_SOURCE when set

JS module tool template (preferred)
  // tools/tool_name.mjs
  export const schema = {
    type: "object",
    properties: {
      target: { type: "string", description: "Primary target (file/path/cmd)" },
      reason: { type: "string", description: "Why this tool is needed right now" }
    },
    required: ["target"]
  };
  // Optional: export const requires = ["rg", "jq"];

  // Optional: export const capabilities = { filesystem: "project", network: false };

  export async function run({ target, reason }) {
    // Implementation here
    return { ok: true, result: "..." };
  }

External tool descriptor template (secondary, for non-JS tools)
  {
    "name": "tool_name",
    "description": "What this tool does (one sentence).",
    "schema": {
      "type": "object",
      "properties": {
        "target": { "type": "string", "description": "Primary target (file/path/cmd)" },
        "reason": { "type": "string", "description": "Why this tool is needed right now" }
      },
      "required": []
    },
    "command": "./bin/tool_name",
    "requires": ["jq"]
  }
- "requires" (optional): list external binaries the tool depends on. Checked at registration; missing deps mark the tool unavailable.
- Executable must read JSON from stdin and print a single JSON line with ok: true/false to stdout.

Skill template
  ---
  name: skill_name
  description: One sentence describing what this skill teaches.
  triggers: [keyword1, keyword2, keyword3]
  ---

  # Skill Name

  ## When to use
  Describe the situations where this knowledge applies.

  ## Best practices
  - Concrete, actionable guidance
  - Examples with real commands or code
  - Common pitfalls and how to avoid them

  ## Examples
  Show specific usage patterns with expected outcomes.

Step-by-step — Tools (expanded)
1) Investigate the smallest viable tool
   - Before building, check if an existing tool solves it
   - Don't assume file contents or structure. Always discover first (run_command with ls/cat, or purpose-built tools).
2) State a hypothesis
   - Before writing code, state what you expect: "This tool will reduce X by Y%" or "This will eliminate failure Z."
   - Record the hypothesis in the IMPROVEMENTS.md entry.
3) Write the tool
   - Prefer JS module format: tools/<name>.mjs with exported schema + run function
   - For non-JS tools: tools/<name>.json descriptor + tools/bin/<name> executable
   - Declare capabilities: what filesystem scope, network, subprocess, env access the tool needs
   - List external dependencies in "requires" so registration can pre-flight check them
4) Reload
   - After writing, call reload_tools to rescan the tools directory; no restart needed
5) Verify
   - Immediately call the new or changed tool with a minimal input and check the result
6) Continue
   - Use the new or improved tool to finish the task
7) Prune
   - Remove or deprecate overlapping tools; prefer one safer/faster tool over many
8) Commit (self‑improvement only)
   - Only commit when you changed bmo:// files; create commits in BMO_SOURCE when set

Step-by-step — Skills (expanded)
1) Identify the knowledge gap
   - Notice repeated patterns, frequent mistakes, or domain expertise worth encoding
   - Check if an existing skill already covers it (run_command to list bmo://skills/)
2) Write the skill
   - Create bmo://skills/<name>.md with YAML front-matter and structured body
   - Keep it concrete and actionable — examples over theory
   - Include triggers that help bmo know when to load this skill
3) Verify
   - Use load_skill to confirm content loads correctly and is useful
4) Reference
   - In the current task, load and apply the skill
   - In future sessions, bmo can discover and load it when triggers match

Error recovery (tools)
- If verification fails (tool throws, returns unexpected output, or schema mismatch):
  1) Read stderr / error message. Diagnose the issue.
  2) Fix the tool module or descriptor, re-save, and call reload_tools.
  3) Re-verify with the same minimal input.
  4) If still failing after 3 attempts, abandon the tool creation. Log the failure to IMPROVEMENTS.md (scope: tool, summary: "failed — <reason>"). Continue the original task using existing tools or run_command.
- Cost guardrail: if the total cost of the tool-creation attempt exceeds the self-improvement circuit breaker threshold (default $0.50), abandon immediately regardless of retry count.
- Never leave a broken tool registered. If a tool fails verification, either fix it or delete both the module and descriptor before continuing.

Error recovery (skills)
- If load_skill returns empty or malformed content, re-read and fix the skill file.
- Skills are lower-risk than tools (no execution), so retries are less costly. But still cap at 3 attempts.

Compatibility posture (breaking changes)
- Optimize in place whenever it becomes safer/faster/more correct; document differences.
- Add escape hatches (allowDangerous, confirmDangerous) rather than preserving unsafe defaults.

Common pitfalls (avoid these)
- Forgetting to call reload_tools after writing tools via run_command
- Returning non‑JSON output from external tools
- Writing outside bmo://tools/ or bmo://skills/
- Skipping discovery before building
- Autocommitting in user projects (forbidden unless explicitly asked)
- Writing a tool when a skill would be more appropriate (and vice versa): tools do things, skills teach how to do things well
