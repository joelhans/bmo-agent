import * as fs from "fs";
import * as path from "path";
import { resolvePath, ensureDir, BMO_SOURCE, formatDetails } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "move_file",
    description: "Move or rename a file. Supports bmo:// prefix and mirrors to BMO_SOURCE when applicable.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source path of the file to move (supports bmo://)." },
        to: { type: "string", description: "Destination path (supports bmo://)." },
        reason: { type: "string", description: "Why this move is needed." }
      },
      required: ["from", "to"],
    },
  },
};

export function details(args) {
  const { from, to, reason } = args || {}
  return formatDetails([
    from ? `from=${from}` : null,
    to ? `to=${to}` : null,
    reason ? `reason=${reason}` : null,
  ])
}

function normalizeSourceRelative(relativePart) {
  // Normalize bmo-tools/ -> tools/ for source mirroring
  if (relativePart.startsWith("bmo-tools/")) return "tools/" + relativePart.slice("bmo-tools/".length);
  return relativePart;
}

export async function execute(args) {
  const from = args.from;
  const to = args.to;
  const reason = args.reason;

  try {
    const fromResolved = resolvePath(from);
    const toResolved = resolvePath(to);

    // Ensure destination directory exists
    const destDir = path.dirname(toResolved);
    if (destDir && destDir !== "." && destDir !== "") {
      if (!ensureDir(destDir)) throw new Error(`Failed to create destination directory: ${destDir}`);
    }

    fs.renameSync(fromResolved, toResolved);

    const moved = [{ from: fromResolved, to: toResolved }];

    // Mirror to BMO_SOURCE if using bmo:// paths
    const isBmoFrom = from.startsWith("bmo://");
    const isBmoTo = to.startsWith("bmo://");

    if (BMO_SOURCE && (isBmoFrom || isBmoTo)) {
      try {
        const fromRelRaw = isBmoFrom ? from.slice("bmo://".length) : null;
        const toRelRaw = isBmoTo ? to.slice("bmo://".length) : null;

        const fromRel = fromRelRaw ? normalizeSourceRelative(fromRelRaw) : null;
        const toRel = toRelRaw ? normalizeSourceRelative(toRelRaw) : null;

        if (fromRel && toRel) {
          const fromSource = path.join(BMO_SOURCE, fromRel);
          const toSource = path.join(BMO_SOURCE, toRel);
          const srcDestDir = path.dirname(toSource);
          if (srcDestDir && srcDestDir !== "." && srcDestDir !== "") ensureDir(srcDestDir);
          try {
            fs.renameSync(fromSource, toSource);
            moved.push({ from: fromSource, to: toSource });
          } catch (e) {
            // If the source mirror doesn't exist, ignore but report
            moved.push({ from: fromSource, to: toSource, warning: `Mirror move failed: ${e.message}` });
          }
        }
      } catch (e) {
        // Non-fatal for mirroring
      }
    }

    return JSON.stringify({ ok: true, message: `Moved`, moved, reason });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), from, to, reason });
  }
}
