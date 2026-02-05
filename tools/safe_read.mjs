import { readFile, stat, readdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { glob } from 'fs/promises';

export const description = "Safely read files with existence checks, clear errors, and optional glob/recent-file support";

export const schema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "File path to read, or glob pattern (e.g., 'src/**/*.ts')"
    },
    glob: {
      type: "boolean",
      default: false,
      description: "If true, treat path as a glob pattern and return matching file paths"
    },
    recentInDir: {
      type: "string",
      description: "Directory to find the most recently modified file in (ignores 'path' if set)"
    },
    maxLines: {
      type: "number",
      default: 500,
      description: "Maximum lines to return (truncates with notice if exceeded)"
    },
    encoding: {
      type: "string",
      default: "utf-8",
      description: "File encoding"
    }
  },
  required: []
};

export async function run(args) {
  const { path, glob: useGlob, recentInDir, maxLines = 500, encoding = 'utf-8' } = args;

  try {
    // Mode 1: Find most recent file in directory
    if (recentInDir) {
      const entries = await readdir(recentInDir, { withFileTypes: true });
      const files = entries.filter(e => e.isFile());
      
      if (files.length === 0) {
        return { ok: false, error: `No files found in directory: ${recentInDir}` };
      }

      let mostRecent = null;
      let mostRecentTime = 0;

      for (const file of files) {
        const filePath = join(recentInDir, file.name);
        const stats = await stat(filePath);
        if (stats.mtimeMs > mostRecentTime) {
          mostRecentTime = stats.mtimeMs;
          mostRecent = filePath;
        }
      }

      // Read the most recent file
      const content = await readFile(mostRecent, encoding);
      const lines = content.split('\n');
      const truncated = lines.length > maxLines;
      
      return {
        ok: true,
        result: {
          path: mostRecent,
          modifiedAt: new Date(mostRecentTime).toISOString(),
          lines: lines.length,
          truncated,
          content: truncated ? lines.slice(0, maxLines).join('\n') + `\n... [truncated, ${lines.length - maxLines} more lines]` : content
        }
      };
    }

    // Mode 2: Glob pattern matching
    if (useGlob && path) {
      // Simple glob implementation using readdir recursive
      const matches = [];
      const baseDir = path.split('*')[0].replace(/\/$/, '') || '.';
      
      async function walkDir(dir, pattern) {
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              // Skip node_modules and .git
              if (entry.name !== 'node_modules' && entry.name !== '.git') {
                await walkDir(fullPath, pattern);
              }
            } else if (entry.isFile()) {
              // Simple pattern matching (supports *.ext)
              if (pattern.includes('*')) {
                const ext = pattern.split('*').pop();
                if (fullPath.endsWith(ext)) {
                  matches.push(fullPath);
                }
              } else if (fullPath.includes(pattern)) {
                matches.push(fullPath);
              }
            }
          }
        } catch (e) {
          // Skip directories we can't read
        }
      }

      await walkDir(baseDir, path);
      return {
        ok: true,
        result: {
          pattern: path,
          matches: matches.slice(0, 100),
          totalMatches: matches.length,
          truncated: matches.length > 100
        }
      };
    }

    // Mode 3: Read single file
    if (!path) {
      return { ok: false, error: "Must provide 'path', 'glob' with pattern, or 'recentInDir'" };
    }

    // Check if file exists
    try {
      const stats = await stat(path);
      if (!stats.isFile()) {
        return { ok: false, error: `Path exists but is not a file: ${path}` };
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        // Try to help: list files in parent directory
        const dir = dirname(path);
        const target = basename(path);
        try {
          const entries = await readdir(dir);
          const similar = entries.filter(e => 
            e.toLowerCase().includes(target.toLowerCase().slice(0, 3))
          ).slice(0, 5);
          
          return {
            ok: false,
            error: `File not found: ${path}`,
            suggestion: similar.length > 0 
              ? `Did you mean one of these in ${dir}/? ${similar.join(', ')}`
              : `Directory ${dir}/ exists but doesn't contain a file matching '${target}'`
          };
        } catch {
          return { ok: false, error: `File not found: ${path} (parent directory also doesn't exist)` };
        }
      }
      throw e;
    }

    // Read the file
    const content = await readFile(path, encoding);
    const lines = content.split('\n');
    const truncated = lines.length > maxLines;

    return {
      ok: true,
      result: {
        path,
        lines: lines.length,
        truncated,
        content: truncated ? lines.slice(0, maxLines).join('\n') + `\n... [truncated, ${lines.length - maxLines} more lines]` : content
      }
    };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}
