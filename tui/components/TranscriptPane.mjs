import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useStdin } from 'ink';
import useKeypress from '../hooks/useKeypress.mjs';
import { enableMouse, createMouseDataHandler } from '../mouse.mjs';

function wrapLine(line, width) {
  if (!line) return [''];
  if (width <= 1) return [line];
  const out = [];
  let i = 0;
  while (i < line.length) {
    out.push(line.slice(i, i + width));
    i += width;
  }
  return out;
}

function buildLines(messages, width) {
  const lines = [];
  for (const m of messages || []) {
    const role = m.role || 'assistant';
    const header = role === 'user' ? 'You' : role === 'assistant' ? 'bmo' : 'tool';
    lines.push({ type: 'header', role, text: `${header}:` });
    const parts = String(m.content ?? '').split('\n');
    for (const p of parts) {
      const wrapped = wrapLine(p, Math.max(10, width));
      for (const w of wrapped) lines.push({ type: 'text', role, text: w });
    }
    // spacer between messages
    lines.push({ type: 'spacer', role, text: '' });
  }
  return lines;
}

export default function TranscriptPane({ messages }) {
  const [scrollOffset, setScrollOffset] = useState(0); // lines from bottom
  const prevTotalRef = useRef(0);
  const { stdin } = useStdin();

  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;

  // Approximate reserved lines below transcript:
  // - InputPane content ~2 + its border ~2
  // - StatusBar ~1
  // - Transcript border ~2
  const reserved = 7;
  const visibleHeight = Math.max(3, rows - reserved);
  const contentWidth = Math.max(10, cols - 4); // account for border+padding

  const allLines = useMemo(() => buildLines(messages, contentWidth), [messages, contentWidth]);
  const total = allLines.length;
  const maxOffset = Math.max(0, total - visibleHeight);

  // Auto-stick to bottom when new content arrives, unless user scrolled up
  useEffect(() => {
    const prevTotal = prevTotalRef.current || 0;
    if (total > prevTotal) {
      setScrollOffset((off) => (off === 0 ? 0 : Math.min(maxOffset, off + (total - prevTotal))));
    } else if (offClampNeeded(scrollOffset, maxOffset)) {
      setScrollOffset((off) => Math.min(off, maxOffset));
    }
    prevTotalRef.current = total;
  }, [total, maxOffset]);

  function offClampNeeded(off, max) { return off > max; }

  const start = Math.max(0, total - visibleHeight - scrollOffset);
  const end = Math.min(total, start + visibleHeight);
  const visible = allLines.slice(start, end);

  // Key handling: PageUp/PageDown/Home/End
  useKeypress(({ key }) => {
    if (!key) return;
    const name = (key.name || '').toLowerCase();
    if (name === 'pageup') {
      const page = Math.max(1, visibleHeight - 1);
      setScrollOffset((off) => Math.min(maxOffset, off + page));
    } else if (name === 'pagedown') {
      const page = Math.max(1, visibleHeight - 1);
      setScrollOffset((off) => Math.max(0, off - page));
    } else if (name === 'home') {
      setScrollOffset(maxOffset);
    } else if (name === 'end') {
      setScrollOffset(0);
    }
  });

  // Mouse wheel support for transcript scrolling
  useEffect(() => {
    if (!stdin) return;
    const cleanupMouse = enableMouse({ stdin, stdout: process.stdout });
    const onMouse = createMouseDataHandler((ev) => {
      if (ev.type !== 'wheel') return;
      const delta = ev.button === 'wheel_up' ? 1 : -1; // wheel up => scrollOffset increases (move up)
      setScrollOffset((off) => clamp(off + delta, 0, maxOffset));
    });
    stdin.on('data', onMouse);
    return () => { stdin.off('data', onMouse); cleanupMouse?.(); };
  }, [stdin, maxOffset]);

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  return React.createElement(
    Box,
    { flexDirection: 'column', paddingX: 1, width: '100%' },
    total === 0
      ? React.createElement(Text, { dimColor: true }, 'Type a prompt below and press Enter. Alt+Enter inserts a newline.')
      : null,
    ...visible.map((ln, i) => {
      if (ln.type === 'spacer') {
        return React.createElement(Text, { key: i }, '');
      }
      const color = ln.role === 'user' ? 'green' : ln.role === 'assistant' ? 'red' : 'yellow';
      if (ln.type === 'header') {
        return React.createElement(Text, { key: i, color }, ln.text);
      }
      return React.createElement(Text, { key: i }, ln.text);
    }),
    // Simple scroll hint
    maxOffset > 0 && scrollOffset > 0
      ? React.createElement(Text, { dimColor: true }, `↑ ${scrollOffset} lines up • PgUp/PgDn/Home/End • Mouse wheel`)
      : maxOffset > 0 && scrollOffset === 0
        ? React.createElement(Text, { dimColor: true }, 'End • PgUp/PgDn/Home/End • Mouse wheel')
        : null
  );
}
