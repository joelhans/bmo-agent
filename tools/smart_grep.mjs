import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const description = "Perform a grep search with directory exclusions";

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
    // Construct exclude patterns
    const excludeArgs = exclude.flatMap(dir => 
      paths.map(path => `--exclude-dir=${dir}`)
    ).join(' ');

    // Construct paths
    const pathArgs = paths.join(' ');

    // Construct the grep command
    const command = `grep -r ${excludeArgs} "${pattern}" ${pathArgs}`;

    const { stdout, stderr } = await execAsync(command);
    
    return {
      ok: true,
      result: stdout
    };
  } catch (error) {
    // grep returns non-zero exit code when no matches are found
    if (error.code === 1) {
      return {
        ok: true,
        result: ''
      };
    }

    return {
      ok: false,
      error: error.message
    };
  }
}

export const requires = ['grep'];
