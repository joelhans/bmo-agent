// session_digest.mjs — Summarize recent session reflections and learning events

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export const description = "Summarize reflections and learning events from recent sessions for maintenance analysis.";

export const schema = {
  type: "object",
  properties: {
    count: {
      type: "number",
      description: "Number of recent sessions to analyze (default: 5)",
      default: 5
    },
    sessionsDir: {
      type: "string",
      description: "Path to sessions directory (default: BMO_HOME/sessions)"
    }
  },
  required: []
};

export async function run({ count = 5, sessionsDir } = {}) {
  try {
    const dir = sessionsDir || join(process.env.BMO_HOME || process.env.HOME + '/.local/share/bmo', 'sessions');
    
    // List JSON files, excluding .log files
    const files = await readdir(dir);
    const jsonFiles = files
      .filter(f => f.endsWith('.json') && !f.endsWith('.log'))
      .sort()
      .reverse()
      .slice(0, count);
    
    if (jsonFiles.length === 0) {
      return { ok: true, result: { sessions: 0, message: "No session files found" } };
    }
    
    const results = {
      sessionsAnalyzed: jsonFiles.length,
      reflections: [],
      learningEvents: [],
      summary: {
        withReflections: 0,
        withLearningEvents: 0,
        totalLearningEvents: 0
      }
    };
    
    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(dir, file), 'utf-8');
        const session = JSON.parse(content);
        
        const sessionInfo = {
          file,
          timestamp: session.startTime || file.slice(0, 14)
        };
        
        // Extract reflection
        if (session.reflection && session.reflection.trim()) {
          results.summary.withReflections++;
          results.reflections.push({
            ...sessionInfo,
            reflection: session.reflection.slice(0, 500) + (session.reflection.length > 500 ? '...' : '')
          });
        }
        
        // Extract learning events
        if (session.learningEvents && Array.isArray(session.learningEvents) && session.learningEvents.length > 0) {
          results.summary.withLearningEvents++;
          results.summary.totalLearningEvents += session.learningEvents.length;
          for (const event of session.learningEvents) {
            results.learningEvents.push({
              ...sessionInfo,
              type: event.type,
              description: event.description,
              context: event.context
            });
          }
        }
      } catch (e) {
        // Skip malformed files
      }
    }
    
    // Generate pattern summary
    const patterns = {};
    for (const event of results.learningEvents) {
      patterns[event.type] = (patterns[event.type] || 0) + 1;
    }
    results.summary.eventsByType = patterns;
    results.summary.reflectionRate = `${results.summary.withReflections}/${results.sessionsAnalyzed}`;
    
    return { ok: true, result: results };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
