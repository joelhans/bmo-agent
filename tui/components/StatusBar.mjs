import React from 'react';
import { Box, Text } from 'ink';

export default function StatusBar({ status }) {
  const { ready, streaming, model, tools } = status || {};
  return React.createElement(
    Box,
    { width: '100%', paddingX: 1 },
    React.createElement(Text, { dimColor: true }, ready ? 'Ready' : 'Init', ' • '),
    React.createElement(Text, { color: streaming ? 'yellow' : 'gray' }, streaming ? 'Streaming…' : 'Idle'),
    React.createElement(Text, null, ' • Model: ', model),
    React.createElement(Text, null, ' • Tools: ', String(tools)),
    React.createElement(Text, { dimColor: true }, ' • Ctrl+C to exit')
  );
}
