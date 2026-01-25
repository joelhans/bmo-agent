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

  const screen = blessed.screen({
    smartCSR: true,
    title: 'bmo — TUI',
    dockBorders: true,
  });

  // Layout
  const chatBox = blessed.box({
    label: ' Chat ',
    top: 0,
    left: 0,
    width: '70%',
    height: '100%-4',
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
    height: '100%-4',
    tags: true,
    keys: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    border: { type: 'line' },
    style: { border: { fg: 'yellow' } },
    content: ''
  });

  const inputLabel = blessed.box({
    bottom: 1,
    left: 0,
    height: 1,
    width: '100%-2',
    tags: true,
    content: '{green-fg}You{/green-fg}:',
  });

  const input = blessed.textbox({
    bottom: 0,
    left: 0,
    height: 1,
    width: '100%-2',
    inputOnFocus: true,
    keys: true,
    mouse: true,
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line' },
    padding: { left: 1, right: 1 },
  });

  const status = blessed.box({
    bottom: 0,
    right: 0,
    height: 1,
    width: 'shrink',
    tags: true,
    content: '',
  });

  screen.append(chatBox);
  screen.append(eventsBox);
  screen.append(inputLabel);
  screen.append(input);
  screen.append(status);

  screen.key(['C-c'], () => {
    // Let main handle exit by resolving with 'exit' if waiting; else just destroy
    if (_pendingResolve) {
      _pendingResolve('exit');
      _pendingResolve = null;
    } else {
      screen.destroy();
      process.exit(0);
    }
  });

  // Simple state for streaming line assembly
  let chatBuffer = '';
  function chatAppend(text) {
    chatBuffer += text;
    chatBox.setContent(chatBuffer);
    chatBox.setScrollPerc(100);
    screen.render();
  }
  function chatNewline() {
    chatBuffer += '\n';
    chatBox.setContent(chatBuffer);
    chatBox.setScrollPerc(100);
    screen.render();
  }

  function eventLine(text) {
    const ts = new Date().toISOString().split('T')[1].replace('Z','');
    eventsBox.pushLine(`[${ts}] ${text}`);
    eventsBox.setScrollPerc(100);
    screen.render();
  }

  // Subscribe to bus events
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
        // Blessed textbox keeps focus; clear and resolve
        const out = (value ?? '').toString();
        _pendingResolve = null;
        resolve(out);
      });
    });
  }

  function dispose() {
    try { screen.destroy(); } catch (_) {}
  }

  // Initial render
  screen.render();

  return { promptInput, dispose };
}
