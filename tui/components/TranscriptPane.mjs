import React from 'react';
import { Box, Text } from 'ink';

export default function TranscriptPane({ messages }) {
  return React.createElement(
    Box,
    { flexDirection: 'column', paddingX: 1, width: '100%' },
    messages.length === 0
      ? React.createElement(Text, { dimColor: true }, 'Type a prompt below and press Enter. Shift+Enter inserts a newline.')
      : null,
    ...messages.map((m, i) =>
      React.createElement(
        Box,
        { key: i, flexDirection: 'column', marginBottom: 1 },
        React.createElement(
          Text,
          { color: m.role === 'user' ? 'green' : 'red' },
          m.role === 'user' ? 'You' : 'bmo', ':'
        ),
        React.createElement(Text, null, m.content)
      )
    )
  );
}
