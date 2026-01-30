import React from 'react';
import { render } from 'ink';
import App from './App.mjs';
import { resetTTY, hideCursor, showCursor } from './term.mjs';
import { initSessionLogger } from '../lib/logger.mjs';

export async function runTui() {
  if (!process.stdin.isTTY) {
    throw new Error('bmo TUI requires a TTY.');
  }
  try {
    resetTTY({ stdin: process.stdin, stdout: process.stdout });
    hideCursor(process.stdout);
  } catch (_) {}
  const logger = initSessionLogger();
  console.log(`Session log: ${logger.path}`);
  const instance = render(React.createElement(App, { logger }));
  const cleanup = () => {
    try { logger.end('ended (exit)'); } catch (_) {}
    try { showCursor(process.stdout); } catch (_) {}
    try { resetTTY({ stdin: process.stdin, stdout: process.stdout }); } catch (_) {}
  };
  process.once('SIGINT', () => { cleanup(); process.exit(0); });
  process.once('SIGTERM', () => { cleanup(); process.exit(0); });
  process.once('exit', cleanup);
}

// Auto-run only when executed directly (source mode).
if (import.meta.url === `file://${process.argv[1]}`) {
  runTui().catch((e) => {
    console.error('Failed to start TUI:', e?.message || e);
    process.exit(1);
  });
}
