import * as fs from "fs";
import * as path from "path";
import { BMO_HOME, BMO_SOURCE, ensureDir, formatDetails } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "core_file",
    description: "Read or write core bmo files (e.g., index.mjs) in the source repo when available, with optional mirroring to the active BMO_HOME. Useful for experimenting with core self-improvements.",
    parameters: {
      type: "object",
      properties: {
        op: {
          type: "string",
          description: "Operation to perform: read or write",
          enum: ["read", "write"]
        },
        path: {
          type: "string",
          description: "Path relative to the core repo root (e.g., 'index.mjs' or 'tools/lib.mjs')."
        },
        content: {
          type: "string",
          description: "Content to write (required for op=write)",
        },
        mirror_to_home: {
          type: "boolean",
          description: "Also write to BMO_HOME/path to keep the active installation in sync (best-effort)",
          default: true
        },
        reason: {
          type: "string",
          description: "Why this core edit/read is needed now"
        }
      },
      required: ["op", "path"],
    },
  },
};

export function details(args) {
  const { op, path: rel, reason } = args || {};
  return formatDetails([
    op ? `op=${op}` : null,
    rel ? `path=${rel}` : null,
    reason ? `reason=${reason}` : null,
  ]);
}

function resolveTargets(relPath) {
  if (!relPath || relPath.includes("..")) {
    throw new Error("Invalid relative path");
  }
  const sourcePath = BMO_SOURCE ? path.join(BMO_SOURCE, relPath) : null;
  const homePath = path.join(BMO_HOME, relPath);
  return { sourcePath, homePath };
}

export async function execute(args) {
  const { op, path: rel, content, mirror_to_home = true } = args || {};
  try {
    const { sourcePath, homePath } = resolveTargets(rel);

    if (op === "read") {
      // Prefer source when available and exists; else fall back to home
      const candidates = [sourcePath, homePath].filter(Boolean);
      for (const p of candidates) {
        try {
          if (p && fs.existsSync(p)) {
            const text = fs.readFileSync(p, "utf-8");
            return JSON.stringify({ ok: true, path: rel, from: p, bytes: Buffer.byteLength(text), content: text, BMO_SOURCE, BMO_HOME });
          }
        } catch (_) {}
      }
      return JSON.stringify({ ok: false, error: `File not found in source or home: ${rel}`, path: rel, BMO_SOURCE, BMO_HOME });
    }

    if (op === "write") {
      if (typeof content !== "string") {
        return JSON.stringify({ ok: false, error: "content must be a string for write", path: rel });
      }
      const writtenTo = [];

      // Write to source first for persistence when available
      if (sourcePath) {
        try {
          ensureDir(path.dirname(sourcePath));
          fs.writeFileSync(sourcePath, content, "utf-8");
          writtenTo.push(sourcePath);
        } catch (e) {
          return JSON.stringify({ ok: false, error: `Failed writing to BMO_SOURCE: ${e.message}`, path: rel, BMO_SOURCE, BMO_HOME });
        }
      }

      // Optionally mirror to BMO_HOME (best-effort)
      if (mirror_to_home !== false && homePath) {
        try {
          ensureDir(path.dirname(homePath));
          fs.writeFileSync(homePath, content, "utf-8");
          writtenTo.push(homePath);
        } catch (e) {
          // Don't fail entirely if home write fails; report warning
          return JSON.stringify({ ok: !!sourcePath, warning: `Failed writing to BMO_HOME: ${e.message}` , path: rel, writtenTo, BMO_SOURCE, BMO_HOME });
        }
      }

      return JSON.stringify({ ok: true, message: `Core file ${rel} written`, path: rel, bytes: Buffer.byteLength(content), writtenTo, BMO_SOURCE, BMO_HOME });
    }

    return JSON.stringify({ ok: false, error: `Unknown op: ${op}` });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) });
  }
}
