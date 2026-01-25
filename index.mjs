import OpenAI from "openai";
import "dotenv/config";
import * as readline from "readline";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Statically import TUI module so bundlers include it (and neo-blessed) in single-file builds
// In dev/running from source, this requires neo-blessed to be installed.
import * as BundledTui from './tui/ui-blessed.mjs';

// ============================================================================
// BMO_HOME resolution
// ============================================================================
function getBmoHome() {
  if (process.env.BMO_HOME) {
    return path.resolve(process.env.BMO_HOME);
  }
  const currentFile = fileURLToPath(import.meta.url);
  if (currentFile.startsWith("/$bunfs/")) {
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
  try { fs.mkdirSync(dir, { recursive: true }); if (process.platform !== "win32") { try { fs.chmodSync(dir, 0o700); } catch (_) {} } return true; } catch (_) { return false; }
}

// ============================================================================
// Session logging and data dir
// ============================================================================
const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || ".";
function resolveDataDir() { const override = process.env.BMO_DATA_DIR; if (override && override.trim()) return path.resolve(override.trim()); return path.join(homeDir, ".local", "share", "bmo"); }
const desiredDataDir = resolveDataDir();
let dataBaseDir = desiredDataDir;
if (!ensureDir(dataBaseDir)) { const fallback = path.join(os.tmpdir(), "bmo"); if (ensureDir(fallback)) { console.warn(`Warning: failed to create ${desiredDataDir}. Falling back to ${fallback}`); dataBaseDir = fallback; } else { console.warn(`Warning: failed to create ${desiredDataDir} and ${fallback}. Falling back to current directory.`); dataBaseDir = "."; } }

const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFilePath = path.join(dataBaseDir, `agent-${sessionTimestamp}.log`);
let sessionEndLogged = false;
function logToFile(text) { try { fs.appendFileSync(logFilePath, text); } catch (_) {} }
function logSessionEnd(reason = "ended") { if (sessionEndLogged) return; sessionEndLogged = true; logToFile(`=== Agent session ${reason} at ${new Date().toISOString()} ===\n`); }
logToFile(`=== Agent session started at ${new Date().toISOString()} ===\n`);
console.log(`Session log: ${logFilePath}`);

// Track whether TUI is active to avoid corrupting the screen with console logs
let TUI_ACTIVE = false;

process.on("SIGINT", () => {
  if (TUI_ACTIVE) {
    try { ui?.dispose?.(); } catch (_) {}
    logSessionEnd("ended (SIGINT)");
    process.exit(0);
  } else {
    console.log("\nGoodbye!");
    logSessionEnd("ended (SIGINT)");
    process.exit(0);
  }
});
process.on("SIGTERM", () => { logSessionEnd("ended (SIGTERM)"); process.exit(0); });
process.on("exit", () => logSessionEnd("ended (exit)"));

// ============================================================================
// Config management
// ============================================================================
const configPath = path.join(dataBaseDir, "config.json");
function loadConfig() { try { return JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch { return { keys: {} }; } }
function saveConfig(cfg) { try { ensureDir(path.dirname(configPath)); fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2)); if (process.platform !== "win32") { try { fs.chmodSync(configPath, 0o600); } catch (_) {} } return true; } catch (e) { console.error("Failed to save config:", e.message); return false; } }
function maskKey(k) { if (!k || typeof k !== "string") return "(empty)"; return `${k.slice(0,4)}…${k.slice(-4)}`; }
const PROVIDER_ENV_MAP = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", openrouter: "OPENROUTER_API_KEY", xai: "XAI_API_KEY", google: "GOOGLE_API_KEY", groq: "GROQ_API_KEY", deepseek: "DEEPSEEK_API_KEY" };
(function hydrateEnvFromConfig() { const cfg = loadConfig(); if (!process.env.OPENAI_API_KEY && cfg?.keys?.openai) process.env.OPENAI_API_KEY = cfg.keys.openai; })();

