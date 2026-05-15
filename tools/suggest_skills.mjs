/**
 * Suggest relevant skills based on task keywords
 * Scans message content and suggests skills that might help
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export const description = 'Suggest skills to load based on task content';

export const schema = {
  type: 'object',
  properties: {
    taskDescription: {
      type: 'string',
      description: 'Description of the current task or user message'
    }
  },
  required: ['taskDescription']
};

// Keyword triggers for each skill
const SKILL_TRIGGERS = {
  'safe-file-editing': ['refactor', 'edit', 'modify', 'change file', 'update code', 'fix bug', 'patch'],
  'codebase-exploration': ['explore', 'unfamiliar', 'new codebase', 'understand', 'how does', 'architecture'],
  'learning-event-capture': ['correction', 'wrong', 'not that', 'actually', 'prefer', 'always'],
  'runtime-self-critique': ['improve', 'better way', 'optimize', 'self-improvement', 'maintenance'],
  'session-kickoff': ['hello', 'hi', 'hey', 'start', 'greeting'],
  'reflection-template': ['reflect', 'reflection', 'end session', 'wrap up'],
  'regret-minimization': ['should I build', 'tool or', 'defer', 'later', 'opportunity']
};

export async function run({ taskDescription }) {
  const bmoHome = process.env.BMO_HOME || join(process.env.HOME, '.local/share/bmo');
  const skillsDir = join(bmoHome, 'skills');
  
  const taskLower = taskDescription.toLowerCase();
  const suggestions = [];
  
  for (const [skillName, triggers] of Object.entries(SKILL_TRIGGERS)) {
    const matchedTriggers = triggers.filter(t => taskLower.includes(t));
    if (matchedTriggers.length > 0) {
      suggestions.push({
        skill: skillName,
        matchedKeywords: matchedTriggers,
        confidence: matchedTriggers.length >= 2 ? 'high' : 'medium'
      });
    }
  }
  
  // Sort by confidence (high first) then by match count
  suggestions.sort((a, b) => {
    if (a.confidence === 'high' && b.confidence !== 'high') return -1;
    if (b.confidence === 'high' && a.confidence !== 'high') return 1;
    return b.matchedKeywords.length - a.matchedKeywords.length;
  });
  
  if (suggestions.length === 0) {
    return {
      ok: true,
      result: {
        suggestions: [],
        message: 'No skill suggestions for this task. Consider loading runtime-self-critique for general task guidance.'
      }
    };
  }
  
  return {
    ok: true,
    result: {
      suggestions,
      message: `Found ${suggestions.length} relevant skill(s). Use load_skill to load them.`
    }
  };
}
