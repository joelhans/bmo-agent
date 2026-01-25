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
  
  // Check if running as a Bun-compiled binary
  // In compiled binaries, import.meta.url points to /$bunfs/root which doesn't exist
  const currentFile = fileURLToPath(import.meta.url);
  if (currentFile.startsWith("/$bunfs/")) {
    // Use the directory containing the executable
    return path.dirname(process.execPath);
  }
  
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
// Session logging and data dir
// ============================================================================
const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || ".";

function resolveDataDir() {
  const override = process.env.BMO_DATA_DIR;
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  return path.join(homeDir, ".local", "share", "bmo");
}

const desiredDataDir = resolveDataDir();
let dataBaseDir = desiredDataDir;
if (!ensureDir(dataBaseDir)) {
  const fallback = path.join(os.tmpdir(), "bmo");
  if (ensureDir(fallback)) {
    console.warn(`Warning: failed to create ${desiredDataDir}. Falling back to ${fallback}`);
    dataBaseDir = fallback;
  } else {
    console.warn(`Warning: failed to create ${desiredDataDir} and ${fallback}. Falling back to current directory.`);
    dataBaseDir = ".";
  }
}

// Session log sits inside data dir
const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFilePath = path.join(dataBaseDir, `agent-${sessionTimestamp}.log`);
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
// Config management (API keys, etc.)
// ============================================================================
const configPath = path.join(dataBaseDir, "config.json");

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch (_) {
    return { keys: {} };
  }
}

function saveConfig(cfg) {
  try {
    ensureDir(path.dirname(configPath));
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    if (process.platform !== "win32") {
      try { fs.chmodSync(configPath, 0o600); } catch (_) {}
    }
    return true;
  } catch (e) {
    console.error("Failed to save config:", e.message);
    return false;
  }
}

function maskKey(k) {
  if (!k || typeof k !== "string") return "(empty)";
  const start = k.slice(0, 4);
  const end = k.slice(-4);
  return `${start}…${end}`;
}

const PROVIDER_ENV_MAP = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

// If env OPENAI_API_KEY not set, try to hydrate from config
(function hydrateEnvFromConfig() {
  const cfg = loadConfig();
  if (!process.env.OPENAI_API_KEY && cfg?.keys?.openai) {
    process.env.OPENAI_API_KEY = cfg.keys.openai;
  }
})();

// ============================================================================
// UI Bus and Console UI Adapter (Phase 0/1)
// ============================================================================
const UIBus = {
  _listeners: new Map(),
  on(type, fn) {
    const set = this._listeners.get(type) || new Set();
    set.add(fn);
    this._listeners.set(type, set);
  },
  off(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  },
  emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch (_) {}
    }
  }
};

// Lazily created readline for console UI
let rl = null;
function ensureReadline() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

function createConsoleUI(bus) {
  // Subscribe to chat events for streaming output
  bus.on('chat:assistant_start', () => {
    process.stdout.write(`\x1b[31mbmo\x1b[0m: `);
  });
  bus.on('chat:assistant_delta', (chunk) => {
    if (typeof chunk === 'string') process.stdout.write(chunk);
  });
  bus.on('chat:assistant_done', () => {
    process.stdout.write("\n");
  });
  // Optional: surface status lines
  bus.on('sys:status', (text) => {
    if (text) console.log(text);
  });
  // Tool events can be surfaced in future; keep console logs as-is for now.

  return {
    async promptInput(promptText) {
      const rlInst = ensureReadline();
      return new Promise((resolve) => rlInst.question(promptText, resolve));
    },
    dispose() {
      try { if (rl) rl.close(); } catch (_) {}
    }
  };
}

let ui = null;

