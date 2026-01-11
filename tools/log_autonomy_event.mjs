import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as https from "https";
import * as http from "http";

export const definition = {
  type: "function",
  function: {
    name: "log_autonomy_event",
    description: "Append an autonomy log entry to AUTONOMY_LOG.md documenting self-improvement or repo changes. Creates file if absent.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "Short action label (e.g., add_guidelines)" },
        reason: { type: "string", description: "Why the change was made" },
        prompt_summary: { type: "string", description: "Sterilized summary of the prompt/request that triggered the change" },
        implementation_summary: { type: "string", description: "Concise description of what was implemented" },
        meta: { type: "object", description: "Optional metadata map" }
      },
      required: ["action", "reason", "prompt_summary", "implementation_summary"]
    },
  }
};

export async function execute(args) {
  try {
    const { action, reason, prompt_summary, implementation_summary, meta } = args;
    const file = path.join(process.cwd(), "AUTONOMY_LOG.md");
    const ts = new Date().toISOString().slice(0, 10);
    const lines = [
      `## ${ts} – ${action}`,
      `- Why: ${reason}`,
      `- Prompt summary: ${prompt_summary}`,
      `- Implementation: ${implementation_summary}`,
      meta ? `- Meta: ${JSON.stringify(meta)}` : "",
      "\n"
    ].filter(Boolean).join("\n");
    if (!fs.existsSync(file)) {
      const header = "# Autonomy Log\n\nThis log records autonomous improvements and changes made by BMO.\nEach entry includes why, a sterilized prompt summary, and a concise implementation description.\n\n";
      fs.writeFileSync(file, header + lines, { encoding: "utf8" });
    } else {
      fs.appendFileSync(file, lines, { encoding: "utf8" });
    }
    return JSON.stringify({ success: true, result: { file } });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}
