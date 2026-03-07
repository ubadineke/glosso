/**
 * logs.ts — Pretty-print the Glosso activity log.
 *
 * Usage:
 *   npx glosso logs                 — tail last 50 events
 *   npx glosso logs --follow        — live tail (watch mode)
 *   npx glosso logs --tail 100      — last 100 events
 *   npx glosso logs --session abc12 — filter by session
 *   npx glosso logs --sessions      — list all sessions
 *   npx glosso logs --clear         — wipe the log file
 */

import { Command } from 'commander';
import * as fs from 'fs';
import chalk from 'chalk';
import {
  readLogEntries,
  listSessions,
  getLogPath,
  LogEntry,
} from '@glosso/core';

// ── Pretty formatting ─────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function shortenSig(sig?: string): string {
  if (!sig) return '';
  return sig.length > 12 ? sig.slice(0, 6) + '…' + sig.slice(-4) : sig;
}

function shortenAddr(addr?: string): string {
  if (!addr) return '';
  return addr.length > 12 ? addr.slice(0, 6) + '…' + addr.slice(-4) : addr;
}

function formatEntry(entry: LogEntry): string {
  const time = chalk.gray(formatTime(entry.ts));
  const sid = chalk.gray(`[${entry.id}]`);

  switch (entry.type) {
    case 'agent_start': {
      const mode = chalk.cyan(entry.mode || '?');
      const addr = chalk.yellow(shortenAddr(entry.address as string));
      const net = chalk.magenta(entry.network || 'devnet');
      const model = chalk.white(entry.model || '?');
      return `${time} ${sid} ${chalk.bgCyan.black(' START ')} ${mode} • ${addr} • ${net} • ${model} • ${entry.maxRounds} rounds`;
    }

    case 'agent_round': {
      return `${time} ${sid} ${chalk.bgBlue.white(` ROUND ${entry.round}/${entry.maxRounds} `)}`;
    }

    case 'agent_thinking': {
      const text = (entry.text || '').slice(0, 120);
      return `${time} ${sid} ${chalk.blue('💬')} ${chalk.italic.gray(text)}${(entry.text || '').length > 120 ? '…' : ''}`;
    }

    case 'agent_end': {
      return `${time} ${sid} ${chalk.bgGreen.black(' DONE ')} Session complete (${entry.round} rounds)`;
    }

    case 'tool_call': {
      const args = entry.args ? JSON.stringify(entry.args) : '';
      return `${time} ${sid} ${chalk.yellow('🔧')} ${chalk.white(entry.tool || '?')}${args ? chalk.gray(`(${args})`) : ''}`;
    }

    case 'tool_success': {
      const sig = entry.signature ? chalk.green(shortenSig(entry.signature)) : '';
      const explorer = entry.explorer ? chalk.underline.cyan('↗ explorer') : '';
      let detail = '';

      // Extract human-readable detail from known result shapes
      const r = entry.result as Record<string, unknown> | undefined;
      if (r) {
        if (entry.tool === 'deposit_collateral') {
          detail = chalk.white(`${r.depositedSol} SOL deposited`);
        } else if (entry.tool === 'open_perp_position') {
          detail = chalk.white(`${r.direction} ${r.sizeSol} SOL`);
        } else if (entry.tool === 'close_perp_position') {
          detail = chalk.white(`closed market #${r.closedMarketIndex}`);
        } else if (entry.tool === 'get_sol_price') {
          detail = chalk.white(`SOL = $${r.price}`);
        } else if (entry.tool === 'get_balance') {
          detail = chalk.white(`${r.sol} SOL`);
        } else if (entry.tool === 'get_position') {
          if (r.hasPosition) {
            detail = chalk.white(`${r.direction} ${r.baseSize} SOL • PnL: ${r.unrealizedPnl}`);
          } else {
            detail = chalk.gray('no position');
          }
        } else if (entry.tool === 'send' || entry.tool === 'glosso_send') {
          const to = r.to as string | undefined;
          const shortTo = to ? `${to.slice(0, 6)}…${to.slice(-4)}` : '?';
          detail = chalk.white(`→ ${shortTo}  ${r.amountSol} SOL`);
        }
      }

      const parts = [chalk.green('✅'), detail, sig, explorer].filter(Boolean);
      return `${time} ${sid}   ${parts.join('  ')}`;
    }

    case 'tool_error': {
      const err = (entry.error || '').slice(0, 90);
      return `${time} ${sid}   ${chalk.red('✖')} ${chalk.red.bold(entry.tool || '?')}  ${chalk.red.dim(err)}`;
    }

    case 'price_check': {
      const r = entry.result as Record<string, unknown> | undefined;
      if (r) {
        return `${time} ${sid} ${chalk.green('✅')} ${chalk.white(`${r.symbol} = $${r.price}`)}`;
      }
      return `${time} ${sid} ${chalk.green('✅')} price check`;
    }

    case 'balance_check': {
      const r = entry.result as Record<string, unknown> | undefined;
      if (r) {
        return `${time} ${sid} ${chalk.green('✅')} ${chalk.white(`${r.sol} SOL`)} ${chalk.gray(`(${shortenAddr(r.address as string)})`)}`;
      }
      return `${time} ${sid} ${chalk.green('✅')} balance check`;
    }

    default:
      return `${time} ${sid} ${chalk.gray(entry.type)} ${chalk.gray(JSON.stringify(entry).slice(0, 80))}`;
  }
}

