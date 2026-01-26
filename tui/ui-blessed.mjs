// neo-blessed based TUI for bmo (Phase 1 skeleton)
// Provides createTuiUI(bus, opts) returning { promptInput, dispose }

// IMPORTANT: Do NOT import the Terminal widget; Bun compile breaks on term.js.
// Avoid dynamic imports; use our blessed shim.

import blessedShim from '../shims/neo-blessed/blessed.js';

export async function createTuiUI(bus, opts = {}) {
  const blessed = (blessedShim && (blessedShim.default || blessedShim)) || blessedShim;

  // Terminal quirk handling: normalize TERM (Ghostty → xterm-256color)
  const rawTerm = String(opts.term || process.env.BMO_TUI_TERM || process.env.TERM || 'xterm-256color');
  const safeTerm = rawTerm.toLowerCase().includes('ghostty') ? 'xterm-256color' : rawTerm;
  if (safeTerm !== process.env.TERM) process.env.TERM = safeTerm;

  const screen = blessed.screen({
    smartCSR: true,
    title: 'bmo — TUI',
    dockBorders: true,
    fullUnicode: true,
    term: safeTerm,
    autoPadding: true,
    warnings: false,
  });

  // For MVP stability: disable mouse tracking entirely unless explicitly enabled
  const enableMouse = process.env.BMO_TUI_MOUSE === '1';
  try { if (!enableMouse) screen.program.disableMouse(); } catch (_) {}

  // Layout (mouse disabled to avoid leaving terminal in mouse-report mode on crashes)
  const chatBox = blessed.box({
    label: ' Chat ',
    top: 0,
    left: 0,
    width: '70%',
    height: '100%-3',
    tags: true,
    keys: true,
    mouse: false,
    scrollable: true,
    alwaysScroll: true,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    content: ''
  });

  const eventsBox = blessed.box({
    label: ' Tools ',
    top: 0,
    left: '70%',
    width: '30%',
    height: '100%-3',
    tags: true,
    keys: true,
    mouse: false,
    scrollable: true,
    alwaysScroll: true,
    border: { type: 'line' },
    style: { border: { fg: 'yellow' } },
    content: ''
  });

  const status = blessed.box({
    bottom: 2,
    left: 0,
    height: 1,
    width: '100%',
    tags: true,
    mouse: false,
    content: '',
  });

  const inputLabel = blessed.box({
    bottom: 1,
    left: 0,
    height: 1,
    width: '100%',
    tags: true,
    mouse: false,
    content: '{green-fg}You{/green-fg}:',
  });

  const input = blessed.textbox({
    bottom: 0,
    left: 0,
    height: 1,
    width: '100%',
    inputOnFocus: false,
    keys: true,
    mouse: false,
    style: { fg: 'white', bg: 'black' },
    clickable: true,
  });

  screen.append(chatBox);
  screen.append(eventsBox);
  screen.append(status);
  screen.append(inputLabel);
  screen.append(input);

  let _pendingResolve = null;

  function cleanupTerminal() {
    try { const p = screen.program; try { p.showCursor(); } catch(_){} try { p.disableMouse(); } catch(_){} try { p.normalBuffer(); } catch(_){} } catch(_) {}
    try { screen.destroy(); } catch(_) {}
  }
  function hardExit(code=0){ cleanupTerminal(); try{ process.exit(code);}catch(_){} }

  const ccHandler = () => { if (_pendingResolve) { const r = _pendingResolve; _pendingResolve = null; try { r('exit'); } catch (_) {} } else { hardExit(0); } };

  // Global safety: ensure Ctrl+C always exits, even inside readInput
  try { screen.key(['C-c'], ccHandler); } catch(_){}
  try { input.key(['C-c'], ccHandler); } catch(_){}
  try { const prog = screen.program; if (prog?.key) prog.key(['C-c'], () => ccHandler()); if (prog?.on) prog.on('keypress', (ch, key) => { if (key && (key.full === 'C-c' || (key.name === 'c' && key.ctrl))) ccHandler(); }); } catch(_){}

  // Extra emergency exit: Ctrl+G cancels current prompt or exits
  const cg = () => { if (_pendingResolve) { const r=_pendingResolve; _pendingResolve=null; try{ r(''); }catch(_){} } else { hardExit(0); } };
  try { screen.key(['C-g'], cg); input.key(['C-g'], cg); } catch(_){}

  // Input semantics: treat any newline as submit (avoid Shift+Enter hang)
  const submitNow = () => { try { input.emit('submit', input.getValue()); } catch (_) {} };
  try { input.key(['enter','S-enter'], submitNow); } catch(_){}
  try { input.on('keypress', (ch, key) => { if (ch === '\n' || ch === '\r' || (key && (key.name === 'enter'))) submitNow(); }); } catch(_){}
  try { input.key(['escape'], () => { try { input.emit('cancel'); } catch(_){} }); } catch(_){}

  // ESC refocuses the input
  try { screen.key(['escape'], () => { try { input.focus(); screen.render(); } catch(_){} }); } catch(_){}

  let chatBuffer = '';
  function chatAppend(text) { chatBuffer += text; try { chatBox.setContent(chatBuffer); chatBox.setScrollPerc(100); screen.render(); } catch(_){} }
  function chatNewline() { chatAppend('\n'); }
  function eventLine(text) { const ts = new Date().toISOString().split('T')[1].replace('Z',''); try { eventsBox.pushLine(`[${ts}] ${text}`); eventsBox.setScrollPerc(100); screen.render(); } catch(_){} }

  bus.on('chat:user_input', (text) => { chatAppend(`{green-fg}You{/green-fg}: ${text || ''}\n`); });
  bus.on('chat:assistant_start', () => { chatAppend('{red-fg}bmo{/red-fg}: '); });
  bus.on('chat:assistant_delta', (chunk) => { if (typeof chunk === 'string') chatAppend(chunk); });
  bus.on('chat:assistant_done', () => { chatNewline(); });
  bus.on('tool:call_started', ({ name, details }) => { eventLine(`tool → ${name} ${details ? '(' + details + ')' : ''}`); });
  bus.on('tool:call_result', ({ name, ok, error }) => { eventLine(`tool ✓ ${name} ${ok ? 'ok' : 'ERR'}${error ? ': ' + error : ''}`); });
  bus.on('sys:reload_tools', ({ loaded, errors, error }) => { if (error) eventLine(`reload ERR: ${error}`); if (loaded) eventLine(`reload loaded: ${loaded.join(', ')}`); if (errors && errors.length) eventLine(`reload issues: ${errors.join('; ')}`); });
  bus.on('sys:status', (text) => { if (typeof text === 'string') { try { status.setContent(`{blue-fg}${text}{/blue-fg}`); screen.render(); } catch(_){} } });
  bus.on('sys:error', (text) => { if (typeof text === 'string') { chatAppend(`{red-fg}Error{/red-fg}: ${text}\n`); } });

  async function promptInput(promptText = 'You: ') {
    try { inputLabel.setContent(`{green-fg}${promptText}{/green-fg}`); input.setValue(''); input.removeAllListeners('submit'); input.removeAllListeners('cancel'); input.removeAllListeners('keypress'); } catch(_){}
    return new Promise((resolve) => {
      _pendingResolve = resolve;
      let done = false;
      const finish = (value) => {
        if (done) return; done = true; _pendingResolve = null;
        try { input.removeAllListeners('submit'); input.removeAllListeners('cancel'); input.removeAllListeners('keypress'); } catch(_){}
        try { input.blur(); } catch(_){}
        resolve((value ?? '').toString());
      };
      try { input.once('submit', (val) => finish(val)); input.once('cancel', () => finish('')); input.focus(); screen.render(); input.readInput(); } catch(_){}
    });
  }

  function dispose() { cleanupTerminal(); }

  if (rawTerm !== safeTerm) { eventLine(`TERM '${rawTerm}' overridden → '${safeTerm}' for compatibility`); }
  if (!enableMouse) { eventLine('Mouse disabled for stability (set BMO_TUI_MOUSE=1 to enable)'); }
  eventLine('TUI ready');
  try { input.focus(); screen.render(); } catch(_){}

  return { promptInput, dispose };
}
