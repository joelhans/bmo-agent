// code_snippet.mjs — Extract functions/classes/sections from files with line numbers
// Reduces token usage by avoiding full file reads when only specific code is needed

import { readFile } from "node:fs/promises";

export const description = "Extract specific functions, classes, or line ranges from source files with line numbers";

export const schema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Path to the source file"
    },
    pattern: {
      type: "string",
      description: "Regex pattern to match function/class name (e.g., 'function myFunc', 'class MyClass', 'export const handler')"
    },
    lineRange: {
      type: "object",
      properties: {
        start: { type: "number", description: "Start line (1-indexed)" },
        end: { type: "number", description: "End line (1-indexed, inclusive)" }
      },
      description: "Alternative to pattern: extract specific line range"
    },
    contextLines: {
      type: "number",
      default: 0,
      description: "Lines of context before the match (default: 0)"
    },
    maxLines: {
      type: "number",
      default: 100,
      description: "Maximum lines to return (default: 100)"
    }
  },
  required: ["path"]
};

export const capabilities = { filesystem: true };

export async function run(args) {
  const { path, pattern, lineRange, contextLines = 0, maxLines = 100 } = args;

  try {
    const content = await readFile(path, "utf-8");
    const lines = content.split("\n");
    
    // Mode 1: Extract by line range
    if (lineRange) {
      const { start, end } = lineRange;
      if (start < 1 || end < start || start > lines.length) {
        return { ok: false, error: `Invalid line range: ${start}-${end} (file has ${lines.length} lines)` };
      }
      const actualEnd = Math.min(end, lines.length);
      const extracted = lines.slice(start - 1, actualEnd);
      const numbered = extracted.map((line, i) => `${String(start + i).padStart(4)} | ${line}`);
      return {
        ok: true,
        result: {
          path,
          lineRange: { start, end: actualEnd },
          totalLines: lines.length,
          extractedLines: extracted.length,
          content: numbered.join("\n")
        }
      };
    }

    // Mode 2: Extract by pattern match (find function/class definition)
    if (pattern) {
      const regex = new RegExp(pattern, "i");
      let matchLine = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matchLine = i;
          break;
        }
      }
      
      if (matchLine === -1) {
        return { ok: false, error: `Pattern "${pattern}" not found in ${path}` };
      }

      // Find the end of the block (track braces)
      let braceDepth = 0;
      let started = false;
      let endLine = matchLine;
      
      for (let i = matchLine; i < lines.length && (endLine - matchLine) < maxLines; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === "{" || char === "(") {
            braceDepth++;
            started = true;
          } else if (char === "}" || char === ")") {
            braceDepth--;
          }
        }
        endLine = i;
        if (started && braceDepth === 0) break;
      }

      const startIdx = Math.max(0, matchLine - contextLines);
      const extracted = lines.slice(startIdx, endLine + 1);
      const numbered = extracted.map((line, i) => `${String(startIdx + i + 1).padStart(4)} | ${line}`);
      
      return {
        ok: true,
        result: {
          path,
          pattern,
          matchedAt: matchLine + 1,
          lineRange: { start: startIdx + 1, end: endLine + 1 },
          totalLines: lines.length,
          extractedLines: extracted.length,
          truncated: (endLine - matchLine) >= maxLines,
          content: numbered.join("\n")
        }
      };
    }

    // No pattern or lineRange - show file summary
    return {
      ok: true,
      result: {
        path,
        totalLines: lines.length,
        hint: "Provide 'pattern' to extract a function/class, or 'lineRange' to extract specific lines"
      }
    };

  } catch (err) {
    if (err.code === "ENOENT") {
      return { ok: false, error: `File not found: ${path}` };
    }
    return { ok: false, error: err.message };
  }
}
