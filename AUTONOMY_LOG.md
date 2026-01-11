# Autonomy Log

This log records autonomous improvements and changes made by BMO.
Each entry includes why, a sterilized prompt summary, and a concise implementation description.

## 2026-01-11 – Add tool creation guidelines
- Why: Avoid ES module export errors for tools in a CommonJS loader
- Prompt summary: User asked me to improve how I create tools and keep the repo clean
- Implementation: Added BMO_TOOL_GUIDELINES.md documenting CJS-compatible _add_tool rules (implementation body only, JSON-string returns, try/catch, no exports)

## 2026-01-11 – Switch to AUTONOMY_LOG.md and harden guidelines
- Why: Prefer human-readable log and eliminate remaining "invalid or unexpected token" errors from tools
- Prompt summary: User requested markdown log and noted loader token errors persisted
- Implementation: Replaced .bmo/autonomy_log.jsonl with AUTONOMY_LOG.md; strengthened guidelines to explicitly ban ESM exports/imports, module.exports, top-level await, and nested function declarations in tool implementations; added a preflight validation step in my workflow to check tool bodies for disallowed tokens before creation
