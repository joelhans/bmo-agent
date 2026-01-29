// Mouse helpers for SGR (1006) tracking in terminals like xterm/wezterm/iTerm2
// Phase 1 scaffolding: enable/disable + parser. Not yet wired into components.

const CSI = "\u001b[";

// Enable SGR mouse tracking (1006) and button-motion (1002). 1000 for basic clicks.
// Returns a cleanup function equivalent to disableMouse.
export function enableMouse({ stdin = process.stdin, stdout = process.stdout, setRaw = false } = {}) {
  try {
    // Enable normal tracking, button-motion, and SGR encoding
    stdout.write("\u001b[?1000h");
    stdout.write("\u001b[?1002h");
    stdout.write("\u001b[?1006h");
    // Some terms support focus in/out (useful later)
    stdout.write("\u001b[?1004h");
  } catch (_) {}
  if (setRaw) {
    try { stdin.setRawMode?.(true); } catch (_) {}
  }
  return () => disableMouse({ stdin, stdout, resetRaw: setRaw });
}

export function disableMouse({ stdin = process.stdin, stdout = process.stdout, resetRaw = false } = {}) {
  try {
    stdout.write("\u001b[?1004l");
    stdout.write("\u001b[?1006l");
    stdout.write("\u001b[?1002l");
    stdout.write("\u001b[?1000l");
  } catch (_) {}
  if (resetRaw) {
    try { stdin.setRawMode?.(false); } catch (_) {}
  }
}

// Parse a single SGR (1006) mouse sequence from a string buffer.
// Format: ESC[<Cb;Cx;CyM for press/drag; ESC[<Cb;Cx;Cym for release.
// Returns {type: 'down'|'up'|'drag'|'wheel', x, y, button, shift, meta, ctrl} or null.
export function parseSGR(seq) {
  if (!seq || typeof seq !== 'string') return null;
  // Find SGR pattern anywhere in the string
  const re = /\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
  const m = re.exec(seq);
  if (!m) return null;
  const cb = Number(m[1]);
  const cx = Number(m[2]);
  const cy = Number(m[3]);
  const suffix = m[4];
  if (!Number.isFinite(cb) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const shift = !!(cb & 4);
  const meta  = !!(cb & 8);
  const ctrl  = !!(cb & 16);
  const motion = !!(cb & 32);
  const wheel  = !!(cb & 64);

  let button = cb & 3; // 0=left,1=middle,2=right,3=release (when not SGR 'm')
  let type = 'down';

  if (wheel) {
    // Wheel: cb base is 64 + (0 up, 1 down)
    const dir = cb & 1; // 0 up, 1 down
    type = 'wheel';
    button = dir === 0 ? 'wheel_up' : 'wheel_down';
  } else if (suffix === 'm') {
    type = 'up';
  } else if (motion) {
    type = 'drag';
  } else {
    type = 'down';
  }

  return { type, x: cx, y: cy, button, shift, meta, ctrl };
}

// Parse all SGR events contained in a chunk; returns array of parsed events
export function parseSGREvents(chunk) {
  if (!chunk || typeof chunk !== 'string') return [];
  const out = [];
  const reGlobal = /\u001b\[<(\d+);(\d+);(\d+)([Mm])/g;
  let m;
  while ((m = reGlobal.exec(chunk)) !== null) {
    const [full, cbStr, cxStr, cyStr, suffix] = m;
    const cb = Number(cbStr), cx = Number(cxStr), cy = Number(cyStr);
    if (!Number.isFinite(cb) || !Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const shift = !!(cb & 4);
    const meta  = !!(cb & 8);
    const ctrl  = !!(cb & 16);
    const motion = !!(cb & 32);
    const wheel  = !!(cb & 64);
    let button = cb & 3;
    let type = 'down';
    if (wheel) { const dir = cb & 1; type = 'wheel'; button = dir === 0 ? 'wheel_up' : 'wheel_down'; }
    else if (suffix === 'm') type = 'up';
    else if (motion) type = 'drag';
    else type = 'down';
    out.push({ type, x: cx, y: cy, button, shift, meta, ctrl });
  }
  return out;
}

// Utility: wrap a handler to receive only SGR events from a stdin 'data' listener
export function createMouseDataHandler(handler) {
  return (buf) => {
    if (!buf) return;
    const s = typeof buf === 'string' ? buf : buf.toString('utf8');
    const events = parseSGREvents(s);
    if (!events.length) return;
    for (const ev of events) handler(ev);
  };
}
