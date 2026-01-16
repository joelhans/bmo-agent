import OpenAI from "openai";
import "dotenv/config";
import * as readline from "readline";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Session logging setup: ensure ~/.local/share/bmo (or override) exists and create a timestamped log file.
const homeDir = (os.homedir && os.homedir()) || process.env.HOME || process.env.USERPROFILE || ".";

function resolveDataDir() {
  const override = process.env.BMO_DATA_DIR;
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  // Default per request: ~/.local/share/bmo
  return path.join(homeDir, ".local", "share", "bmo");
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Lock down permissions on POSIX systems (no-op on Windows)
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(dir, 0o700);
      } catch (_) {
        // ignore chmod failures
      }
    }
    return true;
  } catch (_) {
    return false;
  }
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
  } catch (e) {
    // If logging fails, do not crash the agent
  }
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

const conversationHistory = [];

function isBmoRepo() {
  try {
    const pkgRaw = fs.readFileSync("package.json", "utf-8");
    const pkg = JSON.parse(pkgRaw);
    return pkg && typeof pkg.name === "string" && pkg.name === "bmo-agent";
  } catch (_) {
    return false;
  }
}

// Build a clear system prompt that establishes bmo's identity and behavior.
function buildSystemPrompt() {
  const parts = [];
  parts.push([
    "You are bmo — a fast, pragmatic coding agent.",
    "Your job is to take the user's input and complete tasks using the available tools.",
    "Default to action: when a task involves files, call tools to inspect or modify them rather than only suggesting steps.",
    "Tools you can call:",
    "- list_cwd(): list files/directories in the current working directory.",
    "- read_file(filename): read a file's contents.",
    "- write_file(filename, content): write or overwrite a file.",
    "Behavioral rules:",
    "- Prefer doing over suggesting. If a file must be read/edited to proceed, call the tool immediately.",
    "- Keep replies concise. Summarize actions and show results. Ask brief clarifying questions only when needed to avoid wrong changes.",
    "- Do not assume file contents or structure — discover using list_cwd/read_file.",
    "- All edits must go through write_file with the full desired content.",
    "- After writing, briefly note what changed (filename and a one-line summary).",
    "- If a task requires capabilities beyond your tools, state the limitation and propose the smallest viable next step."
  ].join("\n"));

  // Inline project notes optionally to give bmo extra context.
  try {
    const disableNotes = process.env.BMO_DISABLE_NOTES === "1";
    const notesFileEnv = (process.env.BMO_NOTES_FILE || "").trim();
    const inlineFlag = process.env.BMO_INLINE_NOTES === "1" || isBmoRepo();

    if (!disableNotes) {
      let notesPath = "";
      if (notesFileEnv) {
        // Respect explicit override
        notesPath = path.resolve(notesFileEnv);
      } else if (inlineFlag && fs.existsSync("AGENTS.md")) {
        // Backward-compatible: only auto-inline AGENTS.md when in the bmo repo
        notesPath = path.resolve("AGENTS.md");
      }

      if (notesPath && fs.existsSync(notesPath)) {
        const notes = fs.readFileSync(notesPath, "utf-8");
        parts.push(`Project notes (${path.basename(notesPath)}):\n` + notes);
      }
    }
  } catch (_) {
    // Ignore failures to read notes
  }

  return parts.join("\n\n");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.NGROKAI,
});

const tools = [
  {
    type: "function",
    function: {
      name: "list_cwd",
      description: "List all files and directories in the current working directory.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a specific file from the current working directory or a subfolder.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "The name of the file to read."
          }
        },
        required: ["filename"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file (creates or overwrites)",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "The name of the file to write",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["filename", "content"],
      },
    },
  },
];

function listFiles() {
  try {
    const files = fs.readdirSync(".");
    return JSON.stringify({ ok: true, files });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) });
  }
}

function readFile(filename) {
  try {
    const content = fs.readFileSync(filename, "utf-8");
    return JSON.stringify({ ok: true, content });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), filename });
  }
}

function writeFile(filename, content) {
  try {
    fs.writeFileSync(filename, content, "utf-8");
    return JSON.stringify({ ok: true, message: `File ${filename} written successfully` });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), filename });
  }
}

function executeTool(toolCall) {
  const { name, arguments: args } = toolCall.function;
  let parsedArgs = {};
  try {
    parsedArgs = args ? JSON.parse(args) : {};
  } catch (e) {
    return JSON.stringify({ ok: false, error: `Invalid tool arguments: ${String(e)}`, raw: String(args) });
  }

  console.log(`\x1b[33m[Tool Call: ${name}]\x1b[0m`);

  switch (name) {
    case "list_cwd":
      return listFiles();
    case "read_file":
      return readFile(parsedArgs.filename);
    case "write_file":
      return writeFile(parsedArgs.filename, parsedArgs.content);
    default:
      return JSON.stringify({ ok: false, error: "Unknown tool" });
  }
}

function getUserInput(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

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
    const stream = await client.chat.completions.create({
      model: "gpt-5",
      messages: conversationHistory,
      tools: tools,
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
        const result = executeTool(toolCall);
      
        conversationHistory.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      continue;
    }

    // Final assistant message for this user prompt; log it
    logToFile(`bmo: ${fullContent}\n`);

    break;
  }
}

async function main() {
  console.log("Chat with bmo (type 'exit' to quit)");
  
  while (true) {
    const input = await getUserInput("\n\x1b[32mYou\x1b[0m: ");
    
    if (input.toLowerCase() === "exit") {
      console.log("Goodbye!");
      logSessionEnd("ended (command)");
      rl.close();
      break;
    }

    // Log user prompt
    logToFile(`You: ${input}\n`);

    await runPrompt(input);
  }
}

main();
