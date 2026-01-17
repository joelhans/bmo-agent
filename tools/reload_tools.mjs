import { reloadTools } from "../index.mjs";

export const schema = {
  type: "function",
  function: {
    name: "reload_tools",
    description: "Reload all tools from bmo://tools/. Call this after creating or modifying a tool file to use it immediately.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why tools need to be reloaded."
        }
      },
      required: [],
    },
  },
};

export async function execute(args) {
  const reason = args.reason;
  try {
    const result = await reloadTools();
    return JSON.stringify({ ok: true, ...result, reason });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), reason });
  }
}
