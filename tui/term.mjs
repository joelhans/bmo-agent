// Minimal terminal reset helpers
export function resetTTY({ stdin = process.stdin, stdout = process.stdout } = {}) {
  try { stdout.write('\u001b[<u'); } catch (_) {}
  try { stdout.write('\u001b[?2004l'); } catch (_) {}
  try { stdout.write('\u001b[?25h'); } catch (_) {}
  try { stdin.setRawMode?.(false); } catch (_) {}
}
