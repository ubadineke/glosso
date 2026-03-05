/**
 * PriceChart.tsx — Right panel: SOL/USD sparkline + TX stats.
 *
 * Extracts price history from log entries and renders an ASCII
 * bar chart using Unicode block characters (▁▂▃▄▅▆▇█).
 * Also tracks on-chain TX success/failure counts.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { LogEntry } from '@glosso/core';

interface PriceChartProps {
  entries: LogEntry[];
}

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const CHART_WIDTH = 20;

function sparkline(prices: number[]): string {
  if (prices.length === 0) return '';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return prices
    .map((p) => BLOCKS[Math.round(((p - min) / range) * (BLOCKS.length - 1))])
    .join('');
}

// Build a fixed-width bar chart column (vertical bars, horizontal time axis)
function barChart(prices: number[], width: number): string[] {
  if (prices.length === 0) return [];
  const min = Math.floor(Math.min(...prices));
  const max = Math.ceil(Math.max(...prices));
  const rows: string[] = [];

  // Use 6 rows height
  const HEIGHT = 6;
  const range = max - min || 1;

  // Downsample/upsample to fit width
  const sampled: number[] = [];
  for (let i = 0; i < width; i++) {
    const srcIdx = Math.round((i / (width - 1)) * (prices.length - 1));
    sampled.push(prices[Math.min(srcIdx, prices.length - 1)]);
  }

  for (let row = HEIGHT - 1; row >= 0; row--) {
    const threshold = min + (range * (row + 1)) / HEIGHT;
    let line = '';
    for (const p of sampled) {
      if (p >= threshold) {
        line += '█';
      } else if (p >= threshold - range / HEIGHT) {
        line += '▄';
      } else {
        line += ' ';
      }
    }
    rows.push(line);
  }

  return rows;
}

function colorForChange(change: number | null): string {
  if (change === null) return 'white';
  if (change > 0.5) return 'green';
  if (change < -0.5) return 'red';
  return 'yellow';
}

export function PriceChart({ entries }: PriceChartProps) {
  // Extract price points from tool_success for get_sol_price/price_check
  const priceHistory: { price: number; ts: string }[] = [];
  let txSuccess = 0;
  let txFail = 0;
  let totalToolCalls = 0;
  const failedTools: string[] = [];

  for (const e of entries) {
    if (
      e.type === 'tool_success' &&
      (e.tool === 'get_sol_price' || e.tool === 'price_check')
    ) {
      const r = e.result as Record<string, unknown> | undefined;
      const p = Number(r?.price);
      if (!isNaN(p) && p > 0) priceHistory.push({ price: p, ts: e.ts });
    }
    if (e.type === 'tool_call') totalToolCalls++;
    if (e.type === 'tool_success' && e.signature) txSuccess++;
    if (e.type === 'tool_error') {
      txFail++;
      if (e.tool && !failedTools.includes(e.tool)) {
        failedTools.push(e.tool);
      }
    }
  }

  const last = priceHistory.slice(-CHART_WIDTH);
  const prices = last.map((x) => x.price);
  const currentPrice = prices[prices.length - 1];
  const firstPrice = prices[0];
  const change =
    currentPrice !== undefined && firstPrice !== undefined && firstPrice !== 0
      ? ((currentPrice - firstPrice) / firstPrice) * 100
      : null;
  const high = prices.length > 0 ? Math.max(...prices) : null;
  const low = prices.length > 0 ? Math.min(...prices) : null;
  const isUp = change !== null && change >= 0;
  const chartRows = barChart(prices, CHART_WIDTH);
  const changeColor = colorForChange(change);

  return (
    <Box
      flexDirection="column"
      width={28}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      {/* Title */}
      <Text bold color="cyan">SOL / USD</Text>

      {/* Current price + change */}
      {currentPrice !== undefined ? (
        <Box gap={1} marginBottom={0}>
          <Text color="white" bold>${currentPrice.toFixed(2)}</Text>
          {change !== null && (
            <Text color={changeColor}>
              {isUp ? '▲' : '▼'}{Math.abs(change).toFixed(2)}%
            </Text>
          )}
        </Box>
      ) : (
        <Text color="gray" dimColor>no price data</Text>
      )}

      {/* Sparkline */}
      <Box marginTop={0} marginBottom={0}>
        <Text color={isUp ? 'green' : 'red'}>{sparkline(prices)}</Text>
      </Box>

      {/* Bar chart */}
      {chartRows.length > 0 && (
        <Box flexDirection="column" marginBottom={0}>
          {chartRows.map((row, i) => (
            <Text key={i} color={isUp ? 'green' : 'red'} dimColor={i < chartRows.length - 2}>{row}</Text>
          ))}
        </Box>
      )}

      {/* High / Low */}
      {high !== null && low !== null && (
        <Box justifyContent="space-between" marginBottom={1}>
          <Text color="gray" dimColor>L{low.toFixed(1)}</Text>
          <Text color="gray" dimColor>H{high.toFixed(1)}</Text>
        </Box>
      )}

      <Text bold color="cyan">TX STATS</Text>

      {/* Success rate bar */}
      {totalToolCalls > 0 && (() => {
        const total = txSuccess + txFail;
        const rate = total > 0 ? txSuccess / total : 1;
        const filled = Math.round(rate * (CHART_WIDTH - 4));
        const empty = (CHART_WIDTH - 4) - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return (
          <Box flexDirection="column" marginBottom={0}>
            <Text color={txFail > 0 ? 'yellow' : 'green'}>{bar}</Text>
            <Box justifyContent="space-between">
              <Text color="green">✅ {txSuccess}</Text>
              <Text color={txFail > 0 ? 'red' : 'gray'}>❌ {txFail}</Text>
            </Box>
          </Box>
        );
      })()}

      {/* Failed tool names */}
      {failedTools.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text color="red" dimColor>failed:</Text>
          {failedTools.slice(-3).map((t) => (
            <Text key={t} color="red" dimColor> · {t}</Text>
          ))}
        </Box>
      )}

      {/* Sample count */}
      <Box marginTop={0}>
        <Text color="gray" dimColor>
          {priceHistory.length} price pts
        </Text>
      </Box>
    </Box>
  );
}
