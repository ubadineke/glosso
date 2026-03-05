#!/usr/bin/env tsx

import { Command } from 'commander';
import { provisionCommand } from './commands/provision';
import { statusCommand } from './commands/status';
import { switchCommand } from './commands/switch';
import { logsCommand } from './commands/logs';
import { monitorCommand } from './commands/monitor';

const program = new Command();

program
  .name('glosso')
  .description('Glosso — Agentic Wallet Infrastructure for Solana')
  .version('0.1.0');

program.addCommand(provisionCommand);
program.addCommand(statusCommand);
program.addCommand(switchCommand);
program.addCommand(logsCommand);
program.addCommand(monitorCommand);

program.parse(process.argv);