// ============================================================================
// UI Bus and Console UI Adapter
// ============================================================================
const UIBus = { _listeners: new Map(), on(t, f){const s=this._listeners.get(t)||new Set();s.add(f);this._listeners.set(t,s);}, off(t,f){const s=this._listeners.get(t); if(s) s.delete(f);}, emit(t,p){const s=this._listeners.get(t); if(!s) return; for(const f of Array.from(s)){ try{ f(p);}catch(_){}}} };
let rl = null;
function ensureReadline() { if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout }); return rl; }
function createConsoleUI(bus) {
  bus.on('chat:assistant_start', () => { process.stdout.write(`\x1b[31mbmo\x1b[0m: `); });
  bus.on('chat:assistant_delta', (chunk) => { if (typeof chunk === 'string') process.stdout.write(chunk); });
  bus.on('chat:assistant_done', () => { process.stdout.write("\n"); });
  bus.on('sys:status', (text) => { if (text) console.log(`[status] ${text}`); });
  bus.on('sys:error', (text) => { if (text) console.error(`[error] ${text}`); });
  return { async promptInput(promptText) { const rlInst = ensureReadline(); return new Promise((resolve) => rlInst.question(promptText, resolve)); }, dispose() { try { if (rl) rl.close(); } catch (_) {} } };
}
let ui = null;

async function tryInitTui(bus) {
  const isTTY = process.stdout.isTTY && process.stdin.isTTY;
  const force = process.env.BMO_TUI_FORCE === '1';
  const flag = (process.env.BMO_TUI === '1') || process.argv.includes('--tui');
  if (!(flag && (isTTY || force))) return null;
  try {
    if (typeof BundledTui?.createTuiUI === 'function') {
      const tui = await BundledTui.createTuiUI(bus, {});
      UIBus.emit('sys:status', 'TUI enabled (bundled)');
      return tui;
    }
  } catch (e1) {
    // Continue to disk fallback
  }
  try {
    const tuiPath = path.join(BMO_HOME, 'tui', 'ui-blessed.mjs');
    if (!fs.existsSync(tuiPath)) { console.warn('TUI module not found; falling back to console UI'); return null; }
    const modUrl = pathToFileURL(tuiPath).href + `?t=${Date.now()}`;
    const mod = await import(modUrl);
    if (typeof mod.createTuiUI !== 'function') { console.warn('TUI module missing createTuiUI; falling back to console UI'); return null; }
    const tui = await mod.createTuiUI(bus, {});
    UIBus.emit('sys:status', `TUI enabled (disk: ${tuiPath})`);
    return tui;
  } catch (e2) {
    console.warn('TUI init failed:', e2?.message || String(e2));
    return null;
  }
}

// ============================================================================
// Dynamic tool loader
// ============================================================================
let toolSchemas = [];
const toolRegistry = new Map();
function getToolsDir() { const bmoToolsDir = path.join(BMO_HOME, "bmo-tools"); if (fs.existsSync(bmoToolsDir)) return bmoToolsDir; return path.join(BMO_HOME, "tools"); }
export async function reloadTools() {
  const toolsDir = getToolsDir();
  if (!fs.existsSync(toolsDir)) { const res = { loaded: [], error: "tools directory not found" }; UIBus.emit('sys:reload_tools', res); return res; }
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith(".mjs") && f !== "lib.mjs");
  const loaded = []; const errors = [];
  toolSchemas = []; toolRegistry.clear();
  for (const file of files) {
    const toolPath = path.join(toolsDir, file);
    try {
      const moduleUrl = pathToFileURL(toolPath).href + `?update=${Date.now()}`;
      const mod = await import(moduleUrl);
      if (mod.schema && typeof mod.execute === "function" && typeof mod.details === "function") {
        toolSchemas.push(mod.schema);
        toolRegistry.set(mod.schema.function.name, { execute: mod.execute, details: mod.details });
        loaded.push(mod.schema.function.name);
      } else { errors.push(`${file}: missing schema, execute, or details()`); }
    } catch (e) { errors.push(`${file}: ${e.message}`); }
  }
  if (!TUI_ACTIVE) {
    console.log(`\x1b[36m[Tools loaded: ${loaded.join(", ")}]\x1b[0m`);
  }
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
  try { parsedArgs = args ? JSON.parse(args) : {}; } catch (e) { return JSON.stringify({ ok: false, error: `Invalid tool arguments: ${String(e)}`, raw: String(args) }); }
  const impl = toolRegistry.get(name);
  if (!impl) return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
  let detailsText = '';
  try { detailsText = String(impl.details(parsedArgs) || ''); } catch (e) { detailsText = `details() error: ${String(e)}`; }
  if (!TUI_ACTIVE) {
    console.log(`\x1b[33m[Tool Call: ${name}]\x1b[0m ${detailsText}`);
  }
  logToFile(`[${new Date().toISOString()}] Tool call ${name} ${detailsText}\n`);
  UIBus.emit('tool:call_started', { name, details: detailsText });
  try { const out = await impl.execute(parsedArgs); UIBus.emit('tool:call_result', { name, ok: true }); return out; }
  catch (e) { UIBus.emit('tool:call_result', { name, ok: false, error: String(e) }); return JSON.stringify({ ok: false, error: String(e) }); }
}

