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
    parameters: {},
  }
};

export async function execute(args) {
  const filePath = args.filename;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return JSON.stringify({ success: true, message: `File ${filePath} deleted successfully.` });
    } else {
      return JSON.stringify({ success: false, message: `File ${filePath} does not exist.` });
    }
  } catch (error) {
    return JSON.stringify({ success: false, message: `Error deleting file ${filePath}: ${error.message}` });
  }
}
