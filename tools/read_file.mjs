import * as fs from "fs";

export const definition = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read content from a file.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "The path to the file to read."
        }
      },
      required: ["filename"],
    },
  }
};

export async function execute(args) {
  const content = fs.readFileSync(args.filename, "utf-8");
  return JSON.stringify({ content });
}
