import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as https from "https";
import * as http from "http";

export const definition = {
  type: "function",
  function: {
    name: "write_repo_file",
    description: "Create or overwrite a file in the current repository with given content. Ensures parent directories exist. Returns the absolute path written.",
    parameters: {
      type: "object",
      properties: {
        filepath: {
          type: "string",
          description: "Path to the file to write, relative to repo root or absolute."
        },
        content: {
          type: "string",
          description: "The content to write to the file."
        }
      },
      required: ["filepath", "content"],
    },
  }
};

export async function execute(args) {
  try {
    const { filepath, content } = args;

    if (!filepath || typeof filepath !== "string") {
      return JSON.stringify({ success: false, error: "filepath is required and must be a string" });
    }

    const abs = path.isAbsolute(filepath) ? filepath : path.join(process.cwd(), filepath);
    const dir = path.dirname(abs);

    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {
      // ignore mkdir errors; write may still fail and be reported below
    }

    fs.writeFileSync(abs, content ?? "", { encoding: "utf8" });

    return JSON.stringify({ success: true, result: { path: abs } });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}
