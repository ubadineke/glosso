/**
 * WalletPanel.tsx — Left sidebar: wallet info, balance, position.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { LogEntry } from '@glosso/core';

interface WalletPanelProps {
  entries: LogEntry[];
  mode: string;
  address: string;
}

export function WalletPanel({ entries, mode, address }: WalletPanelProps) {
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—';

  // Extract latest balance from entries
  let latestBalance: number | null = null;
  let latestPosition: {
    hasPosition: boolean;
    direction: string | null;
    baseSize: number;
    unrealizedPnl: number;
  } | null = null;

  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!latestBalance && e.type === 'tool_success' && e.tool === 'get_balance') {
      latestBalance = (e.result as any)?.sol ?? null;
    }
    if (!latestBalance && e.type === 'balance_check') {
      latestBalance = (e.result as any)?.sol ?? null;
    }
    if (!latestPosition && e.type === 'tool_success' && e.tool === 'get_position') {
      latestPosition = e.result as any;
    }
    if (latestBalance !== null && latestPosition) break;
  }

  // Count transactions
  let txCount = 0;
  let successCount = 0;
  let errorCount = 0;
  for (const e of entries) {
    if (e.type === 'tool_call') txCount++;
    if (e.type === 'tool_success' && e.signature) successCount++;
    if (e.type === 'tool_error') errorCount++;
  }

  // Get current round
  let currentRound = 0;
  let maxRounds = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === 'agent_round') {
      currentRound = entries[i].round || 0;
      maxRounds = entries[i].maxRounds || 0;
      break;
    }
    if (entries[i].type === 'agent_start') {
      maxRounds = (entries[i].maxRounds as number) || 0;
      break;
    }
  }

  const pnlStr = latestPosition?.unrealizedPnl !== undefined
    ? latestPosition.unrealizedPnl.toFixed(4)
    : '—';
  const pnlColor = latestPosition?.unrealizedPnl
    ? latestPosition.unrealizedPnl >= 0 ? 'green' : 'red'
    : 'gray';

  return (
    <Box flexDirection="column" width={24} borderStyle="single" borderColor="gray" paddingX={1}>
      {/* Wallet Section */}
      <Text bold color="cyan">WALLET</Text>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray">Mode  </Text>
          <Text color="cyan">{mode}</Text>
        </Box>
        <Box>
          <Text color="gray">Addr  </Text>
          <Text color="yellow">{shortAddr}</Text>
        </Box>
        <Box>
          <Text color="gray">SOL   </Text>
          <Text color="white" bold>{latestBalance !== null ? latestBalance.toFixed(2) : '—'}</Text>
        </Box>
      </Box>

      {/* Position Section */}
      <Text bold color="cyan">POSITION</Text>
      <Box flexDirection="column" marginBottom={1}>
        {latestPosition?.hasPosition ? (
          <>
            <Box>
              <Text color="gray">Dir   </Text>
              <Text color={latestPosition.direction === 'long' ? 'green' : 'red'} bold>
                {latestPosition.direction?.toUpperCase()}
              </Text>
            </Box>
            <Box>
              <Text color="gray">Size  </Text>
              <Text color="white">{latestPosition.baseSize} SOL</Text>
            </Box>
            <Box>
              <Text color="gray">PnL   </Text>
              <Text color={pnlColor}>{pnlStr}</Text>
            </Box>
          </>
        ) : (
          <Text color="gray" dimColor>no open position</Text>
        )}
      </Box>

      {/* Agent Section */}
      <Text bold color="cyan">AGENT</Text>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray">Round </Text>
          <Text color="white">{currentRound || '—'}</Text>
          <Text color="gray">/{maxRounds || '—'}</Text>
        </Box>
        <Box>
          <Text color="gray">Calls </Text>
          <Text color="white">{txCount}</Text>
        </Box>
        <Box>
          <Text color="gray">TXs   </Text>
          <Text color="green">{successCount}</Text>
        </Box>
        <Box>
          <Text color="gray">Errs  </Text>
          <Text color={errorCount > 0 ? 'red' : 'gray'}>{errorCount}</Text>
        </Box>
      </Box>
    </Box>
  );
}
