import * as fs from "fs";
import { resolvePath, formatDetails } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "list_files",
    description: "List all files and directories in a path. Supports bmo:// prefix to list bmo's own codebase.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to list. Use '.' for cwd, or 'bmo://tools/' for bmo's tools directory."
        },
        reason: { type: "string", description: "Why a listing is needed right now." }
      },
      required: [],
    },
  },
};

export function details(args) {
  const { path: p, reason } = args || {}
  const targetPath = p || '.'
  return formatDetails([
    targetPath ? `path=${targetPath}` : null,
    reason ? `reason=${reason}` : null,
  ])
}

export async function execute(args) {
  const targetPath = args.path || ".";
  const reason = args.reason;
  try {
    const resolved = resolvePath(targetPath);
    const files = fs.readdirSync(resolved);
    return JSON.stringify({ ok: true, path: targetPath, files, reason });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), path: targetPath, reason });
  }
}
