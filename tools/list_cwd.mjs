import * as fs from "fs";

export const definition = {
  type: "function",
  function: {
    name: "list_cwd",
    description: "List all files and directories in the current working directory or a specified path.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional path to list. Defaults to current directory."
        }
      },
      required: [],
    },
  }
};

export async function execute(args) {
  const targetPath = args.path || ".";
  const files = fs.readdirSync(targetPath);
  return JSON.stringify({ path: targetPath, files });
}
