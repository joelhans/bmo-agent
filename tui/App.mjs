import React, { useEffect, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import TranscriptPane from './components/TranscriptPane.mjs';
import InputPane from './components/InputPane.mjs';
import StatusBar from './components/StatusBar.mjs';

export default function App() {
  const { exit } = useApp();
  const [status, setStatus] = useState({ ready: true, streaming: false, model: 'gpt-5', tools: 0 });
  const [messages, setMessages] = useState([]); // {role, content, meta?}

  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
  });

  useEffect(() => {
    // Placeholder: later wire ChatEngine init here and set tool count/model
  }, []);

  const onSubmit = async (text) => {
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    // Placeholder: start ChatEngine turn and stream into messages
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