async function tryInitTui(bus) {
  const isTTY = process.stdout.isTTY && process.stdin.isTTY;
  const force = process.env.BMO_TUI_FORCE === '1';
  const flag = (process.env.BMO_TUI === '1') || process.argv.includes('--tui');
  if (!(flag && (isTTY || force))) return null;

  try {
    const tuiPath = path.join(BMO_HOME, 'tui', 'ui-blessed.mjs');
    if (!fs.existsSync(tuiPath)) {
      console.warn('TUI module not found; falling back to console UI');
      return null;
    }
    const modUrl = pathToFileURL(tuiPath).href + `?t=${Date.now()}`;
    const mod = await import(modUrl);
    if (typeof mod.createTuiUI !== 'function') {
      console.warn('TUI module missing createTuiUI; falling back to console UI');
      return null;
    }
    const tui = await mod.createTuiUI(bus, {});
    console.log('TUI: enabled (neo-blessed)');
    return tui;
  } catch (e) {
    console.warn('TUI init failed:', e.message);
    return null;
  }
}

// ============================================================================
// Dynamic tool loader
// ============================================================================
let toolSchemas = [];
const toolRegistry = new Map(); // name -> { execute, details }

// Resolve tools directory: prefer bmo-tools/ (installed), fall back to tools/ (source)
function getToolsDir() {
  const bmoToolsDir = path.join(BMO_HOME, "bmo-tools");
  if (fs.existsSync(bmoToolsDir)) {
    return bmoToolsDir;
  }
  return path.join(BMO_HOME, "tools");
}

export async function reloadTools() {
  const toolsDir = getToolsDir();
  
  if (!fs.existsSync(toolsDir)) {
    const res = { loaded: [], error: "tools directory not found" };
    UIBus.emit('sys:reload_tools', res);
    return res;
  }
  
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith(".mjs") && f !== "lib.mjs");
  const loaded = [];
  const errors = [];
  
  // Clear existing
  toolSchemas = [];
  toolRegistry.clear();
  
  for (const file of files) {
    const toolPath = path.join(toolsDir, file);
    try {
      // Cache-bust for hot reload (critical for binary compatibility)
      const moduleUrl = pathToFileURL(toolPath).href + `?update=${Date.now()}`;
      const mod = await import(moduleUrl);
      
      if (mod.schema && typeof mod.execute === "function" && typeof mod.details === "function") {
        toolSchemas.push(mod.schema);
        toolRegistry.set(mod.schema.function.name, { execute: mod.execute, details: mod.details });
        loaded.push(mod.schema.function.name);
      } else {
        errors.push(`${file}: missing schema, execute, or details()`);
      }
    } catch (e) {
      errors.push(`${file}: ${e.message}`);
    }
  }
  
  console.log(`\x1b[36m[Tools loaded: ${loaded.join(", ")}]\x1b[0m`);
  const result = { loaded, errors: errors.length ? errors : undefined };
  UIBus.emit('sys:reload_tools', result);
  return result;
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

  const impl = toolRegistry.get(name);
  if (!impl) {
    return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
  }

  let detailsText = '';
  try {
    detailsText = String(impl.details(parsedArgs) || '');
  } catch (e) {
    detailsText = `details() error: ${String(e)}`;
  }

  console.log(`\x1b[33m[Tool Call: ${name}]\x1b[0m ${detailsText}`);
  logToFile(`[${new Date().toISOString()}] Tool call ${name} ${detailsText}\n`);

  UIBus.emit('tool:call_started', { name, details: detailsText });
  try {
    const out = await impl.execute(parsedArgs);
    UIBus.emit('tool:call_result', { name, ok: true });
    return out;
  } catch (e) {
    UIBus.emit('tool:call_result', { name, ok: false, error: String(e) });
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
  const toolNames = Array.from(toolRegistry.keys()).join(", ");
  
  const parts = [];
  parts.push(`You are bmo — a fast, pragmatic, and self-improving coding agent. Your job is to complete tasks using available tools, and autonomously improve yourself when you encounter limitations.

## Self-improvement loop

Build the best tool for the job — even if an existing tool could do it, but not efficiently, safely, or ergonomically enough.

When a task needs capabilities beyond current tools, or an existing tool would be awkward/inefficient:
1. Design the smallest, best tool that solves the task end-to-end with high leverage.
2. Write the tool to bmo://tools/{name}.mjs
3. Call reload_tools to load it
4. Verify with a minimal call (expect ok:true) and show concise results
5. Use it to continue the original task

Heuristics for building a new tool:
- Reduces steps or round-trips (single focused call beats multi-call chains)
- Cuts latency, token/IO usage, or shell overhead
- Adds safety/correctness guards and clear errors
- Improves ergonomics and reuse (clean interface, clear args)
- Replaces brittle orchestration with a purpose-built tool

Keep tools minimal and focused. Prefer a small purpose-built tool over complex inline logic or repeated run_command usage. It’s fine to supersede an existing tool with a better version when justified; name it clearly and document behavior in details().

## Path prefixes

- Regular paths target the current working directory (the user's project)
- Paths starting with bmo:// target your own codebase at ${BMO_HOME}

Your codebase structure:
- bmo://index.mjs — core loop (modify carefully)
- bmo://tools/ — your tools, one per file
- bmo://tools/BMO_AGENTS.md — self-guidance (Golden Path). In this repo, AGENTS.md documents the bmo codebase.

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
- After writing, briefly note what changed.
- Git commits policy: never auto-run git_commit for user projects or non-bmo repos. Only commit autonomously during the self-improvement loop and only for files under bmo:// (your own code).
  - When BMO_SOURCE is set, commit self-improvement changes only in BMO_SOURCE; do not create commits in the user’s working directory for those changes.
  - For non-bmo codebases, commit only if the user explicitly asks.

## Core edits to index.mjs (MVP)

- When a runtime limitation must be addressed and existing tools cannot solve it, propose a minimal, safe patch to index.mjs and show a concise diff.
- Apply the change using:
  - core_file(op: "write", path: "index.mjs", content: "<full updated file>")
- Commit the change for traceability using git_commit_path(message: "...") (self-improvement only; bmo:// files).
- Activation: ask the user to restart or run from source (node $BMO_SOURCE/index.mjs). Installed binaries require a rebuild; there is no core hot-reload.
- Do not auto-restart without explicit user confirmation.`);

  // Inline project notes
  try {
    const disableNotes = process.env.BMO_DISABLE_NOTES === "1";
    const notesFileEnv = (process.env.BMO_NOTES_FILE || "").trim();

    if (!disableNotes) {
      let notesPath = "";

      // Highest precedence: explicit override
      if (notesFileEnv) {
        notesPath = path.resolve(notesFileEnv);
      } else if (fs.existsSync("AGENTS.md")) {
        // Prefer AGENTS.md from the current working directory when present
        notesPath = path.resolve("AGENTS.md");
      } else {
        // Fallback for binaries and non-repo contexts: shipped Golden Path next to tools
        const toolsDir = getToolsDir();
        const bundled = path.join(toolsDir, "BMO_AGENTS.md");
        if (fs.existsSync(bundled)) {
          notesPath = bundled;
        }
      }

      if (notesPath && fs.existsSync(notesPath)) {
        const notes = fs.readFileSync(notesPath, "-utf-8");
        parts.push(`Project notes (${path.basename(notesPath)}):\n` + notes);
      }
    }
  } catch (_) {}

  return parts.join("\n\n");
}

