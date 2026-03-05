/**
 * StatusBar.tsx — Bottom bar with live stats and pulse animation.
 */
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { LogEntry } from '@glosso/core';

interface StatusBarProps {
  entries: LogEntry[];
  isLive: boolean;
}

export function StatusBar({ entries, isLive }: StatusBarProps) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => p + 1), 300);
    return () => clearInterval(timer);
  }, []);

  // Stats
  let txCount = 0;
  let errorCount = 0;
  let lastTool = '—';
  let lastStatus = '';

  for (const e of entries) {
    if (e.type === 'tool_success' && e.signature) txCount++;
    if (e.type === 'tool_error') errorCount++;
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === 'tool_call' || e.type === 'tool_success' || e.type === 'tool_error') {
      lastTool = e.tool || '—';
      lastStatus = e.type === 'tool_error' ? '❌' : e.type === 'tool_success' ? '✅' : '🔧';
      break;
    }
  }

  // Pulse bar — animated blocks showing activity
  const barWidth = 20;
  const pulseChars = '░▒▓█▓▒░';
  const bar = isLive
    ? Array.from({ length: barWidth }, (_, i) => {
        const phase = (pulse + i) % pulseChars.length;
        return pulseChars[phase];
      }).join('')
    : '░'.repeat(barWidth);

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      <Box gap={1}>
        <Text color={isLive ? 'green' : 'gray'}>{bar}</Text>
      </Box>
      <Box gap={2}>
        <Box gap={1}>
          <Text color="gray">TXs:</Text>
          <Text color="green" bold>{txCount}</Text>
        </Box>
        <Box gap={1}>
          <Text color="gray">Errors:</Text>
          <Text color={errorCount > 0 ? 'red' : 'gray'} bold>{errorCount}</Text>
        </Box>
        <Box gap={1}>
          <Text color="gray">Last:</Text>
          <Text>{lastStatus}</Text>
          <Text color="white">{lastTool}</Text>
        </Box>
      </Box>
    </Box>
  );
}
