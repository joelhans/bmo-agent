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
      screen.destroy();
      process.exit(0);
    }
  });

  function pushChatLine(text) {
    chatBox.pushLine(text);
    chatBox.setScrollPerc(100);
  }

  function eventLine(text) {
    const ts = new Date().toISOString().split('T')[1].replace('Z','');
    eventsBox.pushLine(`[${ts}] ${text}`);
    eventsBox.setScrollPerc(100);
  }

  // Streaming state for assistant line
  let streamingLine = '';

  // Subscribe to bus events
  bus.on('chat:user_input', (text) => {
    pushChatLine(`{green-fg}You{/green-fg}: ${text || ''}`);
    screen.render();
  });

  bus.on('chat:assistant_start', () => {
    streamingLine = '{red-fg}bmo{/red-fg}: ';
    pushChatLine(streamingLine);
    screen.render();
  });

  bus.on('chat:assistant_delta', (chunk) => {
    if (typeof chunk !== 'string') return;
    // Update last line efficiently
    streamingLine += chunk;
    const lines = chatBox.getLines();
    if (lines.length > 0) {
      lines[lines.length - 1] = streamingLine;
      chatBox.setContent(lines.join('\n'));
      chatBox.setScrollPerc(100);
      screen.render();
    } else {
      pushChatLine(streamingLine);
      screen.render();
    }
  });

  bus.on('chat:assistant_done', () => {
    // Ensure a trailing newline after streaming
    chatBox.pushLine('');
    chatBox.setScrollPerc(100);
    screen.render();
  });

  bus.on('tool:call_started', ({ name, details }) => {
    eventLine(`tool → ${name} ${details ? '(' + details + ')' : ''}`);
    screen.render();
  });
  bus.on('tool:call_result', ({ name, ok, error }) => {
    eventLine(`tool ✓ ${name} ${ok ? 'ok' : 'ERR'}${error ? ': ' + error : ''}`);
    screen.render();
  });
  bus.on('sys:reload_tools', ({ loaded, errors, error }) => {
    if (error) eventLine(`reload ERR: ${error}`);
    if (loaded) eventLine(`reload loaded: ${loaded.join(', ')}`);
    if (errors && errors.length) eventLine(`reload issues: ${errors.join('; ')}`);
    screen.render();
  });
  bus.on('sys:status', (text) => {
    if (typeof text === 'string') {
      status.setContent(`{blue-fg}${text}{/blue-fg}`);
      screen.render();
    }
  });
  bus.on('sys:error', (text) => {
    if (typeof text === 'string') {
      // Also show errors in chat pane for visibility
      pushChatLine(`{red-fg}Error{/red-fg}: ${text}`);
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
        const out = (value ?? '').toString();
        _pendingResolve = null;
        resolve(out);
      });
    });
  }

  function dispose() {
    try { screen.destroy(); } catch (_) {}
  }

  screen.render();

  return { promptInput, dispose };
}
