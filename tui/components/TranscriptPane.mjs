import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, Spacer, useStdin } from 'ink';
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

  const cols = process.stdout.columns || 80;
  const contentWidth = Math.max(10, cols - 4); // account for border+padding

  const allLines = useMemo(() => buildLines(messages, contentWidth), [messages, contentWidth]);
  const total = allLines.length;

  // We'll render as many lines as available (flexGrow container). Compute maxOffset dynamically
  const [visibleHeight, setVisibleHeight] = useState(0);
  const maxOffset = Math.max(0, total - Math.max(0, visibleHeight - 1));

  // Auto-stick to bottom when new content arrives, unless user scrolled up
  useEffect(() => {
    const prevTotal = prevTotalRef.current || 0;
    if (total > prevTotal) {
      setScrollOffset((off) => (off === 0 ? 0 : Math.min(maxOffset, off + (total - prevTotal))));
    } else if (scrollOffset > maxOffset) {
      setScrollOffset(maxOffset);
    }
    prevTotalRef.current = total;
  }, [total, maxOffset]);

  const start = Math.max(0, total - Math.max(0, visibleHeight - 1) - scrollOffset);
  const end = Math.min(total, start + Math.max(0, visibleHeight - 1));
  const visible = allLines.slice(start, end);

  // Key handling: PageUp/PageDown/Home/End
  useKeypress(({ key }) => {
    if (!key) return;
    const name = (key.name || '').toLowerCase();
    const page = Math.max(1, Math.max(0, visibleHeight - 2));
    if (name === 'pageup') setScrollOffset((off) => Math.min(maxOffset, off + page));
    else if (name === 'pagedown') setScrollOffset((off) => Math.max(0, off - page));
    else if (name === 'home') setScrollOffset(maxOffset);
    else if (name === 'end') setScrollOffset(0);
  });

  // Mouse wheel support for transcript scrolling
  useEffect(() => {
    if (!stdin) return;
    const cleanupMouse = enableMouse({ stdin, stdout: process.stdout });
    const onMouse = createMouseDataHandler((ev) => {
      if (ev.type !== 'wheel') return;
      const delta = ev.button === 'wheel_up' ? 1 : -1; // wheel up => scrollOffset increases (move up)
      setScrollOffset((off) => Math.max(0, Math.min(maxOffset, off + delta)));
    });
    stdin.on('data', onMouse);
    return () => { stdin.off('data', onMouse); cleanupMouse?.(); };
  }, [stdin, maxOffset]);

  // Measure available height: we reserve 1 row for the hint (Spacer sits above it)
  useEffect(() => {
    const onResize = () => {
      // Estimate container height from terminal; transcript box has round border (2 rows) and paddingX only.
      // We can't measure Box height directly; compute from rows minus bottom panes height.
      // Fallback: keep last known
      const rows = process.stdout.rows || 24;
      // Estimate bottom pane height: classic border (2) + input content (5) + status (1)
      const bottom = 2 + 5 + 1;
      const border = 2; // round
      const h = Math.max(3, rows - bottom - border);
      setVisibleHeight(h);
    };
    onResize();
    const ti = setInterval(onResize, 200);
    return () => clearInterval(ti);
  }, []);

  const hintNeeded = total > Math.max(0, visibleHeight - 1);
  const hintText = scrollOffset > 0
    ? `↑ ${scrollOffset} lines up • PgUp/PgDn/Home/End • Mouse wheel`
    : 'End • PgUp/PgDn/Home/End • Mouse wheel';

  return React.createElement(
    Box,
    { flexDirection: 'column', paddingX: 1, width: '100%' },
    total === 0 ? React.createElement(Text, { dimColor: true }, 'Type a prompt below and press Enter. Alt+Enter inserts a newline.') : null,
    ...visible.map((ln, i) => {
      if (ln.type === 'spacer') return React.createElement(Text, { key: i }, '');
      const color = ln.role === 'user' ? 'green' : ln.role === 'assistant' ? 'red' : 'yellow';
      if (ln.type === 'header') return React.createElement(Text, { key: i, color }, ln.text);
      return React.createElement(Text, { key: i }, ln.text);
    }),
    React.createElement(Spacer, { key: 'sp' }),
    hintNeeded ? React.createElement(Text, { dimColor: true, key: 'hint' }, hintText) : null
  );
}
