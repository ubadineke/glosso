#!/usr/bin/env tsx
/**
 * @glosso/monitor — Live TUI dashboard for Glosso agent activity.
 *
 * Usage:
 *   npx tsx packages/monitor/src/index.tsx
 *   npx tsx packages/monitor/src/index.tsx --clean           — wipe log before starting
 *   npx tsx packages/monitor/src/index.tsx --session abc12345
 *   npx tsx packages/monitor/src/index.tsx --log /path/to/activity.log
 *
 * Press 'q' to exit.
 */
import React from 'react';
import { render } from 'ink';
import * as fs from 'fs';
import { getLogPath } from '@glosso/core';
import { Dashboard } from './Dashboard';

// Parse CLI args
const args = process.argv.slice(2);
const sessionIdx = args.indexOf('--session');
const sessionFilter = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;
const logIdx = args.indexOf('--log');
const logPath = logIdx >= 0 ? args[logIdx + 1] : undefined;
const isClean = args.includes('--clean');

// Wipe the log file before starting (optional fresh slate)
if (isClean) {
  const target = logPath || getLogPath();
  if (fs.existsSync(target)) {
    fs.writeFileSync(target, '', 'utf-8');
  }
}

// Clear screen for immersive feel
process.stdout.write('\x1B[2J\x1B[3J\x1B[H');

render(
  <Dashboard sessionFilter={sessionFilter} logPath={logPath} />,
  { exitOnCtrlC: true }
);