// ============================================================================
// OpenAI client and conversation
// ============================================================================
let openaiClient = null;
function getOpenAIClient() {
  if (!openaiClient) {
    // Try a last-chance hydrate from config in case the user just ran `bmo key add`
    if (!process.env.OPENAI_API_KEY) {
      const cfg = loadConfig();
      if (cfg?.keys?.openai) {
        process.env.OPENAI_API_KEY = cfg.keys.openai;
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      const msg = "Missing OPENAI_API_KEY. Run 'bmo key add <key>' or set OPENAI_API_KEY in your environment.";
      throw new Error(msg);
    }

    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.NGROKAI,
    });
  }
  return openaiClient;
}

const conversationHistory = [];
let systemPromptInitialized = false;

function ensureSystemPrompt() {
  if (systemPromptInitialized) return;
  conversationHistory.push({ role: "system", content: buildSystemPrompt() });
  systemPromptInitialized = true;
}

async function runPrompt(prompt) {
  ensureSystemPrompt();

  conversationHistory.push({
    role: "user",
    content: prompt,
  });

  while (true) {
    const client = getOpenAIClient();
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

    UIBus.emit('chat:assistant_start');

    for await (const part of stream) {
      const delta = part.choices[0]?.delta || {};

      if (delta.content) {
        fullContent += delta.content;
        UIBus.emit('chat:assistant_delta', delta.content);
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

    UIBus.emit('chat:assistant_done');

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
// CLI: key management
// ============================================================================
function printKeyUsage() {
  console.log("Usage:\n  bmo key add <key>                 # Adds default 'openai' key\n  bmo key add <provider> <key>      # Adds key for a specific provider (openai, anthropic, openrouter, xai, google, groq, deepseek)");
}

function handleKeyCommand(args) {
  const sub = (args[0] || '').toLowerCase();
  if (sub !== 'add') {
    printKeyUsage();
    process.exitCode = 1;
    return;
  }

  // Accept either `bmo key add <key>` (defaults to openai) or `bmo key add <provider> <key>`
  let provider = 'openai';
  let key = '';

  if (args.length >= 3) {
    provider = args[1].toLowerCase();
    key = args[2];
  } else if (args.length >= 2) {
    const maybeProvider = (args[1] || '').toLowerCase();
    if (PROVIDER_ENV_MAP[maybeProvider]) {
      provider = maybeProvider;
      key = args[2] || '';
    } else {
      key = args[1];
    }
  }

  if (!key) {
    printKeyUsage();
    console.error("\nError: missing key value.");
    process.exitCode = 1;
    return;
  }

  const cfg = loadConfig();
  cfg.keys = cfg.keys || {};
  cfg.keys[provider] = key;
  const ok = saveConfig(cfg);

  // Export to env for current process when known
  const envName = PROVIDER_ENV_MAP[provider];
  if (envName) process.env[envName] = key;

  if (ok) {
    console.log(`Saved API key for '${provider}': ${maskKey(key)}\nConfig: ${configPath}`);
    // If provider is openai, let the user know it's now active for this session
    if (provider === 'openai') {
      console.log("OPENAI_API_KEY is now set for this session.");
    }
  } else {
    process.exitCode = 1;
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  // Handle CLI subcommands before loading tools
  const argv = process.argv.slice(2);
  if (argv[0] === 'key') {
    handleKeyCommand(argv.slice(1));
    return; // Do not start chat when handling key command
  }

  // Load tools before starting
  await reloadTools();
  
  // Register reload callback so reload_tools can call back into us
  try {
    const libPath = path.join(getToolsDir(), "lib.mjs");
    const libUrl = pathToFileURL(libPath).href + `?t=${Date.now()}`;
    const lib = await import(libUrl);
    lib.registerReloadCallback(reloadTools);

    // Expose effective BMO_SOURCE in this process and print a single concise runtime line
    if (!process.env.BMO_SOURCE && lib.BMO_SOURCE) {
      process.env.BMO_SOURCE = lib.BMO_SOURCE;
    }
    console.log(`Runtime: home=${BMO_HOME} source=${process.env.BMO_SOURCE || "(none)"}`);
  } catch (e) {
    console.warn("Warning: could not register reload callback:", e.message);
    console.log(`Runtime: home=${BMO_HOME} source=${process.env.BMO_SOURCE || "(none)"}`);
  }

  // Init UI: try TUI first when requested; fallback to console adapter
  ui = await tryInitTui(UIBus);
  if (!ui) ui = createConsoleUI(UIBus);

  console.log("Chat with bmo (type 'exit' to quit)\nHint: set BMO_TUI=1 or pass --tui to enable the TUI (requires neo-blessed)");
  
  while (true) {
    const input = await ui.promptInput("\n\x1b[32mYou\x1b[0m: ");
    
    if ((input || '').toLowerCase() === "exit") {
      console.log("Goodbye!");
      logSessionEnd("ended (command)");
      ui.dispose();
      break;
    }

    logToFile(`You: ${input}\n`);
    try {
      await runPrompt(input);
    } catch (e) {
      console.error(String(e?.message || e));
      console.error("Tip: set OPENAI_API_KEY or run 'bmo key add <key>'.");
    }
  }
}

main();
