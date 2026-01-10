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
          description: "JSON Schema for the tool's parameters"
        },
        implementation: {
          type: "string",
          description: "The JavaScript implementation as an async function body. Has access to 'args' object containing the parameters. Must return a JSON string. Can use: fs, path, child_process (as cp), https, http modules."
        }
      },
      required: ["name", "description", "parameters", "implementation"],
    },
  }
};

export async function execute(args) {
  const { name, description, parameters, implementation } = args;

  // Validate tool name
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return JSON.stringify({ error: "Tool name must be snake_case starting with a letter" });
  }

  // Don't allow overwriting meta-tools
  if (name.startsWith("_")) {
    return JSON.stringify({ error: "Cannot create tools starting with underscore" });
  }

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
    parameters: ${JSON.stringify(parameters, null, 2).split('\n').join('\n    ')},
  }
};

export async function execute(args) {
  ${implementation}
}
`;

  const toolPath = path.join(TOOLS_DIR, `${name}.mjs`);

  try {
    fs.writeFileSync(toolPath, toolCode, "utf-8");
    return JSON.stringify({
      success: true,
      message: `Tool '${name}' created at ${toolPath}. Call _reload_tools to activate it.`,
      path: toolPath
    });
  } catch (err) {
    return JSON.stringify({ error: `Failed to create tool: ${err.message}` });
  }
}
