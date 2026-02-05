import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const description = "Perform a grep search with directory exclusions";

export const capabilities = { subprocess: true };

export const schema = {
  type: "object",
  properties: {
    pattern: { type: "string", description: "Search pattern" },
    paths: { 
      type: "array", 
      items: { type: "string" },
      description: "Paths to search" 
    },
    exclude: { 
      type: "array", 
      items: { type: "string" }, 
      description: "Directories to exclude",
      default: ["node_modules", ".git", "dist", "build"]
    }
  },
  required: ["pattern", "paths"]
};

export async function run({ pattern, paths, exclude = ["node_modules", ".git", "dist", "build"] }) {
  try {
    // Build exclude args - one per directory, not per path
    const excludeArgs = exclude.map(dir => `--exclude-dir=${dir}`).join(' ');

    // Construct paths
    const pathArgs = paths.join(' ');

    // Escape pattern for shell safety
    const escapedPattern = pattern.replace(/"/g, '\\"');

    // Construct the grep command
    const command = `grep -rn ${excludeArgs} "${escapedPattern}" ${pathArgs}`;

    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 });
    
    return {
      ok: true,
      result: stdout || '(no matches)'
    };
  } catch (error) {
    // grep returns exit code 1 when no matches are found (not an error)
    if (error.code === 1 && !error.stderr) {
      return {
        ok: true,
        result: '(no matches)'
      };
    }

    return {
      ok: false,
      error: `grep failed: ${error.message}`
    };
  }
}

export const requires = ['grep'];
