import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export const description = 
  "Write content to a file. Creates parent directories if needed. " +
  "Bypasses shell escaping — use instead of heredocs. Returns bytes written or error.";

export const schema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "File path to write to. Can be absolute or relative to cwd.",
    },
    content: {
      type: "string",
      description: "Content to write to the file (UTF-8).",
    },
    append: {
      type: "boolean",
      description: "If true, append instead of overwriting. Default: false.",
    },
  },
  required: ["path", "content"],
};

export const capabilities = { filesystem: true };

// Protected paths we refuse to write to
const DANGEROUS_PATHS = [
  /^\/dev\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/etc\/passwd$/,
  /^\/etc\/shadow$/,
  /^\/etc\/sudoers/,
];

export async function run(args) {
  const { path, content, append = false } = args;

  if (!path || typeof path !== "string") {
    return { ok: false, error: "path is required and must be a string" };
  }
  if (content === undefined || content === null) {
    return { ok: false, error: "content is required" };
  }

  // Resolve path relative to cwd
  const resolvedPath = isAbsolute(path) ? path : resolve(process.cwd(), path);

  // Safety check
  for (const pattern of DANGEROUS_PATHS) {
    if (pattern.test(resolvedPath)) {
      return { ok: false, error: `Blocked: Refuses to write to protected path ${resolvedPath}` };
    }
  }

  try {
    // Create parent directories if needed
    const dir = dirname(resolvedPath);
    await mkdir(dir, { recursive: true });

    // Write the file
    const contentStr = String(content);
    if (append) {
      await appendFile(resolvedPath, contentStr, "utf-8");
    } else {
      await writeFile(resolvedPath, contentStr, "utf-8");
    }

    const bytes = Buffer.byteLength(contentStr, "utf-8");
    const action = append ? "Appended" : "Wrote";
    return { ok: true, result: `${action} ${bytes} bytes to ${resolvedPath}` };
  } catch (err) {
    return { ok: false, error: `Failed to write file: ${err.message}` };
  }
}
