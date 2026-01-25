// neo-blessed based TUI for bmo (Phase 1 skeleton)
// Provides createTuiUI(bus, opts) returning { promptInput, dispose }

export async function createTuiUI(bus, opts = {}) {
  let blessed;
  try {
    const mod = await import('neo-blessed');
    blessed = mod.default || mod;
  } catch (e) {
    throw new Error("neo-blessed is not installed. Install with: pnpm add neo-blessed");
  }

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
    label: ' Tools & Events ',
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
    inputOnFocus: true,
    keys: true,
    mouse: true,
    style: { fg: 'white', bg: 'black' },
  });

  screen.append(chatBox);
  screen.append(eventsBox);
  screen.append(status);
  screen.append(inputLabel);
  screen.append(input);

  screen.key(['C-c'], () => {
    if (_pendingResolve) {
      _pendingResolve('exit');
      _pendingResolve = null;
    } else {
      try { screen.destroy(); } catch (_) {}
      process.exit(0);
    }
  });

  // Simple streaming buffer approach (robust)
  let chatBuffer = '';
  function chatAppend(text) {
    chatBuffer += text;
    chatBox.setContent(chatBuffer);
    chatBox.setScrollPerc(100);
    screen.render();
  }
  function chatNewline() {
    chatAppend('\n');
  }
  function eventLine(text) {
    const ts = new Date().toISOString().split('T')[1].replace('Z','');
    eventsBox.pushLine(`[${ts}] ${text}`);
    eventsBox.setScrollPerc(100);
    screen.render();
  }

  // Subscribe to bus events
  bus.on('chat:user_input', (text) => {
    chatAppend(`{green-fg}You{/green-fg}: ${text || ''}\n`);
  });

  bus.on('chat:assistant_start', () => {
    chatAppend('{red-fg}bmo{/red-fg}: ');
  });

  bus.on('chat:assistant_delta', (chunk) => {
    if (typeof chunk === 'string') chatAppend(chunk);
  });

  bus.on('chat:assistant_done', () => {
    chatNewline();
  });

  bus.on('tool:call_started', ({ name, details }) => {
    eventLine(`tool → ${name} ${details ? '(' + details + ')' : ''}`);
  });
  bus.on('tool:call_result', ({ name, ok, error }) => {
    eventLine(`tool ✓ ${name} ${ok ? 'ok' : 'ERR'}${error ? ': ' + error : ''}`);
  });
  bus.on('sys:reload_tools', ({ loaded, errors, error }) => {
    if (error) eventLine(`reload ERR: ${error}`);
    if (loaded) eventLine(`reload loaded: ${loaded.join(', ')}`);
    if (errors && errors.length) eventLine(`reload issues: ${errors.join('; ')}`);
  });
  bus.on('sys:status', (text) => {
    if (typeof text === 'string') {
      status.setContent(`{blue-fg}${text}{/blue-fg}`);
      screen.render();
    }
  });
  bus.on('sys:error', (text) => {
    if (typeof text === 'string') {
      chatAppend(`{red-fg}Error{/red-fg}: ${text}\n`);
    }
  });

  // Input handling
  let _pendingResolve = null;
  async function promptInput(promptText = 'You: ') {
    inputLabel.setContent(`{green-fg}${promptText}{/green-fg}`);
    input.setValue('');
    screen.render();

    return new Promise((resolve) => {
      _pendingResolve = resolve;
      input.focus();
      input.readInput((err, value) => {
        const out = (value ?? '').toString();
        _pendingResolve = null;
        // Blur to ensure next promptInput can re-focus cleanly
        try { input.blur(); } catch (_) {}
        resolve(out);
      });
    });
  }

  function dispose() {
    try { screen.destroy(); } catch (_) {}
  }

  if (rawTerm !== safeTerm) {
    eventLine(`TERM '${rawTerm}' overridden → '${safeTerm}' for compatibility`);
  }

  screen.render();

  return { promptInput, dispose };
}
