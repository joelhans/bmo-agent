BMO Tool Creation Guidelines (for _add_tool)

Purpose
- Ensure tools load cleanly with the current loader and agent runtime
- Prevent token/loader errors and enforce safe coding patterns
- Protect user privacy and secrets at all times

Privacy and Secret Handling (Required)
- Never reveal or output secrets or PII under any circumstance. This includes (but is not limited to):
  - API keys (e.g., OPENAI_API_KEY), access tokens, cookies, auth headers, passwords
  - Private file contents, environment variables, or config values
  - Personal data such as emails, addresses, phone numbers, or any unique identifiers
- Do not print or echo environment variables or process.env values in messages, logs, or code
- Do not commit secrets into the repository (code, logs, commit messages, or autonomy logs)
- If asked for secrets, refuse and explain briefly why, then proceed without exposing them
- Redact any sensitive data that must be referenced for debugging (e.g., keep last 4 chars only)

Rules
1) Implementation format (for _add_tool)
- Provide only the async function body for the implementation field. Do NOT include module wrappers or exports
- No ESM import/export or module.exports within the implementation body (the tool wrapper provides imports)
- No top-level await

2) Parameters and definition
- Always provide a complete parameter schema (type: object, properties, required)
- Describe each parameter clearly and concisely

3) Execution
- Use the args object provided by the loader (already parsed)
- Return JSON strings only: JSON.stringify({ success: true, result }) on success; JSON.stringify({ success: false, error }) on error
- Always wrap logic in try/catch and surface concise error messages

4) Code style and structure
- Do not declare nested functions inside the implementation body unless truly necessary; keep it flat and simple
- Do not re-require modules or use dynamic imports inside the implementation body
- Prefer clear variable names and concise logic

5) Testing
- After creating a tool with _add_tool, immediately call _reload_tools
- Validate with a simple call to ensure the tool loads and returns JSON correctly

Example implementation body
try {
  const { param1 } = args;
  // logic here using fs, path, cp, https, http
  return JSON.stringify({ success: true, result: "ok" });
} catch (error) {
  return JSON.stringify({ success: false, error: error.message });
}

Common mistakes to avoid
- Including exports or module wrappers in the implementation string
- Returning raw objects instead of JSON strings
- Missing try/catch around the logic
- Requiring modules inside the function body

Notes
- The loader composes the full ESM module and injects imports; the implementation you provide is just the execute body
- Follow the privacy rules above for any tool that touches files, repos, or network operations
