import * as fs from "fs";
import * as path from "path";
import { resolvePath, ensureDir } from "../index.mjs";

export const schema = {
  type: "function",
  function: {
    name: "write_file",
    description: "Write content to a file (creates or overwrites). Supports bmo:// prefix to write to bmo's own codebase.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "The file to write. Use 'bmo://tools/new_tool.mjs' to add tools to bmo."
        },
        content: {
          type: "string",
          description: "The content to write to the file."
        },
        reason: {
          type: "string",
          description: "Explain why this write is necessary."
        }
      },
      required: ["filename", "content"],
    },
  },
};

export async function execute(args) {
  const filename = args.filename;
  const content = args.content;
  const reason = args.reason;
  try {
    const resolved = resolvePath(filename);
    const dir = path.dirname(resolved);
    if (dir && dir !== "." && dir !== "") {
      if (!ensureDir(dir)) {
        return JSON.stringify({ ok: false, error: `Failed to create directory: ${dir}`, filename, reason });
      }
    }
    fs.writeFileSync(resolved, content, "utf-8");
    const bytes = Buffer.byteLength(content, "utf-8");
    return JSON.stringify({ ok: true, message: `File ${filename} written successfully`, filename, bytes, reason });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), filename, reason });
  }
}
