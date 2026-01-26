// neo-blessed based TUI for bmo (Phase 1 skeleton)
// Provides createTuiUI(bus, opts) returning { promptInput, dispose }

// IMPORTANT: Do NOT import the Terminal widget; Bun compile breaks on term.js.
// We also avoid side-effect imports; instead we rely on neo-blessed's own requires
// and our bunfig aliases to exclude Terminal.

// Import our blessed shim directly to avoid dynamic './widgets/*' requires in single-file builds
import blessedShim from '../shims/neo-blessed/blessed.js';

export async function createTuiUI(bus, opts = {}) {
  const blessed = (blessedShim && (blessedShim.default || blessedShim)) || blessedShim;

  // Terminal quirk handling: Ghostty TERM can cause capability errors (e.g., Setulc)
  const rawTerm = String(opts.term || process.env.BMO_TUI_TERM || process.env.TERM || 'xterm-256color');
  const safeTerm = rawTerm.toLowerCase().includes('ghostty') ? 'xterm-256color' : rawTerm;
  if (safeTerm !== process.env.TERM) {
    process.env.TERM = safeTerm;
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: 'bmo — TUI',
    dockBorders: true,
    fullUnicode: true,
    term: safeTerm,
    autoPadding: true,
    warnings: false,
  });

  // Layout
  const chatBox = blessed.box({
    label: ' Chat ',
    top: 0,
    left: 0,
    width: '70%',
    height: '100%-3',
    tags: true,
    keys: true,
    mouse: true,
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
    mouse: true,
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
    content: '',
  });

  const inputLabel = blessed.box({
    bottom: 1,
    left: 0,
    height: 1,
    width: '100%',
    tags: true,
    content: '{green-fg}You{/green-fg}:',
  });

  const input = blessed.textbox({
    bottom: 0,
    left: 0,
    height: 1,
    width: '100%',
    inputOnFocus: false,
    keys: true,
    mouse: true,
    style: { fg: 'white', bg: 'black' },
    scrollbar: { ch: ' ', inverse: true },
    clickable: true,
  });

  screen.append(chatBox);
  screen.append(eventsBox);
  screen.append(status);
  screen.append(inputLabel);
  screen.append(input);

  // Global safety: ensure Ctrl+C always exits, even if a widget is in readInput()
  const ccHandler = () => { if (_pendingResolve) { const r = _pendingResolve; _pendingResolve = null; try { r('exit'); } catch (_) {} } else { hardExit(0); } };
  const prog = screen.program;
  if (prog && typeof prog.key === 'function') {
    try { prog.key(['C-c'], () => ccHandler()); } catch (_) {}
  }
  if (prog && typeof prog.on === 'function') {
    try { prog.on('keypress', (ch, key) => { if (key && (key.full === 'C-c' || (key.name === 'c' && key.ctrl))) ccHandler(); }); } catch (_) {}
  }

  // Key semantics for the input line
  // - Enter or any newline submits
  // - Shift+Enter submits as well (prevent multiline behavior in 1-line textbox)
  // - Escape cancels
  const submitNow = () => { try { input.emit('submit', input.getValue()); } catch (_) {} };
  input.key(['enter'], submitNow);
  input.key(['S-enter'], submitNow);
  input.key(['escape'], () => { try { input.emit('cancel'); } catch (_) {} });
  // Also catch raw newline characters emitted by some terminals
  input.on('keypress', (ch, key) => {
    if (ch === '\n' || ch === '\r' || (key && (key.name === 'enter' || key.full === 'S-enter'))) {
      submitNow();
    }
  });

  screen.key(['escape'], () => { try { input.focus(); screen.render(); } catch (_) {} });

  let _pendingResolve = null;

  let cleaned = false;
  function cleanupTerminal() {
    if (cleaned) return;
    cleaned = true;
    try {
      const prog2 = screen.program;
      try { prog2.showCursor(); } catch (_) {}
      try { prog2.disableMouse(); } catch (_) {}
      try { prog2.normalBuffer(); } catch (_) {}
    } catch (_) {}
    try { screen.destroy(); } catch (_) {}
  }

  function hardExit(code = 0) { cleanupTerminal(); try { process.exit(code); } catch (_) {} }
  process.once('beforeExit', cleanupTerminal);
  process.once('exit', cleanupTerminal);
  process.once('SIGINT', () => hardExit(0));
  process.once('SIGTERM', () => hardExit(0));
  process.once('uncaughtException', () => hardExit(1));

  screen.key(['C-c'], ccHandler);
  input.key(['C-c'], ccHandler);

  let chatBuffer = '';
  function chatAppend(text) { chatBuffer += text; chatBox.setContent(chatBuffer); chatBox.setScrollPerc(100); screen.render(); }
  function chatNewline() { chatAppend('\n'); }
  function eventLine(text) { const ts = new Date().toISOString().split('T')[1].replace('Z',''); eventsBox.pushLine(`[${ts}] ${text}`); eventsBox.setScrollPerc(100); screen.render(); }

  bus.on('chat:user_input', (text) => { chatAppend(`{green-fg}You{/green-fg}: ${text || ''}\n`); });
  bus.on('chat:assistant_start', () => { chatAppend('{red-fg}bmo{/red-fg}: '); });
  bus.on('chat:assistant_delta', (chunk) => { if (typeof chunk === 'string') chatAppend(chunk); });
  bus.on('chat:assistant_done', () => { chatNewline(); });
  bus.on('tool:call_started', ({ name, details }) => { eventLine(`tool → ${name} ${details ? '(' + details + ')' : ''}`); });
  bus.on('tool:call_result', ({ name, ok, error }) => { eventLine(`tool ✓ ${name} ${ok ? 'ok' : 'ERR'}${error ? ': ' + error : ''}`); });
  bus.on('sys:reload_tools', ({ loaded, errors, error }) => { if (error) eventLine(`reload ERR: ${error}`); if (loaded) eventLine(`reload loaded: ${loaded.join(', ')}`); if (errors && errors.length) eventLine(`reload issues: ${errors.join('; ')}`); });
  bus.on('sys:status', (text) => { if (typeof text === 'string') { status.setContent(`{blue-fg}${text}{/blue-fg}`); screen.render(); } });
  bus.on('sys:error', (text) => { if (typeof text === 'string') { chatAppend(`{red-fg}Error{/red-fg}: ${text}\n`); } });

  async function promptInput(promptText = 'You: ') {
    inputLabel.setContent(`{green-fg}${promptText}{/green-fg}`);
    input.setValue('');
    input.removeAllListeners('submit');
    input.removeAllListeners('cancel');

    return new Promise((resolve) => {
      _pendingResolve = resolve;
      let done = false;
      const finish = (value) => {
        if (done) return; done = true; _pendingResolve = null;
        try { input.removeAllListeners('submit'); input.removeAllListeners('cancel'); input.removeAllListeners('keypress'); } catch (_) {}
        try { input.blur(); } catch (_) {}
        resolve((value ?? '').toString());
      };
      input.once('submit', (val) => finish(val));
      input.once('cancel', () => finish(''));
      input.focus();
      screen.render();
      input.readInput();
    });
  }

  function dispose() { cleanupTerminal(); }

  if (rawTerm !== safeTerm) { eventLine(`TERM '${rawTerm}' overridden → '${safeTerm}' for compatibility`); }
  eventLine('TUI ready');
  input.focus();
  screen.render();

  return { promptInput, dispose };
}
