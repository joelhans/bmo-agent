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

## 2026-01-11 – Scrub PII and add strict privacy rules
- Why: Prevent accidental exposure of API keys and other sensitive info in docs and prompts
- Prompt summary: User requested removal of PII from guidelines and explicit instructions not to reveal secrets
- Implementation: Sanitized BMO_TOOL_GUIDELINES.md to remove PII; added Privacy/Secret Handling section; updated system prompt with no-PII/secrets rule
## 2026-01-12 – fix_write_repo_file
- Why: Existing write_repo_file.mjs had invalid parameters schema and embedded backslash-n escapes that caused invalid token errors at load time.
- Prompt summary: User reported errors related to write_repo_file.mjs and invalid or unexpected tokens.
- Implementation: Rewrote tools/write_repo_file.mjs with a proper JSON schema for parameters, clean execute implementation without escape sequences, robust validation, directory creation, and JSON-string returns.

## 2026-01-12 – harden_add_tool
- Why: Prevent future invalid token issues by enforcing schema validation and wrapping body with try/catch automatically.
- Prompt summary: User asked to fix errors and double-check strategy for implementing new tools.
- Implementation: Strengthened tools/_add_tool.mjs to validate schema, sanitize implementation body, auto-wrap with try/catch, and return structured JSON errors.

## 2026-01-12 – add_tool_ci_validation
- Why: Ensure tool integrity continuously and prioritize self-improvement autonomy without relying on user prompting.
- Prompt summary: User emphasized that decisions should be what BMO thinks is best for BMO’s self-improving abilities.
- Implementation: Added scripts/validate-tools.mjs and npm script validate:tools. Ran it to validate all tools and fixed delete_file schema. Updated _add_tool to enforce stricter standards.

