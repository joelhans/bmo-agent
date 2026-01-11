import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as https from "https";
import * as http from "http";

export const definition = {
  type: "function",
  function: {
    name: "run_command",
    description: "Executes a shell command and returns its output and status.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute"
        }
      },
      required: ["command"]
    },
  }
};

export async function execute(args) {
  try {
    const { command } = args;
    const output = cp.execSync(command, { encoding: 'utf8' });
    return JSON.stringify({ success: true, output });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}
