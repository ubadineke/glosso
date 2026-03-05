/**
 * ActivityFeed.tsx — Right panel: scrolling event feed.
 *
 * Shows real-time events as they happen with color-coded entries,
 * animated separators for rounds, and human-readable tool results.
 */
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { LogEntry } from '@glosso/core';

interface ActivityFeedProps {
  entries: LogEntry[];
  maxLines: number;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
}

function shortenSig(sig?: string): string {
  if (!sig) return '';
  return sig.length > 12 ? sig.slice(0, 6) + '…' + sig.slice(-4) : sig;
}

function renderEntry(entry: LogEntry, idx: number): React.ReactNode {
  const time = formatTime(entry.ts);
  const key = `${entry.ts}-${idx}`;

  switch (entry.type) {
    case 'agent_start':
      return (
        <Box key={key} flexDirection="column">
          <Text color="cyan" bold>
            ─── SESSION START ───────────────────────────
          </Text>
          <Box gap={1}>
            <Text color="gray">{time}</Text>
            <Text color="cyan" bold>▶</Text>
            <Text color="white">
              {entry.mode} • {entry.network} • {entry.model}
            </Text>
          </Box>
        </Box>
      );

    case 'agent_round':
      return (
        <Box key={key} marginTop={0}>
          <Text color="gray">{time}</Text>
          <Text color="blue" bold>
            {' '}■ ROUND {entry.round}/{entry.maxRounds} ─────────────────
          </Text>
        </Box>
      );

    case 'agent_thinking': {
      const text = (entry.text || '').slice(0, 100);
      const truncated = (entry.text || '').length > 100;
      return (
        <Box key={key} gap={1}>
          <Text color="gray">{time}</Text>
          <Text color="blue">💬</Text>
          <Text color="white" dimColor italic>
            {text}{truncated ? '…' : ''}
          </Text>
        </Box>
      );
    }

    case 'agent_end':
      return (
        <Box key={key} flexDirection="column">
          <Text color="green" bold>
            ─── SESSION COMPLETE ────────────────────────
          </Text>
        </Box>
      );

    case 'tool_call': {
      const args = entry.args && Object.keys(entry.args).length > 0
        ? JSON.stringify(entry.args)
        : '';
      return (
        <Box key={key} gap={1}>
          <Text color="gray">{time}</Text>
          <Text color="yellow">🔧</Text>
          <Text color="white" bold>{entry.tool}</Text>
          {args ? <Text color="gray">{args}</Text> : null}
        </Box>
      );
    }

    case 'tool_success': {
      const r = entry.result as Record<string, unknown> | undefined;
      let detail = '';

      if (r) {
        if (entry.tool === 'deposit_collateral') {
          detail = `${r.depositedSol} SOL deposited`;
        } else if (entry.tool === 'open_perp_position') {
          detail = `${(r.direction as string)?.toUpperCase()} ${r.sizeSol} SOL`;
        } else if (entry.tool === 'close_perp_position') {
          detail = `position closed`;
        } else if (entry.tool === 'get_sol_price' || entry.tool === 'price_check') {
          detail = `$${r.price}`;
        } else if (entry.tool === 'get_balance') {
          detail = `${r.sol} SOL`;
        } else if (entry.tool === 'get_position') {
          if (r.hasPosition) {
            const dir = (r.direction as string)?.toUpperCase();
            detail = `${dir} ${r.baseSize} SOL  PnL: ${r.unrealizedPnl}`;
          } else {
            detail = 'no position';
          }
        } else if (entry.tool === 'send' || entry.tool === 'glosso_send') {
          const to = r.to as string | undefined;
          const shortTo = to ? `→ ${to.slice(0, 6)}…${to.slice(-4)}` : '';
          detail = `${shortTo}  ${r.amountSol} SOL sent`;
        } else {
          detail = JSON.stringify(r).slice(0, 60);
        }
      }

      return (
        <Box key={key} flexDirection="column">
          <Box gap={1}>
            <Text color="gray">{time}</Text>
            <Text color="green">✅</Text>
            <Text color="white">{detail}</Text>
          </Box>
          {entry.signature ? (
            <Box gap={1} marginLeft={10}>
              <Text color="green" dimColor>{shortenSig(entry.signature)}</Text>
              <Text color="cyan" dimColor>↗ explorer</Text>
            </Box>
          ) : null}
        </Box>
      );
    }

    case 'tool_error': {
      const errMsg = (entry.error || '').slice(0, 72);
      return (
        <Box key={key} flexDirection="column">
          <Box gap={1}>
            <Text color="gray">{time}</Text>
            <Text color="red" bold>✖ {entry.tool}</Text>
          </Box>
          <Box marginLeft={10}>
            <Text color="red" dimColor>{errMsg}</Text>
          </Box>
        </Box>
      );
    }

    case 'price_check': {
      const r = entry.result as Record<string, unknown> | undefined;
      return (
        <Box key={key} gap={1}>
          <Text color="gray">{time}</Text>
          <Text color="green">✅</Text>
          <Text color="white">{String(r?.symbol ?? '')} = ${String(r?.price ?? '')}</Text>
        </Box>
      );
    }

    case 'balance_check': {
      const r = entry.result as Record<string, unknown> | undefined;
      return (
        <Box key={key} gap={1}>
          <Text color="gray">{time}</Text>
          <Text color="green">✅</Text>
          <Text color="white">{String(r?.sol ?? '')} SOL</Text>
        </Box>
      );
    }

    default:
      return (
        <Box key={key} gap={1}>
          <Text color="gray">{time}</Text>
          <Text color="gray">{entry.type}</Text>
        </Box>
      );
  }
}

export function ActivityFeed({ entries, maxLines }: ActivityFeedProps) {
  // Show only the most recent entries that fit
  const visible = entries.slice(-maxLines);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Text bold color="cyan">ACTIVITY</Text>
      {visible.length === 0 ? (
        <Text color="gray" dimColor>
          Waiting for agent activity…
        </Text>
      ) : (
        visible.map((entry, idx) => renderEntry(entry, idx))
      )}
    </Box>
  );
}
