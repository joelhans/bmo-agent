import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as https from "https";
import * as http from "http";

export const definition = {
  type: "function",
  function: {
    name: "delete_file",
    description: "Delete a specified file from the filesystem.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Path to the file to delete." },
        purpose: { type: "string", description: "Purpose of deletion. If 'bmo-self-improvement', allowed only in BMO home repo (.bmo-home)." }
      },
      required: ["filename"],
    },
  }
};

export async function execute(args) {
  try {
    const { filename, purpose } = args;

    if (!filename || typeof filename !== "string") {
      return JSON.stringify({ success: false, error: "filename is required and must be a string" });
    }

    if (purpose === "bmo-self-improvement" && !fs.existsSync(".bmo-home")) {
      return JSON.stringify({ success: false, error: "BMO self-improvement deletes are only allowed in the BMO home repo (.bmo-home missing)" });
    }

    const abs = path.isAbsolute(filename) ? filename : path.join(process.cwd(), filename);
    if (!fs.existsSync(abs)) {
      return JSON.stringify({ success: false, error: "File does not exist" });
    }

    fs.unlinkSync(abs);
    return JSON.stringify({ success: true, result: { deleted: true, path: abs } });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}
