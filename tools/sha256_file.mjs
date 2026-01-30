import * as fs from "fs";
import { createHash } from "crypto";
import { resolvePath, formatDetails } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "sha256_file",
    description: "Return the SHA-256 hash (hex) of a file path. Cross-platform, no external CLI.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Path to the file (supports bmo:// prefix)." },
        reason: { type: "string", description: "Why this hash is being computed right now." },
      },
      required: ["filename"],
    },
  },
};

export function details(args) {
  const { filename, reason } = args || {};
  return formatDetails([
    filename ? `file=${filename}` : null,
    reason ? `reason=${reason}` : null,
  ]);
}

async function sha256OfFile(absPath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    let bytes = 0;
    const stream = fs.createReadStream(absPath);
    stream.on("error", (e) => reject(e));
    stream.on("data", (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    stream.on("end", () => {
      try {
        const digest = hash.digest("hex");
        resolve({ sha256: digest, bytes });
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function execute(args) {
  try {
    const { filename } = args || {};
    if (!filename || typeof filename !== "string") {
      return JSON.stringify({ ok: false, error: "filename is required" });
    }
    const abs = resolvePath(filename);
    // Validate file exists and is a file
    const stat = fs.statSync(abs);
    if (!stat.isFile()) {
      return JSON.stringify({ ok: false, error: "Path is not a file", path: abs });
    }
    const { sha256, bytes } = await sha256OfFile(abs);
    return JSON.stringify({ ok: true, algo: "sha256", sha256, bytes, path: abs });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) });
  }
}
