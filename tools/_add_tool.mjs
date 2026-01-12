import * as fs from "fs";
import * as path from "path";

// Write tools directly to the source repo
const BMO_HOME = process.env.BMO_HOME || path.join(process.env.HOME, "src", "bmo-agent");
const TOOLS_DIR = path.join(BMO_HOME, "tools");

export const definition = {
  type: "function",
  function: {
    name: "_add_tool",
    description: `Create a new tool capability for yourself. Use this when you need functionality you don't currently have.
The tool will be written to the source repo and immediately available after reload.
Common tools you might need: run_command (shell commands), http_request (API calls), search_files (grep/find), etc.`,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The tool name (snake_case, e.g., 'run_command')"
        },
        description: {
          type: "string",
          description: "Clear description of what the tool does"
        },
        parameters: {
          type: "object",
          description: "JSON Schema for the tool's parameters. Must include: type: 'object', properties: { ... }, required: []"
        },
        implementation: {
          type: "string",
          description: "The JavaScript implementation as an async function body. Provide only the function body for execute(args). Must return a JSON string. Can use: fs, path, child_process (as cp), https, http modules."
        }
      },
      required: ["name", "description", "parameters", "implementation"],
    },
  }
};

export async function execute(args) {
  try {
    const { name, description, parameters, implementation } = args;

    // Validate tool name
    if (typeof name !== "string" || !/^[a-z][a-z0-9_]*$/.test(name)) {
      return JSON.stringify({ success: false, error: "Tool name must be snake_case starting with a letter" });
    }

    // Don't allow overwriting meta-tools
    if (name.startsWith("_")) {
      return JSON.stringify({ success: false, error: "Cannot create tools starting with underscore" });
    }

    // Validate description
    if (typeof description !== "string" || !description.trim()) {
      return JSON.stringify({ success: false, error: "Description is required and must be a non-empty string" });
    }

    // Validate parameters schema
    if (typeof parameters !== "object" || parameters === null) {
      return JSON.stringify({ success: false, error: "parameters must be an object with JSON Schema" });
    }
    if (parameters.type !== "object" || typeof parameters.properties !== "object" || !Array.isArray(parameters.required)) {
      return JSON.stringify({ success: false, error: "parameters schema must include: type: 'object', properties: { ... }, required: []" });
    }

    // Validate implementation body
    if (typeof implementation !== "string" || !implementation.trim()) {
      return JSON.stringify({ success: false, error: "implementation must be a non-empty string containing the execute body" });
    }

    // Prevent accidental module wrappers inside implementation
    if (/\bexport\b|\bimport\b/.test(implementation)) {
      return JSON.stringify({ success: false, error: "implementation must not include import/export/module wrappers" });
    }

    const parametersCode = JSON.stringify(parameters, null, 2).split('\n').join('\n    ');

    // Always wrap implementation with try/catch to enforce error handling and JSON-string returns on error
    const toolCode = `import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as https from "https";
import * as http from "http";

export const definition = {
  type: "function",
  function: {
    name: "${name}",
    description: ${JSON.stringify(description)},
    parameters: ${parametersCode},
  }
};

export async function execute(args) {
  try {
${implementation.split('\n').map(l => "    " + l).join('\n')}
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}
`;

    const toolPath = path.join(TOOLS_DIR, `${name}.mjs`);

    fs.writeFileSync(toolPath, toolCode, "utf-8");
    return JSON.stringify({
      success: true,
      message: `Tool '${name}' created at ${toolPath}. Call _reload_tools to activate it.`,
      path: toolPath
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: `Failed to create tool: ${err.message}` });
  }
}
