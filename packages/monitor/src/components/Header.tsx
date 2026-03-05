/**
 * Header.tsx — Top bar with branding, mode, network, clock.
 */
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  mode: string;
  address: string;
  network: string;
  isLive: boolean;
}

export function Header({ mode, address, network, isLive }: HeaderProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(timer);
  }, []);

  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const dots = isLive ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][tick % 10] : '●';
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—';

  const modeColors: Record<string, string> = {
    sovereign: 'cyan',
    privy: 'magenta',
    turnkey: 'yellow',
  };
  const modeColor = modeColors[mode] || 'white';

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      <Box gap={1}>
        <Text bold color="cyan">GLOSSO</Text>
        <Text color="gray">│</Text>
        <Text color={modeColor}>{mode}</Text>
        <Text color="gray">│</Text>
        <Text color="yellow">{shortAddr}</Text>
        <Text color="gray">│</Text>
        <Text color="magenta">{network}</Text>
      </Box>
      <Box gap={1}>
        <Text color={isLive ? 'green' : 'gray'}>{dots}</Text>
        <Text color={isLive ? 'green' : 'gray'}>{isLive ? 'LIVE' : 'IDLE'}</Text>
        <Text color="gray">│</Text>
        <Text color="gray">{time}</Text>
        <Text color="gray">│</Text>
        <Text color="gray" dimColor>q exit</Text>
      </Box>
    </Box>
  );
}
