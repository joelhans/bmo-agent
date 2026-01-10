import * as fs from "fs";
import * as path from "path";

// BMO_HOME env var points to the source repo, or default to a known location
const BMO_HOME = process.env.BMO_HOME || path.join(process.env.HOME, "src", "bmo-agent");
const TOOLS_DIR = path.join(BMO_HOME, "tools");

let toolDefinitions = [];
let toolExecutors = {};
let loadGeneration = 0;

export async function loadTools() {
  loadGeneration++;
  const currentGen = loadGeneration;

  const newDefinitions = [];
  const newExecutors = {};

  if (!fs.existsSync(TOOLS_DIR)) {
    console.error(`\x1b[31m[Tool Loader] Tools directory not found: ${TOOLS_DIR}\x1b[0m`);
    console.error(`\x1b[31mSet BMO_HOME environment variable to your bmo-agent repo path\x1b[0m`);
    return { tools: [], executors: {} };
  }

  const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith(".mjs"));

  for (const file of files) {
    const toolPath = path.join(TOOLS_DIR, file);
    try {
      // Add cache-busting query parameter for hot reload
      const fileUrl = `file://${toolPath}?v=${currentGen}`;
      const module = await import(fileUrl);

      if (module.definition && module.execute) {
        newDefinitions.push(module.definition);
        newExecutors[module.definition.function.name] = module.execute;
      }
    } catch (err) {
      console.error(`\x1b[31m[Tool Loader] Failed to load ${file}: ${err.message}\x1b[0m`);
    }
  }

  toolDefinitions = newDefinitions;
  toolExecutors = newExecutors;

  return { tools: toolDefinitions, executors: toolExecutors };
}

export function getTools() {
  return toolDefinitions;
}

export function getExecutors() {
  return toolExecutors;
}

export async function executeTool(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args);

  const executor = toolExecutors[name];
  if (!executor) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  try {
    return await executor(parsedArgs);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

export function getToolsDir() {
  return TOOLS_DIR;
}

export function getBmoHome() {
  return BMO_HOME;
}
