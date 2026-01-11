import OpenAI from "openai";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { loadEnv } from "./lib/env.mjs";

// Load environment variables from .env
loadEnv();
import { loadTools, getTools, executeTool } from "./lib/tool-loader.mjs";
import { saveState, loadState, clearState, hasState } from "./lib/state.mjs";
import { getSystemPrompt } from "./lib/system-prompt.mjs";

// User config path for persistent settings
const CONFIG_DIR = path.join(process.env.HOME || "", ".config", "bmo");
const CONFIG_ENV = path.join(CONFIG_DIR, ".env");

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readConfigEnv() {
  try {
    if (!fs.existsSync(CONFIG_ENV)) return {};
    const content = fs.readFileSync(CONFIG_ENV, "utf-8");
    const map = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        map[key] = value;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function writeConfigEnv(map) {
  ensureConfigDir();
  const lines = [
    "# BMO configuration (.env format)",
    "# Managed by BMO CLI",
    ...Object.entries(map).map(([k, v]) => `${k}=${needsQuoting(v) ? JSON.stringify(v) : v}`)
  ];
  fs.writeFileSync(CONFIG_ENV, lines.join("\n") + "\n", { encoding: "utf-8" });
}

function needsQuoting(val) {
  return /\s|#|"|'/.test(String(val || ""));
}

function maskKey(key) {
  if (!key) return "(not set)";
  const s = String(key);
  if (s.length <= 8) return "*".repeat(Math.max(0, s.length - 2)) + s.slice(-2);
  return s.slice(0, 4) + "…" + s.slice(-4);
}

function handleApiKeyCLI(argv) {
  const action = argv[3];
  if (!action || !["set", "get", "unset"].includes(action)) {
    console.log("Usage:\n  bmo api-key set <OPENAI_API_KEY>\n  bmo api-key get\n  bmo api-key unset");
    process.exit(action ? 1 : 0);
  }

  const map = readConfigEnv();

  if (action === "set") {
    const key = argv[4];
    if (!key) {
      console.error("Error: missing <OPENAI_API_KEY>");
      process.exit(1);
    }
    map.OPENAI_API_KEY = key;
    writeConfigEnv(map);
    console.log(`Saved OPENAI_API_KEY to ${CONFIG_ENV} (${maskKey(key)})`);
    process.exit(0);
  }

  if (action === "get") {
    const current = map.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
    console.log(`OPENAI_API_KEY: ${maskKey(current)}`);
    process.exit(0);
  }

  if (action === "unset") {
    delete map.OPENAI_API_KEY;
    writeConfigEnv(map);
    console.log("Removed OPENAI_API_KEY from config");
    process.exit(0);
  }
}

// Early CLI handling for simple admin commands
if (process.argv[2] === "api-key") {
  handleApiKeyCLI(process.argv);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let conversationHistory = [];
let pendingTask = null;
let client; // Initialized in main()

function getUserInput(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function runAgentLoop() {
  let tools = getTools();
  let needsReload = false;

  while (true) {
    // Check if tools need reloading
    if (needsReload) {
      await loadTools();
      tools = getTools();
      needsReload = false;

      // Update system prompt with new tools
      conversationHistory[0] = {
        role: "system",
        content: getSystemPrompt(tools)
      };
    }

    const modelName = process.env.OPENAI_MODEL || "gpt-5";
    console.log(`Using model: ${modelName}`);

    const stream = await client.chat.completions.create({
      model: modelName,
      messages: conversationHistory,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    });

    let fullContent = "";
    let toolCalls = [];

    const fullMessage = {
      role: "assistant",
      content: "",
      tool_calls: undefined
    };

    process.stdout.write(`\x1b[31mBMO\x1b[0m: `);

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

    // Process tool calls if any
    if (fullMessage.tool_calls && fullMessage.tool_calls.length > 0) {
      for (const toolCall of fullMessage.tool_calls) {
        const toolName = toolCall.function.name;

        // Silent indicator for self-improvement tools
        if (!toolName.startsWith("_")) {
          console.log(`\x1b[33m[${toolName}]\x1b[0m`);
        }

        const result = await executeTool(toolCall);

        // Check if reload is requested
        try {
          const parsed = JSON.parse(result);
          if (parsed._action === "reload_tools") {
            needsReload = true;
          }
        } catch (e) {
          // Not JSON or no action, ignore
        }

        conversationHistory.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Save state after tool execution for recovery
      saveState({
        conversationHistory,
        timestamp: Date.now()
      });

      continue;
    }

    // No tool calls, response is complete
    break;
  }
}

async function runPrompt(prompt) {
  conversationHistory.push({
    role: "user",
    content: prompt,
  });

  await runAgentLoop();
}

async function main() {
  // Load tools dynamically
  await loadTools();
  const tools = getTools();

  // Initialize OpenAI client after any CLI handling
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });

  // Check for saved state (recovery from restart)
  if (hasState()) {
    const state = loadState();
    if (state && state.conversationHistory) {
      const timeSince = Date.now() - (state.timestamp || 0);
      // Only restore if state is less than 5 minutes old
      if (timeSince < 5 * 60 * 1000) {
        console.log("\x1b[33m[Resuming previous session...]\x1b[0m\n");
        conversationHistory = state.conversationHistory;
        clearState();

        // Continue the agent loop if there were pending tool calls
        const lastMsg = conversationHistory[conversationHistory.length - 1];
        if (lastMsg.role === "tool") {
          await runAgentLoop();
        }
      } else {
        clearState();
      }
    }
  }

  // Initialize with system prompt if starting fresh
  if (conversationHistory.length === 0) {
    conversationHistory.push({
      role: "system",
      content: getSystemPrompt(tools)
    });
  }

  console.log("BMO - Self-improving coding agent");
  console.log("Type 'exit' to quit\n");

  while (true) {
    const input = await getUserInput("\x1b[32mYou\x1b[0m: ");

    if (input.toLowerCase() === "exit") {
      console.log("Goodbye!");
      clearState();
      rl.close();
      break;
    }

    if (input.toLowerCase() === "state clear") {
      console.log("Clearing state...");
      clearState();
      console.log("State cleared successfully.");
      continue;
    }

    if (input.trim() === "") {
      continue;
    }

    await runPrompt(input);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