// ── Follow mode (live tail via fs.watch) ──────────────────

function followLog(logPath: string, sessionFilter?: string): void {
  console.log(chalk.gray(`\n  Watching ${logPath} — press Ctrl+C to stop\n`));

  let fileSize = 0;
  try {
    fileSize = fs.statSync(logPath).size;
  } catch {
    // file doesn't exist yet — that's fine, we'll wait
  }

  // Print last 10 entries first
  const recent = readLogEntries({ tail: 10, logPath });
  for (const entry of recent) {
    if (sessionFilter && entry.id !== sessionFilter) continue;
    console.log(formatEntry(entry));
  }

  console.log(chalk.gray('  ─── live ───'));

  const dir = require('path').dirname(logPath);
  const basename = require('path').basename(logPath);

  // Ensure directory exists for watcher
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.watch(dir, (eventType: string, filename: string | null) => {
    if (filename !== basename) return;

    let newSize: number;
    try {
      newSize = fs.statSync(logPath).size;
    } catch {
      return;
    }

    if (newSize <= fileSize) {
      fileSize = newSize;
      return;
    }

    // Read only new bytes
    const buf = Buffer.alloc(newSize - fileSize);
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buf, 0, buf.length, fileSize);
    fs.closeSync(fd);
    fileSize = newSize;

    const newLines = buf.toString('utf-8').split('\n').filter(Boolean);
    for (const line of newLines) {
      try {
        const entry: LogEntry = JSON.parse(line);
        if (sessionFilter && entry.id !== sessionFilter) continue;
        console.log(formatEntry(entry));
      } catch {
        // skip
      }
    }
  });
}

// ── Command ───────────────────────────────────────────────

export const logsCommand = new Command('logs')
  .description('View the Glosso activity log')
  .option('-f, --follow', 'Live tail — watch for new events')
  .option('-t, --tail <n>', 'Number of recent events to show', '50')
  .option('-s, --session <id>', 'Filter by session ID')
  .option('--sessions', 'List all session IDs')
  .option('--clear', 'Wipe the activity log')
  .addHelpText('after', `
Examples:
  glosso logs                          # last 50 events
  glosso logs --tail 100
  glosso logs --follow                 # live tail (Ctrl+C to stop)
  glosso logs --sessions               # list all session IDs
  glosso logs --session <id>           # filter to one session
  glosso logs --clear                  # wipe the log file
`)
  .action((opts) => {
    const logPath = getLogPath();

    // Clear mode
    if (opts.clear) {
      if (fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, '', 'utf-8');
        console.log(chalk.green(`  ✓ Activity log cleared: ${logPath}`));
      } else {
        console.log(chalk.gray(`  Log file does not exist yet: ${logPath}`));
      }
      return;
    }

    // List sessions mode
    if (opts.sessions) {
      const sessions = listSessions(logPath);
      if (sessions.length === 0) {
        console.log(chalk.gray('  No sessions found in log.'));
        return;
      }
      console.log(chalk.cyan('\n  Sessions:\n'));
      for (const s of sessions) {
        // Get first event to show start time
        const first = readLogEntries({ sessionId: s, logPath })[0];
        const count = readLogEntries({ sessionId: s, logPath }).length;
        const time = first ? formatTime(first.ts) : '?';
        const mode = (first as any)?.mode || '';
        console.log(`    ${chalk.yellow(s)}  ${chalk.gray(time)}  ${chalk.cyan(mode)}  ${chalk.gray(`${count} events`)}`);
      }
      console.log();
      return;
    }

    // Follow mode
    if (opts.follow) {
      followLog(logPath, opts.session);
      return;
    }

    // Static tail
    const entries = readLogEntries({
      tail: parseInt(opts.tail, 10),
      sessionId: opts.session,
      logPath,
    });

    if (entries.length === 0) {
      console.log(chalk.gray('\n  No log entries found.\n'));
      if (!fs.existsSync(logPath)) {
        console.log(chalk.gray(`  Log file: ${logPath} (does not exist yet)\n`));
        console.log(chalk.gray('  Run the agent to generate activity:\n'));
        console.log(chalk.white('    cd demo && npx tsx src/agent.ts\n'));
      }
      return;
    }

    console.log();
    for (const entry of entries) {
      console.log(formatEntry(entry));
    }
    console.log();
  });
