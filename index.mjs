import OpenAI from "openai";
import "dotenv/config";
import * as readline from "readline";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// ============================================================================
// BMO_HOME resolution
// ============================================================================
function getBmoHome() {
  if (process.env.BMO_HOME) {
    return path.resolve(process.env.BMO_HOME);
  }
  // Derive from import.meta.url (works for both source and compiled binary)
  const currentFile = fileURLToPath(import.meta.url);
  return path.dirname(currentFile);
}

export const BMO_HOME = getBmoHome();

// ============================================================================
// Path resolution: bmo:// prefix routes to BMO_HOME
// ============================================================================
const BMO_PREFIX = "bmo://";

export function resolvePath(inputPath) {
  if (inputPath.startsWith(BMO_PREFIX)) {
    const relativePart = inputPath.slice(BMO_PREFIX.length);
    return path.join(BMO_HOME, relativePart);
  }
  return path.resolve(inputPath);
}

// ============================================================================
// Directory utilities
// ============================================================================
export function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(dir, 0o700);
      } catch (_) {}
    }
    return true;
  } catch (_) {
    return false;
  }
}

// ============================================================================
// Session logging
// ============================================================================
const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || ".";

function resolveDataDir() {
  const override = process.env.BMO_DATA_DIR;
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  return path.join(homeDir, ".local", "share", "bmo");
}

const desiredLogDir = resolveDataDir();
let logBaseDir = desiredLogDir;
if (!ensureDir(logBaseDir)) {
  const fallback = path.join(os.tmpdir(), "bmo");
  if (ensureDir(fallback)) {
    console.warn(`Warning: failed to create ${desiredLogDir}. Falling back to ${fallback}`);
    logBaseDir = fallback;
  } else {
    console.warn(`Warning: failed to create ${desiredLogDir} and ${fallback}. Falling back to current directory.`);
    logBaseDir = ".";
  }
}

const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFilePath = path.join(logBaseDir, `agent-${sessionTimestamp}.log`);
let sessionEndLogged = false;

function logToFile(text) {
  try {
    fs.appendFileSync(logFilePath, text);
  } catch (_) {}
}

function logSessionEnd(reason = "ended") {
  if (sessionEndLogged) return;
  sessionEndLogged = true;
  logToFile(`=== Agent session ${reason} at ${new Date().toISOString()} ===\n`);
}

logToFile(`=== Agent session started at ${new Date().toISOString()} ===\n`);
console.log(`Session log: ${logFilePath}`);
console.log(`BMO_HOME: ${BMO_HOME}`);

process.on("SIGINT", () => {
  console.log("\nGoodbye!");
  logSessionEnd("ended (SIGINT)");
  process.exit(0);
});
process.on("SIGTERM", () => {
  logSessionEnd("ended (SIGTERM)");
  process.exit(0);
});
process.on("exit", () => logSessionEnd("ended (exit)"));

// ============================================================================
// Dynamic tool loader
// ============================================================================
let toolSchemas = [];
const toolExecutors = new Map();

export async function reloadTools() {
  const toolsDir = path.join(BMO_HOME, "tools");
  
  if (!fs.existsSync(toolsDir)) {
    return { loaded: [], error: "tools directory not found" };
  }
  
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith(".mjs"));
  const loaded = [];
  const errors = [];
  
  // Clear existing
  toolSchemas = [];
  toolExecutors.clear();
  
  for (const file of files) {
    const toolPath = path.join(toolsDir, file);
    try {
      // Cache-bust for hot reload (critical for binary compatibility)
      const moduleUrl = pathToFileURL(toolPath).href + `?update=${Date.now()}`;
      const mod = await import(moduleUrl);
      
      if (mod.schema && typeof mod.execute === "function") {
        toolSchemas.push(mod.schema);
        toolExecutors.set(mod.schema.function.name, mod.execute);
        loaded.push(mod.schema.function.name);
      } else {
        errors.push(`${file}: missing schema or execute`);
      }
    } catch (e) {
      errors.push(`${file}: ${e.message}`);
    }
  }
  
  console.log(`\x1b[36m[Tools loaded: ${loaded.join(", ")}]\x1b[0m`);
  return { loaded, errors: errors.length ? errors : undefined };
}

// ============================================================================
// Tool execution
// ============================================================================
async function executeTool(toolCall) {
  const { name, arguments: args } = toolCall.function;
  let parsedArgs = {};
  try {
    parsedArgs = args ? JSON.parse(args) : {};
  } catch (e) {
    return JSON.stringify({ ok: false, error: `Invalid tool arguments: ${String(e)}`, raw: String(args) });
  }

  const reason = parsedArgs.reason;
  const filename = parsedArgs.filename || parsedArgs.path;
  const details = [filename ? `file=${filename}` : null, reason ? `reason=${reason}` : null]
    .filter(Boolean)
    .join(" ");

  console.log(`\x1b[33m[Tool Call: ${name}]\x1b[0m ${details}`);
  logToFile(`[${new Date().toISOString()}] Tool call ${name} ${details}\n`);

  const executor = toolExecutors.get(name);
  if (!executor) {
    return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
  }
  
  try {
    return await executor(parsedArgs);
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) });
  }
}

// ============================================================================
// System prompt
// ============================================================================
function isBmoRepo() {
  try {
    const pkgRaw = fs.readFileSync("package.json", "utf-8");
    const pkg = JSON.parse(pkgRaw);
    return pkg && typeof pkg.name === "string" && pkg.name === "bmo-agent";
  } catch (_) {
    return false;
  }
}

