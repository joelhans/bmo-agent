import { spawn } from "child_process";

export const schema = {
  type: "object",
  properties: {
    pattern: { type: "string", description: "Search pattern (regex by default)" },
    directory: { type: "string", description: "Directory to search (default: current dir)" },
    fileTypes: { 
      type: "array", 
      items: { type: "string" }, 
      description: "File extensions to include, e.g. ['ts', 'tsx']" 
    },
    excludeDirs: {
      type: "array",
      items: { type: "string" },
      default: ["node_modules", "build", "dist", ".git", "coverage", ".next", "__pycache__", "vendor"],
      description: "Directories to exclude (sensible defaults included)"
    },
    caseSensitive: { type: "boolean", default: false },
    maxResults: { type: "integer", default: 50, description: "Max results to return" },
    context: { type: "integer", default: 2, description: "Lines of context around matches" }
  },
  required: ["pattern"]
};

export const description = "Search code with ripgrep, automatically excluding node_modules, build dirs, etc. Smart defaults for codebases.";

export const requires = ["rg"];

export async function run({ 
  pattern, 
  directory = ".", 
  fileTypes,
  excludeDirs = ["node_modules", "build", "dist", ".git", "coverage", ".next", "__pycache__", "vendor"],
  caseSensitive = false,
  maxResults = 50,
  context = 2
}) {
  return new Promise((resolve) => {
    const args = [
      "--color=never",
      "--line-number",
      `--max-count=${maxResults}`,
      `-C${context}`
    ];
    
    if (!caseSensitive) args.push("-i");
    
    for (const dir of excludeDirs) {
      args.push(`--glob=!${dir}/**`);
    }
    
    if (fileTypes && fileTypes.length > 0) {
      for (const ext of fileTypes) {
        args.push(`--glob=*.${ext.replace(/^\./, "")}`);
      }
    }
    
    args.push(pattern, directory);
    
    const proc = spawn("rg", args, { timeout: 30000 });
    let stdout = "";
    let stderr = "";
    
    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    
    proc.on("close", (code) => {
      if (code === 0 || code === 1) {
        // code 1 = no matches (not an error)
        const lines = stdout.trim().split("\n").filter(Boolean);
        resolve({ 
          ok: true, 
          result: {
            matchCount: lines.filter(l => /^\S+:\d+:/.test(l)).length,
            output: stdout || "(no matches)",
            truncated: lines.length >= maxResults
          }
        });
      } else {
        resolve({ ok: false, error: stderr || `rg exited with code ${code}` });
      }
    });
    
    proc.on("error", (err) => {
      resolve({ ok: false, error: `Failed to spawn rg: ${err.message}` });
    });
  });
}
