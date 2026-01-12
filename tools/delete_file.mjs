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
        filename: { type: "string", description: "Path to the file to delete." }
      },
      required: ["filename"]
    },
  }
};

export async function execute(args) {
  try {
    const filePath = args.filename;
    if (!filePath || typeof filePath !== 'string') {
      return JSON.stringify({ success: false, error: "filename is required and must be a string" });
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return JSON.stringify({ success: true, message: `File ${filePath} deleted successfully.` });
    } else {
      return JSON.stringify({ success: false, error: `File ${filePath} does not exist.` });
    }
  } catch (error) {
    return JSON.stringify({ success: false, error: `Error deleting file: ${error.message}` });
  }
}
