/**
 * monitor.ts — Launch the Glosso TUI dashboard.
 *
 * Usage:
 *   npx glosso monitor               — live dashboard
 *   npx glosso monitor --session abc  — filter by session
 */

import { Command } from 'commander';
import { execSync, spawn } from 'child_process';
import * as path from 'path';

export const monitorCommand = new Command('monitor')
  .description('Launch the live TUI activity dashboard')
  .option('-s, --session <id>', 'Filter by session ID')
  .option('--clean', 'Clear the activity log before launching')
  .addHelpText('after', `
Examples:
  glosso monitor                       # full dashboard, all sessions
  glosso monitor --clean               # wipe log then launch (fresh slate)
  glosso monitor --session <id>        # show only one session's events
`)
  .action((opts) => {
    const monitorEntry = path.resolve(
      __dirname,
      '../../monitor/src/index.tsx'
    );

    const args = [monitorEntry];
    if (opts.session) {
      args.push('--session', opts.session);
    }
    if (opts.clean) {
      args.push('--clean');
    }

    // Spawn the monitor as a child process (it needs full TTY control)
    const child = spawn('npx', ['tsx', ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  });