function buildSystemPrompt() {
  const toolNames = Array.from(toolExecutors.keys()).join(", ");
  
  const parts = [];
  parts.push(`You are bmo — a fast, pragmatic, and self-improving coding agent. Your job is to complete tasks using available tools, and autonomously improve yourself when you encounter limitations.

## Self-improvement loop

When a task requires capabilities beyond your current tools:
1. Investigate the smallest viable solution as a new tool
2. Write the tool to bmo://tools/{name}.mjs
3. Call reload_tools to load it
4. Verify it works by calling it to complete part of the task
5. Continue with the original task

Err on the side of building new tools. It's okay to make the user wait once while you build a tool that improves their experience many times in the future.

## Path prefixes

- Regular paths target the current working directory (the user's project)
- Paths starting with bmo:// target your own codebase at ${BMO_HOME}

Your codebase structure:
- bmo://index.mjs — core loop (modify carefully)
- bmo://tools/ — your tools, one per file
- bmo://AGENTS.md — your understanding of yourself

## Available tools

${toolNames}

## Tool file format

Each tool in bmo://tools/ exports:
- schema: the tool definition for the OpenAI API
- execute: an async function that performs the action

Example:
\`\`\`js
import { resolvePath } from "../index.mjs";

export const schema = {
  type: "function",
  function: {
    name: "example_tool",
    description: "What this tool does",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

export async function execute(args) {
  return JSON.stringify({ result: "..." });
}
\`\`\`

## Behavioral rules

- Prefer doing over suggesting. If a file must be read/edited to proceed, call the tool immediately.
- Keep replies concise. Summarize actions and show results.
- Do not assume file contents — discover using list_files/read_file.
- All edits must go through write_file with the full desired content.
- After writing, briefly note what changed.`);

  // Inline project notes
  try {
    const disableNotes = process.env.BMO_DISABLE_NOTES === "1";
    const notesFileEnv = (process.env.BMO_NOTES_FILE || "").trim();
    const inlineFlag = process.env.BMO_INLINE_NOTES === "1" || isBmoRepo();

    if (!disableNotes) {
      let notesPath = "";
      if (notesFileEnv) {
        notesPath = path.resolve(notesFileEnv);
      } else if (inlineFlag && fs.existsSync("AGENTS.md")) {
        notesPath = path.resolve("AGENTS.md");
      }

      if (notesPath && fs.existsSync(notesPath)) {
        const notes = fs.readFileSync(notesPath, "utf-8");
        parts.push(`Project notes (${path.basename(notesPath)}):\n` + notes);
      }
    }
  } catch (_) {}

  return parts.join("\n\n");
}

// ============================================================================
// OpenAI client and conversation
// ============================================================================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.NGROKAI,
});

const conversationHistory = [];
let systemPromptInitialized = false;

function ensureSystemPrompt() {
  if (systemPromptInitialized) return;
  conversationHistory.push({ role: "system", content: buildSystemPrompt() });
  systemPromptInitialized = true;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function getUserInput(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function runPrompt(prompt) {
  ensureSystemPrompt();

  conversationHistory.push({
    role: "user",
    content: prompt,
  });

  while (true) {
    const stream = await client.chat.completions.create({
      model: "gpt-5",
      messages: conversationHistory,
      tools: toolSchemas,
      stream: true,
    });

    let fullContent = "";
    let toolCalls = [];

    const fullMessage = {
      role: "assistant",
      content: "",
      tool_calls: undefined
    };

    process.stdout.write(`\x1b[31mbmo\x1b[0m: `);

    for await (const part of stream) {
      const delta = part.choices[0]?.delta || {};

      if (delta.content) {
        fullContent += delta.content;
        process.stdout.write(delta.content);
      }

      if (delta.tool_calls) {
        for (const toolDelta of delta.tool_calls) {
          const idx = toolDelta.index;

          if (!toolCalls[idx]) {
            toolCalls[idx] = {
              id: toolDelta.id,
              type: "function",
              function: { name: "", arguments: "" }
            };
          }

          if (toolDelta.function?.name) {
            toolCalls[idx].function.name += toolDelta.function.name;
          }
          if (toolDelta.function?.arguments) {
            toolCalls[idx].function.arguments += toolDelta.function.arguments;
          }
        }
      }
    }

    process.stdout.write("\n");

    fullMessage.content = fullContent;
    if (toolCalls.length > 0) {
      fullMessage.tool_calls = toolCalls;
    }

    conversationHistory.push(fullMessage);
    
    if (fullMessage.tool_calls && fullMessage.tool_calls.length > 0) {
      for (const toolCall of fullMessage.tool_calls) {
        const result = await executeTool(toolCall);
      
        conversationHistory.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      continue;
    }

    logToFile(`bmo: ${fullContent}\n`);
    break;
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  // Load tools before starting
  await reloadTools();
  
  console.log("Chat with bmo (type 'exit' to quit)");
  
  while (true) {
    const input = await getUserInput("\n\x1b[32mYou\x1b[0m: ");
    
    if (input.toLowerCase() === "exit") {
      console.log("Goodbye!");
      logSessionEnd("ended (command)");
      rl.close();
      break;
    }

    logToFile(`You: ${input}\n`);
    await runPrompt(input);
  }
}

main();
