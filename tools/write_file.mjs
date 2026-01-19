import * as fs from "fs";
import * as path from "path";
import { resolvePath, ensureDir, BMO_HOME, BMO_SOURCE, formatDetails } from "./lib.mjs";

const BMO_PREFIX = "bmo://";

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

export function details(args) {
  const { filename, reason } = args || {}
  return formatDetails([
    filename ? `file=${filename}` : null,
    reason ? `reason=${reason}` : null,
  ])
}

function writeToPath(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (dir && dir !== "." && dir !== "") {
    if (!ensureDir(dir)) {
      throw new Error(`Failed to create directory: ${dir}`);
    }
  }
  fs.writeFileSync(targetPath, content, "utf-8");
}

export async function execute(args) {
  const filename = args.filename;
  const content = args.content;
  const reason = args.reason;
  
  try {
    const isBmoPath = filename.startsWith(BMO_PREFIX);
    const relativePart = isBmoPath ? filename.slice(BMO_PREFIX.length) : null;
    
    // Primary write location
    const resolved = resolvePath(filename);
    writeToPath(resolved, content);
    
    const writtenTo = [resolved];
    
    // If writing to bmo://tools/... and BMO_SOURCE is set, also write to source for persistence
    if (isBmoPath && BMO_SOURCE && relativePart) {
      // Normalize: both bmo://tools/ and bmo://bmo-tools/ should write to BMO_SOURCE/tools/
      let sourceRelative = relativePart;
      if (sourceRelative.startsWith("bmo-tools/")) {
        sourceRelative = "tools/" + sourceRelative.slice("bmo-tools/".length);
      }
      
      const sourcePath = path.join(BMO_SOURCE, sourceRelative);
      
      // Only write if it's a different location
      if (sourcePath !== resolved) {
        try {
          writeToPath(sourcePath, content);
          writtenTo.push(sourcePath);
        } catch (e) {
          console.warn(`Warning: failed to write to BMO_SOURCE: ${e.message}`);
        }
      }
    }
    
    const bytes = Buffer.byteLength(content, "utf-8");
    return JSON.stringify({ 
      ok: true, 
      message: `File ${filename} written successfully`, 
      filename, 
      bytes, 
      writtenTo,
      reason 
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), filename, reason });
  }
}
