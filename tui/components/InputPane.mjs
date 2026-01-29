import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import useKeypress from '../hooks/useKeypress.mjs';

function parseCSIU(seq) {
  if (!seq || !seq.includes('[') || !seq.endsWith('u')) return null;
  if (!seq.startsWith('\u001b[')) {
    if (seq.startsWith('[')) seq = '\u001b' + seq;
    else return null;
  }
  const body = seq.slice(2, -1);
  const parts = body.split(';');
  if (parts.length < 1) return null;
  const codeAndAlts = parts[0].split(':');
  const code = Number(codeAndAlts[0]);
  if (!Number.isFinite(code)) return null;
  let mod = 1; let etype = 1;
  if (parts.length >= 2) {
    const modAndType = parts[1].split(':');
    mod = Number(modAndType[0]);
    if (!Number.isFinite(mod)) mod = 1;
    if (modAndType.length >= 2) { const t = Number(modAndType[1]); if (Number.isFinite(t)) etype = t; }
  }
  let text = '';
  if (parts.length >= 3) {
    const textFields = parts.slice(2).join(';');
    const cps = textFields.split(':').map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);
    if (cps.length) { try { text = String.fromCodePoint(...cps); } catch (_) { text = ''; } }
  }
  if (mod >= 128) mod -= 128;
  const base = Math.max(0, mod - 1);
  const shift = !!(base & 1);
  const alt =   !!(base & 2);
  const ctrl =  !!(base & 4);
  return { code, shift, alt, ctrl, type: etype, text };
}

function sanitizeInputChunk(chunk) {
  if (!chunk) return '';
  if (/^\[\d+;\d+(?:;\d+)?u$/.test(chunk)) return '';
  let out = '';
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    const code = ch.charCodeAt(0);
    if (ch === '\u001b') return out;
    if (ch === '\r') continue;
    if (code === 9 || code === 10) { out += ch; continue; }
    if (code >= 32 && code !== 127) out += ch;
  }
  return out;
}

export default function InputPane({ onSubmit }) {
  const [text, setText] = useState('');
  const lastEnterHandledAt = useRef(0);
  const { stdin } = useStdin();

  const submit = () => {
    const t = text.trimEnd();
    if (t.length === 0) return;
    onSubmit?.(t);
    setText('');
  };

  useEffect(() => {
    if (!stdin) return;
    const onData = (buf) => {
      const s = buf.toString('utf8');
      if (s.endsWith('u') && (s.startsWith('\u001b[') || s.startsWith('['))) {
        const ev = parseCSIU(s);
        if (ev && (ev.type === undefined || ev.type === 1)) {
          if (ev.code === 13) { if (ev.alt || ev.ctrl) setText(t => t + '\n'); else submit(); lastEnterHandledAt.current = Date.now(); return; }
          if (ev.code === 127) { setText(t => t.slice(0, -1)); return; }
          if (ev.code === 9) { setText(t => t + '\t'); return; }
          if (ev.text) { setText(t => t + ev.text); return; }
        }
      }
      if (s === '\r') { submit(); lastEnterHandledAt.current = Date.now(); return; }
      if (s === '\n') { setText(t => t + '\n'); lastEnterHandledAt.current = Date.now(); return; }
    };
    stdin.on('data', onData);
    return () => stdin.off('data', onData);
  }, [stdin]);

  useKeypress(({ key }) => {
    if (!key) return;
    const ev = parseCSIU(key.sequence);
    if (ev && (ev.type === undefined || ev.type === 1)) {
      if (ev.code === 13) { if (ev.alt || ev.ctrl) setText(t => t + '\n'); else submit(); lastEnterHandledAt.current = Date.now(); }
      return;
    }
    if (key.name === 'return') { if (key.meta || key.ctrl) setText(t => t + '\n'); else submit(); lastEnterHandledAt.current = Date.now(); }
  });

  useInput((input, key) => {
    if (key.return) {
      if (Date.now() - lastEnterHandledAt.current < 60) return;
      if (key.meta || key.ctrl || input === '\n') setText(t => t + '\n'); else submit();
      lastEnterHandledAt.current = Date.now();
      return;
    }
    if (key.backspace || key.delete) { setText(t => t.slice(0, -1)); return; }
    const safe = sanitizeInputChunk(input);
    if (safe) setText(t => t + safe);
  });

  return React.createElement(
    Box,
    { flexDirection: 'column', paddingX: 1, width: '100%' },
    // Always render at least one blank line so the first line is visible before typing
    React.createElement(Text, null, (text.length ? text : ' ')),
    React.createElement(Text, { dimColor: true }, 'Enter to submit • Alt+Enter (or Ctrl+Enter) to newline')
  );
}
