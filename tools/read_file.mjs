import * as fs from "fs";
import { resolvePath } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read a file's contents. Supports bmo:// prefix to read bmo's own files.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "The file to read. Use 'bmo://tools/example.mjs' for bmo's files."
        },
        reason: {
          type: "string",
          description: "Explain why this file needs to be read."
        }
      },
      required: ["filename"],
    },
  },
};

export async function execute(args) {
  const filename = args.filename;
  const reason = args.reason;
  try {
    const resolved = resolvePath(filename);
    const content = fs.readFileSync(resolved, "utf-8");
    return JSON.stringify({ ok: true, content, filename, reason });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), filename, reason });
  }
}
