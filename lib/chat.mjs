import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { buildPrompt } from './prompt.mjs';
import { resolveDefaultModel } from './config.mjs';

// Minimal BMO paths and tools loader
function getBmoHome() {
  if (process.env.BMO_HOME) return path.resolve(process.env.BMO_HOME);
  const currentFile = fileURLToPath(import.meta.url);
  // In Bun-compiled binaries, files live under /$bunfs; use the executable dir as home
  if (currentFile.startsWith('/$bunfs/')) return path.dirname(process.execPath);
  // Running from repo/source: lib/chat.mjs -> repo root is parent dir
  return path.resolve(path.dirname(currentFile), '..');
}
const BMO_HOME = getBmoHome();

function getToolsDir() {
  const bmoToolsDir = path.join(BMO_HOME, 'bmo-tools');
  if (fs.existsSync(bmoToolsDir)) return bmoToolsDir;
  const srcTools = path.join(BMO_HOME, 'tools');
  if (fs.existsSync(srcTools)) return srcTools;
  return srcTools; // default
}

let toolSchemas = [];
const toolRegistry = new Map(); // name -> { execute, details }

export async function reloadTools() {
  const toolsDir = getToolsDir();
  if (!fs.existsSync(toolsDir)) {
    toolSchemas = [];
    toolRegistry.clear();
    return { loaded: [], error: 'tools directory not found', home: BMO_HOME };
  }
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.mjs') && f !== 'lib.mjs');
  const loaded = [];
  const errors = [];
  toolSchemas = [];
  toolRegistry.clear();
  for (const file of files) {
    const toolPath = path.join(toolsDir, file);
    try {
      const moduleUrl = pathToFileURL(toolPath).href + `?update=${Date.now()}`;
      const mod = await import(moduleUrl);
      if (mod.schema && typeof mod.execute === 'function' && typeof mod.details === 'function') {
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
  return { loaded, errors: errors.length ? errors : undefined, home: BMO_HOME, toolsDir };
}

async function executeTool(toolCall) {
  const { name, arguments: args } = toolCall.function;
  let parsedArgs = {};
  try { parsedArgs = args ? JSON.parse(args) : {}; } catch (e) {
    return JSON.stringify({ ok: false, error: `Invalid tool arguments: ${String(e)}`, raw: String(args) });
  }
  const impl = toolRegistry.get(name);
  if (!impl) return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
  try { return await impl.execute(parsedArgs); } catch (e) { return JSON.stringify({ ok: false, error: String(e) }); }
}

function buildSystemPrompt() {
  return buildPrompt({ toolRegistry, getToolsDir, BMO_HOME });
}

let openaiClient = null;
function getOpenAIClient() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY. Set it before starting the TUI.");
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.NGROKAI });
  }
  return openaiClient;
}

export class ChatEngine {
  constructor({ systemPrompt, model } = {}) {
    this.history = [];
    this.systemPrompt = systemPrompt || buildSystemPrompt();
    this.model = model || resolveDefaultModel();
    if (this.systemPrompt) this.history.push({ role: 'system', content: this.systemPrompt });
  }

  static async init(opts = {}) {
    await reloadTools();
    return new ChatEngine(opts);
  }

  async startTurn(userText, callbacks = {}) {
    const { onToken, onToolCall, onToolResult, onAssistantDone, onError } = callbacks;
    this.history.push({ role: 'user', content: userText });

    while (true) {
      const client = getOpenAIClient();
      const stream = await client.chat.completions.create({
        model: this.model,
        messages: this.history,
        tools: toolSchemas,
        stream: true,
      });

      let fullContent = '';
      let toolCalls = [];
      const fullMessage = { role: 'assistant', content: '', tool_calls: undefined };

      try {
        for await (const part of stream) {
          const delta = part.choices?.[0]?.delta || {};
          if (delta.content) {
            fullContent += delta.content;
            if (onToken) onToken(delta.content);
          }
          if (delta.tool_calls) {
            for (const toolDelta of delta.tool_calls) {
              const idx = toolDelta.index;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: toolDelta.id, type: 'function', function: { name: '', arguments: '' } };
              }
              if (toolDelta.function?.name) toolCalls[idx].function.name += toolDelta.function.name;
              if (toolDelta.function?.arguments) toolCalls[idx].function.arguments += toolDelta.function.arguments;
            }
          }
        }
      } catch (e) {
        if (onError) onError(e);
        throw e;
      }

      fullMessage.content = fullContent;
      if (toolCalls.length > 0) fullMessage.tool_calls = toolCalls;
      this.history.push(fullMessage);

      if (fullMessage.tool_calls && fullMessage.tool_calls.length > 0) {
        for (const tc of fullMessage.tool_calls) {
          if (onToolCall) onToolCall(tc);
          const result = await executeTool(tc);
          if (onToolResult) onToolResult({ id: tc.id, result });
          this.history.push({ role: 'tool', tool_call_id: tc.id, content: result });
        }
        // Loop again to get assistant response after tool results
        continue;
      }

      if (onAssistantDone) onAssistantDone({ content: fullContent });
      break;
    }
  }
}