// ============================================================================
// System prompt, model, client
// ============================================================================
function buildSystemPrompt() {
  const toolNames = Array.from(toolRegistry.keys()).join(", ");
  const parts = [];
  parts.push(`You are bmo — a fast, pragmatic, and self-improving coding agent. ...`);
  try {
    const disableNotes = process.env.BMO_DISABLE_NOTES === "1";
    const notesFileEnv = (process.env.BMO_NOTES_FILE || "").trim();
    if (!disableNotes) {
      let notesPath = "";
      if (notesFileEnv) { notesPath = path.resolve(notesFileEnv); }
      else if (fs.existsSync("AGENTS.md")) { notesPath = path.resolve("AGENTS.md"); }
      else { const toolsDir = getToolsDir(); const bundled = path.join(toolsDir, "BMO_AGENTS.md"); if (fs.existsSync(bundled)) { notesPath = bundled; } }
      if (notesPath && fs.existsSync(notesPath)) { const notes = fs.readFileSync(notesPath, "utf-8"); parts.push(`Project notes (${path.basename(notesPath)}):\n` + notes); }
    }
  } catch (_) {}
  return parts.join("\n\n");
}
function getModel() { return process.env.BMO_MODEL || 'gpt-5'; }
let openaiClient = null;
function getOpenAIClient() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) { const cfg = loadConfig(); if (cfg?.keys?.openai) process.env.OPENAI_API_KEY = cfg.keys.openai; }
    if (!process.env.OPENAI_API_KEY) { throw new Error("Missing OPENAI_API_KEY. Run 'bmo key add <key>' or set OPENAI_API_KEY in your environment."); }
    const baseURL = (process.env.OPENAI_BASE_URL || process.env.NGROKAI || '').trim();
    const opts = { apiKey: process.env.OPENAI_API_KEY };
    if (baseURL) Object.assign(opts, { baseURL });
    openaiClient = new OpenAI(opts);
    UIBus.emit('sys:status', `OpenAI base=${baseURL || 'default'}`);
  }
  return openaiClient;
}

const conversationHistory = [];
let systemPromptInitialized = false;
function ensureSystemPrompt() { if (systemPromptInitialized) return; conversationHistory.push({ role: "system", content: buildSystemPrompt() }); systemPromptInitialized = true; }

// ============================================================================
// Chat loop
// ============================================================================
async function runPrompt(prompt) {
  ensureSystemPrompt();
  conversationHistory.push({ role: "user", content: prompt });

  while (true) {
    UIBus.emit('chat:assistant_start');
    UIBus.emit('sys:status', `Connecting to ${getModel()}…`);

    let firstToken = false;
    const firstTokenTimer = setTimeout(() => { if (!firstToken) UIBus.emit('sys:status', 'Still connecting… check API key/network'); }, 7000);

    let fullContent = "";
    let toolCalls = [];
    const fullMessage = { role: "assistant", content: "", tool_calls: undefined };

    try {
      const client = getOpenAIClient();
      const stream = await client.chat.completions.create({ model: getModel(), messages: conversationHistory, tools: toolSchemas, stream: true });
      for await (const part of stream) {
        const delta = part.choices[0]?.delta || {};
        if (delta.content) { if (!firstToken) { firstToken = true; UIBus.emit('sys:status', 'Streaming…'); } fullContent += delta.content; UIBus.emit('chat:assistant_delta', delta.content); }
        if (delta.tool_calls) {
          for (const toolDelta of delta.tool_calls) {
            const idx = toolDelta.index;
            if (!toolCalls[idx]) toolCalls[idx] = { id: toolDelta.id, type: "function", function: { name: "", arguments: "" } };
            if (toolDelta.function?.name) toolCalls[idx].function.name += toolDelta.function.name;
            if (toolDelta.function?.arguments) toolCalls[idx].function.arguments += toolDelta.function.arguments;
          }
        }
      }
      clearTimeout(firstTokenTimer);
      UIBus.emit('chat:assistant_done');
      fullMessage.content = fullContent; if (toolCalls.length > 0) fullMessage.tool_calls = toolCalls; conversationHistory.push(fullMessage);
      if (fullMessage.tool_calls && fullMessage.tool_calls.length > 0) {
        for (const toolCall of fullMessage.tool_calls) { const result = await executeTool(toolCall); conversationHistory.push({ role: "tool", tool_call_id: toolCall.id, content: result }); }
        continue;
      }
      UIBus.emit('sys:status', 'Idle'); logToFile(`bmo: ${fullContent}\n`); break;
    } catch (e) {
      clearTimeout(firstTokenTimer);
      const msg = String(e?.message || e);
      UIBus.emit('chat:assistant_delta', `Error: ${msg}`);
      UIBus.emit('chat:assistant_done');
      UIBus.emit('sys:error', msg);
      logToFile(`bmo ERROR: ${msg}\n`);
      break;
    }
  }
}

