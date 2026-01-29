import React, { useEffect, useRef, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import TranscriptPane from './components/TranscriptPane.mjs';
import InputPane from './components/InputPane.mjs';
import StatusBar from './components/StatusBar.mjs';
import { ChatEngine } from '../lib/chat.mjs';

export default function App() {
  const { exit } = useApp();
  const [status, setStatus] = useState({ ready: false, streaming: false, model: 'gpt-5', tools: 0 });
  const [messages, setMessages] = useState([]);
  const engineRef = useRef(null);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        engineRef.current = await ChatEngine.init();
        if (mounted) setStatus(s => ({ ...s, ready: true }));
      } catch (e) {
        if (mounted) {
          setStatus(s => ({ ...s, ready: false }));
          setMessages(prev => [...prev, { role: 'assistant', content: `Init error: ${String(e?.message || e)}\nSet OPENAI_API_KEY and try again.` }]);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onSubmit = async (text) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    if (!engineRef.current) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Engine not ready. Ensure OPENAI_API_KEY is set, then restart the TUI.' }]);
      return;
    }
    setStatus(s => ({ ...s, streaming: true }));
    let acc = '';
    try {
      await engineRef.current.startTurn(text, {
        onToken: (t) => {
          acc += t;
          setMessages(prev => {
            const out = [...prev];
            if (out.length && out[out.length - 1].role === 'assistant') {
              out[out.length - 1] = { role: 'assistant', content: acc };
            } else {
              out.push({ role: 'assistant', content: acc });
            }
            return out;
          });
        },
        onToolCall: (tc) => {
          setMessages(prev => [...prev, { role: 'tool', content: `[call] ${tc.function?.name || ''}` }]);
        },
        onToolResult: ({ id, result }) => {
          setMessages(prev => [...prev, { role: 'tool', content: `[result] ${String(result).slice(0, 400)}` }]);
        },
        onAssistantDone: () => {
          setStatus(s => ({ ...s, streaming: false }));
        },
        onError: (e) => {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${String(e?.message || e)}` }]);
        }
      });
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${String(e?.message || e)}` }]);
    } finally {
      setStatus(s => ({ ...s, streaming: false }));
    }
  };

  return React.createElement(
    Box,
    { flexDirection: 'column', height: process.stdout.rows },
    React.createElement(
      Box,
      { flexGrow: 1, borderStyle: 'round', padding: 0 },
      React.createElement(TranscriptPane, { messages })
    ),
    React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Box,
        { borderStyle: 'classic' },
        React.createElement(InputPane, { onSubmit })
      ),
      React.createElement(StatusBar, { status })
    )
  );
}
