import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useStdin } from 'ink';
import { enableMouse, createMouseDataHandler } from '../mouse.mjs';

function parseCSIU(seq) {
  if (!seq || !seq.includes('[')) return null;
  if (!seq.endsWith('u')) return null;
  if (!seq.startsWith('\u001b[')) {
    if (seq.startsWith('[')) seq = '\u001b' + seq; else return null;
  }
  const body = seq.slice(2, -1);
  const parts = body.split(';');
  if (parts.length < 1) return null;
  const code = Number(parts[0].split(':')[0]);
  if (!Number.isFinite(code)) return null;
  let mod = 1; let etype = 1;
  if (parts.length >= 2) {
    const modAndType = parts[1].split(':');
    mod = Number(modAndType[0]); if (!Number.isFinite(mod)) mod = 1;
    if (modAndType.length >= 2) { const t = Number(modAndType[1]); if (Number.isFinite(t)) etype = t; }
  }
  let text = '';
  if (parts.length >= 3) {
    const cps = parts.slice(2).join(';').split(':').map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);
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

function wrapParagraph(text, width) {
  if (width < 1) return [{ s: '', i: 0 }];
  const out = [];
  let i = 0;
  while (i < text.length) {
    out.push({ s: text.slice(i, i + width), i });
    i += width;
  }
  if (text.length === 0) out.push({ s: '', i: 0 });
  return out;
}

function layoutLines(buffer, width) {
  const lines = [];
  const parts = buffer.split('\n');
  let base = 0;
  for (let p = 0; p < parts.length; p++) {
    const seg = parts[p];
    const wrapped = wrapParagraph(seg, width);
    for (const w of wrapped) lines.push({ s: w.s, i: base + w.i });
    base += seg.length + 1;
  }
  return { lines, totalLines: lines.length };
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export default function InputPane({ onSubmit }) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(null); // {a,b}
  const [scrollY, setScrollY] = useState(0);
  const lastEnterHandledAt = useRef(0);
  const dragAnchor = useRef(null);
  const mousePending = useRef('');
  const { stdin } = useStdin();

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const contentWidth = Math.max(10, cols - 4);
  const visibleHeight = 5;

  const layout = useMemo(() => layoutLines(text, contentWidth), [text, contentWidth]);
  const maxScroll = Math.max(0, layout.totalLines - visibleHeight);

  const ensureCaretVisible = (c) => {
    const lines = layout.lines;
    let lineIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const start = lines[i].i;
      const end = i + 1 < lines.length ? lines[i + 1].i : text.length + 1;
      if (c >= start && c <= end) { lineIdx = i; break; }
    }
    if (lineIdx < scrollY) setScrollY(lineIdx);
    else if (lineIdx >= scrollY + visibleHeight) setScrollY(lineIdx - visibleHeight + 1);
  };

  const submit = () => {
    const t = text.trimEnd();
    if (t.length === 0) return;
    onSubmit?.(t);
    setText('');
    setCaret(0);
    setSel(null);
    setScrollY(0);
  };

  const insertText = (s) => {
    if (!s) return;
    setText((t) => {
      let a = caret, b = caret;
      if (sel) { a = Math.min(sel.a, sel.b); b = Math.max(sel.a, sel.b); }
      const nt = t.slice(0, a) + s + t.slice(b);
      const nc = a + s.length;
      setCaret(nc);
      setSel(null);
      return nt;
    });
  };

  const deleteBackward = () => {
    setText((t) => {
      if (sel) {
        const a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
        const nt = t.slice(0, a) + t.slice(b);
        setCaret(a); setSel(null); return nt;
      }
      if (caret <= 0) return t;
      const nt = t.slice(0, caret - 1) + t.slice(caret);
      setCaret(caret - 1);
      return nt;
    });
  };

  const deleteForward = () => {
    setText((t) => {
      if (sel) {
        const a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
        const nt = t.slice(0, a) + t.slice(b);
        setCaret(a); setSel(null); return nt;
      }
      if (caret >= t.length) return t;
      const nt = t.slice(0, caret) + t.slice(caret + 1);
      return nt;
    });
  };

  function mapMouseToLocal(ev) {
    const left = 2;
    const bottomReserved = 1;
    const height = visibleHeight + 2;
    const top = rows - height - bottomReserved + 1;
    const y = ev.y - top + 1;
    const x = ev.x - left + 1;
    return { x, y, inside: x >= 1 && x <= contentWidth && y >= 1 && y <= visibleHeight };
  }

  function indexAtXY(x, y) {
    const lineIdx = clamp(scrollY + (y - 1), 0, layout.totalLines - 1);
    const line = layout.lines[lineIdx] || { s: '', i: 0 };
    const col = clamp(x - 1, 0, line.s.length);
    return line.i + col;
  }

  // Strip SGR mouse sequences from arbitrary chunks, buffering partials
  function stripMouseSeqs(chunk) {
    let s = mousePending.current + chunk;
    mousePending.current = '';
    // Remove full SGR events
    s = s.replace(/\u001b\[<\d+;\d+;\d+[Mm]/g, '');
    // If ends with a partial start, buffer it
    const idx = s.lastIndexOf('\u001b[');
    if (idx !== -1) {
      const tail = s.slice(idx);
      if (/^\u001b\[<\d*;?\d*;?\d*$/.test(tail)) {
        mousePending.current = tail;
        s = s.slice(0, idx);
      }
    }
    return s;
  }

  useEffect(() => {
    if (!stdin) return;
    const cleanupMouse = enableMouse({ stdin, stdout: process.stdout });
    const onMouse = createMouseDataHandler((ev) => {
      const local = mapMouseToLocal(ev);
      if (!local.inside && ev.type !== 'wheel') return;
      if (ev.type === 'wheel') {
        const delta = ev.button === 'wheel_up' ? -1 : 1;
        setScrollY((s) => clamp(s + delta, 0, maxScroll));
        return;
      }
      if (ev.type === 'down') {
        const idx = indexAtXY(local.x, local.y);
        setCaret(idx);
        dragAnchor.current = idx;
        setSel(null);
        ensureCaretVisible(idx);
      } else if (ev.type === 'drag') {
        if (dragAnchor.current != null) {
          const idx = indexAtXY(local.x, local.y);
          setCaret(idx);
          setSel({ a: dragAnchor.current, b: idx });
          ensureCaretVisible(idx);
        }
      } else if (ev.type === 'up') {
        dragAnchor.current = null;
      }
    });
    stdin.on('data', onMouse);
    return () => { stdin.off('data', onMouse); cleanupMouse?.(); };
  }, [stdin, contentWidth, visibleHeight, layout, scrollY, maxScroll]);

  // Single input pipeline using stdin 'data'
  useEffect(() => {
    if (!stdin) return;
    const onData = (buf) => {
      let s = buf.toString('utf8');
      // Drop SGR mouse sequences and partials
      s = stripMouseSeqs(s);

      // CSI-u encoded keys
      if (s.endsWith('u') && (s.startsWith('\u001b[') || s.startsWith('['))) {
        const ev = parseCSIU(s);
        if (ev && (ev.type === undefined || ev.type === 1)) {
          if (ev.code === 13) { if (ev.alt || ev.ctrl) insertText('\n'); else submit(); lastEnterHandledAt.current = Date.now(); return; }
          if (ev.code === 127) { deleteBackward(); return; }
          if (ev.code === 9) { insertText('\t'); return; }
          if (ev.text) { insertText(ev.text); return; }
        }
      }

      // Common non-CSI-U sequences
      if (s === '\r') { submit(); lastEnterHandledAt.current = Date.now(); return; }
      if (s === '\n') { insertText('\n'); lastEnterHandledAt.current = Date.now(); return; }
      if (s === '\u0008' || s === '\u007f') { deleteBackward(); return; } // BS or DEL
      if (s === '\u001b[3~') { deleteForward(); return; } // Delete key

      const safe = sanitizeInputChunk(s);
      if (safe) insertText(safe);
    };
    stdin.on('data', onData);
    return () => stdin.off('data', onData);
  }, [stdin, caret, sel, text, contentWidth, visibleHeight]);

  // Render with selection highlighting and caret
  const renderLines = () => {
    const start = scrollY;
    const end = Math.min(layout.totalLines, start + visibleHeight);
    const items = [];
    for (let li = start; li < end; li++) {
      const line = layout.lines[li] || { s: '', i: 0 };
      const L = line.s.length;
      // Build base pieces for selection
      let pieces = [];
      if (sel) {
        const a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
        const selStart = clamp(a - line.i, 0, L);
        const selEnd = clamp(b - line.i, 0, L);
        if (selStart > 0) pieces.push({ t: line.s.slice(0, selStart), sel: false });
        if (selEnd > selStart) pieces.push({ t: line.s.slice(selStart, selEnd), sel: true });
        if (selEnd < L) pieces.push({ t: line.s.slice(selEnd), sel: false });
        if (L === 0) pieces.push({ t: '', sel: selStart !== selEnd });
      } else {
        pieces = [{ t: line.s, sel: false }];
      }
      // Insert caret visual
      const caretCol = clamp(caret - line.i, 0, L);
      let acc = 0;
      let withCaret = [];
      let inserted = false;
      for (const seg of pieces) {
        const segLen = seg.t.length;
        if (!inserted && caretCol <= acc + segLen) {
          const local = caretCol - acc;
          if (local > 0) withCaret.push({ t: seg.t.slice(0, local), sel: seg.sel });
          // caret visual (inverse space)
          withCaret.push({ t: ' ', sel: false, caret: true });
          if (local < segLen) withCaret.push({ t: seg.t.slice(local), sel: seg.sel });
          inserted = true;
        } else {
          withCaret.push(seg);
        }
        acc += segLen;
      }
      if (!inserted) {
        // caret after end of line
        withCaret.push({ t: ' ', sel: false, caret: true });
      }
      items.push(
        React.createElement(
          Text,
          { key: li - start },
          ...withCaret.map((p, idx) => React.createElement(Text, {
            key: idx,
            inverse: p.caret === true,
            backgroundColor: p.sel ? 'blue' : undefined
          }, p.t || ' '))
        )
      );
    }
    return items;
  };

  return React.createElement(
    Box,
    { flexDirection: 'column', paddingX: 1, width: '100%' },
    ...renderLines(),
    React.createElement(Text, { dimColor: true }, 'Enter to submit • Alt+Enter (or Ctrl+Enter) to newline • Mouse: click/drag/wheel')
  );
}