// ============================================================================
// CLI: key management
// ============================================================================
function printKeyUsage() { console.log("Usage:\n  bmo key add <key>                 # Adds default 'openai' key\n  bmo key add <provider> <key>      # Adds key for a specific provider (openai, anthropic, openrouter, xai, google, groq, deepseek)"); }
function handleKeyCommand(args) {
  const sub = (args[0] || '').toLowerCase(); if (sub !== 'add') { printKeyUsage(); process.exitCode = 1; return; }
  let provider = 'openai'; let key = '';
  if (args.length >= 3) { provider = args[1].toLowerCase(); key = args[2]; }
  else if (args.length >= 2) { const maybeProvider = (args[1] || '').toLowerCase(); if (PROVIDER_ENV_MAP[maybeProvider]) { provider = maybeProvider; key = args[2] || ''; } else { key = args[1]; } }
  if (!key) { printKeyUsage(); console.error("\nError: missing key value."); process.exitCode = 1; return; }
  const cfg = loadConfig(); cfg.keys = cfg.keys || {}; cfg.keys[provider] = key; const ok = saveConfig(cfg);
  const envName = PROVIDER_ENV_MAP[provider]; if (envName) process.env[envName] = key;
  if (ok) { console.log(`Saved API key for '${provider}': ${maskKey(key)}\nConfig: ${configPath}`); if (provider === 'openai') console.log("OPENAI_API_KEY is now set for this session."); } else { process.exitCode = 1; }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'key') { handleKeyCommand(argv.slice(1)); return; }
  await reloadTools();
  try { const libPath = path.join(getToolsDir(), "lib.mjs"); const libUrl = pathToFileURL(libPath).href + `?t=${Date.now()}`; const lib = await import(libUrl); lib.registerReloadCallback(reloadTools); if (!process.env.BMO_SOURCE && lib.BMO_SOURCE) process.env.BMO_SOURCE = lib.BMO_SOURCE; console.log(`Runtime: home=${BMO_HOME} source=${process.env.BMO_SOURCE || "(none)"}`); } catch (e) { console.warn("Warning: could not register reload callback:", e.message); console.log(`Runtime: home=${BMO_HOME} source=${process.env.BMO_SOURCE || "(none)"}`); }
  const tuiCandidate = await tryInitTui(UIBus);
  if (tuiCandidate) { ui = tuiCandidate; TUI_ACTIVE = true; }
  else { ui = createConsoleUI(UIBus); TUI_ACTIVE = false; }
  if (!TUI_ACTIVE) {
    console.log("Chat with bmo (type 'exit' to quit)\nHint: set BMO_TUI=1 or pass --tui to enable the TUI\nTip: set BMO_MODEL to override model (default gpt-5)");
  }
  while (true) {
    const input = await ui.promptInput("You: ");
    const text = (input ?? '').trim();
    if (text.toLowerCase() === "exit") { if (!TUI_ACTIVE) console.log("Goodbye!"); logSessionEnd("ended (command)"); ui.dispose(); break; }
    if (!text) { continue; }
    UIBus.emit('chat:user_input', text);
    logToFile(`You: ${text}\n`);
    await runPrompt(text);
  }
}

main();
