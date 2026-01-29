import React from 'react';
import { render } from 'ink';
import App from './App.mjs';
import { resetTTY } from './term.mjs';

// Guard: require TTY
if (!process.stdin.isTTY) {
  console.error('bmo TUI requires a TTY. Try running in a real terminal.');
  process.exit(1);
}

// Reset any lingering terminal modes from prior runs.
try { resetTTY({ stdin: process.stdin, stdout: process.stdout }); } catch (_) {}

const instance = render(React.createElement(App));

const cleanup = () => {
  try { resetTTY({ stdin: process.stdin, stdout: process.stdout }); } catch (_) {}
};

process.once('SIGINT', () => { cleanup(); process.exit(0); });
process.once('SIGTERM', () => { cleanup(); process.exit(0); });
process.once('exit', cleanup);
