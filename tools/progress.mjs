import { formatDetails } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "progress",
    description: "Emit a concise progress/status message to the user as early feedback. No-ops except for logging.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Short status text to display (e.g., 'Planning', 'Reading files', 'Running checks')." },
        stage: { type: "string", description: "Optional stage label or step count (e.g., '1/3', 'plan', 'verify')." },
        reason: { type: "string", description: "Why this progress update is being emitted right now." },
      },
      required: ["message"],
    },
  },
};

export function details(args) {
  const { message, stage, reason } = args || {};
  return formatDetails([
    message ? `msg=${message}` : null,
    stage ? `stage=${stage}` : null,
    reason ? `reason=${reason}` : null,
  ]);
}

export async function execute(args) {
  try {
    // No side effects beyond the core prelude logging via details().
    // Return a structured record in case callers want to branch on it.
    return JSON.stringify({ ok: true, progress: { message: args?.message || "", stage: args?.stage || null } });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) });
  }
}
