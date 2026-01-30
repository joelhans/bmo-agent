// Shared config helpers for CLI and TUI

export function resolveDefaultModel() {
  const a = (process.env.BMO_MODEL || '').trim();
  if (a) return a;
  const b = (process.env.OPENAI_MODEL || '').trim();
  if (b) return b;
  return 'gpt-4o';
}
