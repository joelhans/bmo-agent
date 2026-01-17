import { resolvePath } from "./lib.mjs";
import fs from "fs/promises";

export const schema = {
  type: "function",
  function: {
    name: "file_stats",
    description: "Get statistics about a file, including character count (Unicode code points), byte length, and line count.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Path to the file to analyze. Supports bmo:// prefix.",
        },
        encoding: {
          type: "string",
          description: "Text encoding to use when reading the file (default: utf8).",
        },
      },
      required: ["filename"],
    },
  },
};

export async function execute(args) {
  try {
    const filename = args?.filename;
    const encoding = args?.encoding || "utf8";
    const resolved = resolvePath(filename);

    const buf = await fs.readFile(resolved);
    const content = buf.toString(encoding);
    const charCount = Array.from(content).length; // Unicode code points
    const byteLength = buf.length;
    const lineCount = content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length;

    return JSON.stringify({ ok: true, filename, resolvedPath: resolved, charCount, byteLength, lineCount });
  } catch (err) {
    return JSON.stringify({ ok: false, error: String(err?.message || err) });
  }
}
