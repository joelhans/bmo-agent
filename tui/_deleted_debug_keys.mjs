#!/usr/bin/env node
import * as readline from 'node:readline';

process.stdin.setRawMode?.(true);
readline.emitKeypressEvents(process.stdin);

console.log('Press keys to inspect. Ctrl+C to exit.');

function toHex(s) {
  return [...Buffer.from(s, 'utf8')].map(b => b.toString(16).padStart(2, '0')).join(' ');
}

function parseCsiU(seq) {
  const m = /^\u001b\[(\d+);(\d+)u$/.exec(seq || '');
  if (!m) return null;
  let code = Number(m[1]);
  let mod = Number(m[2]);
  if (!Number.isFinite(code) || !Number.isFinite(mod)) return null;
  if (mod >= 128) mod -= 128; // normalize extended
  const base = Math.max(0, mod - 1);
  return {
    code,
    shift: !!(base & 1),
    alt: !!(base & 2),
    ctrl: !!(base & 4)
  };
}

process.stdin.on('keypress', (str, key) => {
  const seq = key?.sequence ?? '';
  const name = key?.name ?? '';
  const { ctrl, meta, shift } = key || {};
  const parsed = parseCsiU(seq);
  console.log({ name, ctrl, meta, shift, sequence: seq, hex: toHex(seq || str || ''), csiu: parsed });
  if (parsed && parsed.ctrl && parsed.code === 99) {
    process.exit(0);
  }
});
