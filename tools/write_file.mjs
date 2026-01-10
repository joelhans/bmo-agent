import * as fs from "fs";

export const definition = {
  type: "function",
  function: {
    name: "write_file",
    description: "Write content to a file (creates or overwrites).",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "The path to the file to write."
        },
        content: {
          type: "string",
          description: "The content to write to the file."
        }
      },
      required: ["filename", "content"],
    },
  }
};

export async function execute(args) {
  fs.writeFileSync(args.filename, args.content, "utf-8");
  return JSON.stringify({ success: true, message: `File ${args.filename} written successfully` });
}
