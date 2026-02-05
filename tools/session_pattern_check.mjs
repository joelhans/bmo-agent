import { readFile } from 'fs/promises';
import { join } from 'path';

export const description = "Detect repeated patterns in current session to trigger improvement opportunities";

export const schema = {
  type: "object",
  properties: {
    sessionsDir: {
      type: "string",
      description: "Path to sessions directory (default: BMO_HOME/sessions)"
    },
    threshold: {
      type: "number",
      default: 2,
      description: "Minimum repetitions to flag a pattern"
    }
  },
  required: []
};

export async function run({ sessionsDir, threshold = 2 }) {
  try {
    const bmoHome = process.env.BMO_HOME || join(process.env.HOME, '.local', 'share', 'bmo');
    const sessDir = sessionsDir || join(bmoHome, 'sessions');
    
    // Get the most recent session file (current session)
    const { readdir, stat } = await import('fs/promises');
    const files = await readdir(sessDir);
    const sessionFiles = files.filter(f => f.endsWith('.json'));
    
    if (sessionFiles.length === 0) {
      return { ok: false, error: "No session files found" };
    }
    
    // Find most recent
    let mostRecent = null;
    let mostRecentTime = 0;
    
    for (const file of sessionFiles) {
      const path = join(sessDir, file);
      const stats = await stat(path);
      if (stats.mtimeMs > mostRecentTime) {
        mostRecentTime = stats.mtimeMs;
        mostRecent = path;
      }
    }
    
    const content = await readFile(mostRecent, 'utf-8');
    const session = JSON.parse(content);
    
    // Analyze tool calls
    const toolCalls = session.interactions?.flatMap(i => 
      i.toolCalls?.map(tc => tc.name) || []
    ) || [];
    
    // Count run_command patterns
    const runCommandCalls = session.interactions?.flatMap(i => 
      i.toolCalls?.filter(tc => tc.name === 'run_command')
        .map(tc => tc.parameters?.command) || []
    ) || [];
    
    // Detect patterns
    const patterns = [];
    
    // Pattern 1: Multiple file reads
    const catCalls = runCommandCalls.filter(cmd => cmd?.match(/^\s*cat\s+/));
    if (catCalls.length >= threshold) {
      patterns.push({
        type: 'file_reading',
        count: catCalls.length,
        suggestion: 'Consider using safe_read tool or building a batch file reader',
        examples: catCalls.slice(0, 3)
      });
    }
    
    // Pattern 2: Multiple ls/find operations
    const listCalls = runCommandCalls.filter(cmd => cmd?.match(/^\s*(ls|find)\s+/));
    if (listCalls.length >= threshold) {
      patterns.push({
        type: 'directory_listing',
        count: listCalls.length,
        suggestion: 'Consider using list_files_filtered or building a specialized directory scanner',
        examples: listCalls.slice(0, 3)
      });
    }
    
    // Pattern 3: Multiple grep operations
    const grepCalls = runCommandCalls.filter(cmd => cmd?.match(/grep/));
    if (grepCalls.length >= threshold) {
      patterns.push({
        type: 'searching',
        count: grepCalls.length,
        suggestion: 'Consider using smart_grep tool or building a specialized search tool',
        examples: grepCalls.slice(0, 3)
      });
    }
    
    // Pattern 4: Multiple git operations
    const gitCalls = runCommandCalls.filter(cmd => cmd?.match(/^\s*git\s+/));
    if (gitCalls.length >= threshold) {
      patterns.push({
        type: 'git_operations',
        count: gitCalls.length,
        suggestion: 'Consider building a git workflow tool for this use case',
        examples: gitCalls.slice(0, 3)
      });
    }
    
    // Pattern 5: Same command repeated
    const commandCounts = {};
    runCommandCalls.forEach(cmd => {
      if (cmd) {
        // Normalize by removing variable parts (paths with timestamps, etc)
        const normalized = cmd.replace(/\d{8,}/g, 'TIMESTAMP')
                              .replace(/[a-f0-9]{4,}/g, 'HASH');
        commandCounts[normalized] = (commandCounts[normalized] || 0) + 1;
      }
    });
    
    Object.entries(commandCounts).forEach(([cmd, count]) => {
      if (count >= threshold) {
        patterns.push({
          type: 'repeated_command',
          count,
          suggestion: 'This exact command pattern is repeated — consider automating',
          examples: [cmd]
        });
      }
    });
    
    return {
      ok: true,
      result: {
        sessionFile: mostRecent,
        totalToolCalls: toolCalls.length,
        runCommandCalls: runCommandCalls.length,
        patternsDetected: patterns.length,
        patterns,
        message: patterns.length > 0 
          ? '🔍 Friction patterns detected! Consider building a tool.'
          : '✅ No repeated patterns detected in this session.'
      }
    };
    
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
