/**
 * Suggest relevant skills based on task keywords
 * Scans message content and suggests skills that might help
 */

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

// Keyword triggers for each skill - use word boundaries via regex
const SKILL_TRIGGERS = {
  'safe-file-editing': [/\brefactor/i, /\bedit\b/i, /\bmodify\b/i, /\bchange file/i, /\bupdate code/i, /\bfix bug/i, /\bpatch\b/i],
  'codebase-exploration': [/\bexplore/i, /\bunfamiliar/i, /\bnew codebase/i, /\bunderstand\b/i, /\bhow does/i, /\barchitecture/i],
  'learning-event-capture': [/\bcorrection/i, /\bwrong\b/i, /\bnot that\b/i, /\bactually\b/i, /\bprefer\b/i, /\balways\b/i],
  'runtime-self-critique': [/\bimprove/i, /\bbetter way/i, /\boptimize/i, /\bself-improvement/i, /\bmaintenance/i],
  'session-kickoff': [/^hello\b/i, /^hi\b/i, /^hey\b/i, /\bstart\b/i],
  'reflection-template': [/\breflect/i, /\breflection/i, /\bend session/i, /\bwrap up/i],
  'regret-minimization': [/\bshould I build/i, /\btool or\b/i, /\bdefer\b/i, /\blater\b/i, /\bopportunity/i]
};

export async function run({ taskDescription }) {
  const suggestions = [];
  
  for (const [skillName, patterns] of Object.entries(SKILL_TRIGGERS)) {
    const matchedPatterns = patterns.filter(p => p.test(taskDescription));
    if (matchedPatterns.length > 0) {
      suggestions.push({
        skill: skillName,
        matchedKeywords: matchedPatterns.map(p => p.source.replace(/\\b/g, '').replace(/\^/g, '')),
        confidence: matchedPatterns.length >= 2 ? 'high' : 'medium'
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
