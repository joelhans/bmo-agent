import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as https from "https";
import * as http from "http";

export const definition = {
  type: "function",
  function: {
    name: "write_repo_file",
    description: "Create or overwrite a file in the current repository with given content. Ensures parent directories exist. Returns the path written.",
    parameters: {},
  }
};

export async function execute(args) {
  try {\n  const { filepath, content } = args;\n  if (!filepath || typeof filepath !== 'string') {\n    return JSON.stringify({ success: false, error: 'filepath is required' });\n  }\n  const abs = path.isAbsolute(filepath) ? filepath : path.join(process.cwd(), filepath);\n  const dir = path.dirname(abs);\n  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}\n  fs.writeFileSync(abs, content || '', { encoding: 'utf8' });\n  return JSON.stringify({ success: true, result: { path: abs } });\n} catch (error) {\n  return JSON.stringify({ success: false, error: error.message });\n}
}
