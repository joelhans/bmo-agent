// Minimal terminal helpers
export function hideCursor(stdout = process.stdout) {
  try { stdout.write('\u001b[?25l'); } catch (_) {}
}
export function showCursor(stdout = process.stdout) {
  try { stdout.write('\u001b[?25h'); } catch (_) {}
}

export function resetTTY({ stdin = process.stdin, stdout = process.stdout } = {}) {
  try { stdout.write('\u001b[<u'); } catch (_) {}
  try { stdout.write('\u001b[?2004l'); } catch (_) {}
  try { showCursor(stdout); } catch (_) {}
  try { stdin.setRawMode?.(false); } catch (_) {}
}
