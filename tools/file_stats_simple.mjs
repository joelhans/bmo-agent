import fs from "fs/promises";
import path from "path";
import { formatDetails } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "file_stats_simple",
    description: "Read a file and return character (Unicode code point) count, byte length, and line count. Does not depend on internal bmo libs.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Path to the file (relative or absolute)." },
        encoding: { type: "string", description: "Encoding for reading text (default utf8)." }
      },
      required: ["filename"],
    },
  },
};

export function details(args) {
  const { filename, encoding, reason } = args || {}
  return formatDetails([
    filename ? `file=${filename}` : null,
    encoding ? `encoding=${encoding}` : null,
    reason ? `reason=${reason}` : null,
  ])
}

export async function execute(args) {
  try {
    const filename = args?.filename;
    const encoding = args?.encoding || "utf8";
    const resolved = path.resolve(filename);
    const buf = await fs.readFile(resolved);
    const content = buf.toString(encoding);
    const charCount = Array.from(content).length;
    const byteLength = buf.length;
    const lineCount = content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length;
    return JSON.stringify({ ok: true, filename, resolvedPath: resolved, charCount, byteLength, lineCount });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e?.message || e) });
  }
}
