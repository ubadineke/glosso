/**
 * Dashboard.tsx — Main TUI dashboard layout.
 *
 * Watches ~/.glosso/activity.log for new events and
 * re-renders the dashboard in real time.
 *
 * Layout:
 * ┌────────────────────────────────────────────────────┐
 * │  GLOSSO │ mode │ address │ network     LIVE │ time │
 * ├──────────┬─────────────────────────────────────────┤
 * │ WALLET   │ ACTIVITY                                │
 * │ SOL 19.5 │ 05:14:07 🔧 open_perp_position         │
 * │          │          ✅ SHORT 0.1 SOL               │
 * │ POSITION │ 05:14:20 🔧 get_sol_price               │
 * │ SHORT    │          ✅ $84.12                       │
 * │ 0.10 SOL │ 05:14:35 💬 "Closing for profit..."     │
 * │          │ 05:14:36 🔧 close_perp_position         │
 * │ AGENT    │          ✅ PnL +$0.12                   │
 * │ Round 3  │                                          │
 * ├──────────┴─────────────────────────────────────────┤
 * │ ░▒▓█▓▒░  TXs: 4  Errors: 0  Last: ✅ close_pos    │
 * └────────────────────────────────────────────────────┘
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Box, useApp, useInput, useStdout } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import { getLogPath, LogEntry } from '@glosso/core';

import { Header } from './components/Header';
import { WalletPanel } from './components/WalletPanel';
import { ActivityFeed } from './components/ActivityFeed';
import { PriceChart } from './components/PriceChart';
import { StatusBar } from './components/StatusBar';

interface DashboardProps {
  sessionFilter?: string;
  logPath?: string;
}

export function Dashboard({ sessionFilter, logPath: customLogPath }: DashboardProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [fileSize, setFileSize] = useState(0);

  const logPath = customLogPath || getLogPath();
  const termHeight = stdout?.rows || 30;
  // Reserve lines for header (3) + status bar (3) + margins
  const feedMaxLines = Math.max(termHeight - 12, 8);

  // Extract session metadata
  let mode = '—';
  let address = '—';
  let network = 'devnet';

  for (const e of entries) {
    if (e.type === 'agent_start') {
      mode = (e.mode as string) || mode;
      address = (e.address as string) || address;
      network = (e.network as string) || network;
    }
  }

  // Check if agent is currently active (last event was recent)
  const lastEntry = entries[entries.length - 1];
  const isLive = lastEntry
    ? Date.now() - new Date(lastEntry.ts).getTime() < 120_000
    : false;

  // Read all entries from the log file
  const readEntries = useCallback(() => {
    if (!fs.existsSync(logPath)) return;

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const parsed: LogEntry[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        if (sessionFilter && entry.id !== sessionFilter) continue;
        parsed.push(entry);
      } catch {
        // skip
      }
    }

    setEntries(parsed);
    try {
      setFileSize(fs.statSync(logPath).size);
    } catch { /* */ }
  }, [logPath, sessionFilter]);

  // Read incremental new entries
  const readNewEntries = useCallback(() => {
    if (!fs.existsSync(logPath)) return;

    let newSize: number;
    try {
      newSize = fs.statSync(logPath).size;
    } catch {
      return;
    }

    if (newSize <= fileSize) {
      if (newSize < fileSize) {
        // File was truncated — full re-read
        readEntries();
      }
      return;
    }

    // Read only new bytes
    const buf = Buffer.alloc(newSize - fileSize);
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buf, 0, buf.length, fileSize);
    fs.closeSync(fd);
    setFileSize(newSize);

    const newLines = buf.toString('utf-8').split('\n').filter(Boolean);
    const newEntries: LogEntry[] = [];

    for (const line of newLines) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        if (sessionFilter && entry.id !== sessionFilter) continue;
        newEntries.push(entry);
      } catch { /* skip */ }
    }

    if (newEntries.length > 0) {
      setEntries((prev) => [...prev, ...newEntries]);
    }
  }, [logPath, fileSize, sessionFilter, readEntries]);

  // Initial load
  useEffect(() => {
    readEntries();
  }, [readEntries]);

  // Watch for file changes
  useEffect(() => {
    const dir = path.dirname(logPath);
    const basename = path.basename(logPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const watcher = fs.watch(dir, (eventType, filename) => {
      if (filename === basename) {
        readNewEntries();
      }
    });

    return () => watcher.close();
  }, [logPath, readNewEntries]);

  // Also poll every 2s as a fallback (fs.watch can miss events)
  useEffect(() => {
    const timer = setInterval(readNewEntries, 2000);
    return () => clearInterval(timer);
  }, [readNewEntries]);

  // Keyboard: q to quit
  useInput((input) => {
    if (input === 'q') exit();
  });

  return (
    <Box flexDirection="column" width="100%">
      <Header mode={mode} address={address} network={network} isLive={isLive} />
      <Box flexDirection="row" flexGrow={1}>
        <WalletPanel entries={entries} mode={mode} address={address} />
        <ActivityFeed entries={entries} maxLines={feedMaxLines} />
        <PriceChart entries={entries} />
      </Box>
      <StatusBar entries={entries} isLive={isLive} />
    </Box>
  );
}
