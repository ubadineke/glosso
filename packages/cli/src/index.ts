#!/usr/bin/env node

import { Command } from 'commander';
import { provisionCommand } from './commands/provision.js';
import { statusCommand } from './commands/status.js';
import { switchCommand } from './commands/switch.js';
import { logsCommand } from './commands/logs.js';
import { monitorCommand } from './commands/monitor.js';
import { policyCommand } from './commands/policy.js';

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
program.addCommand(policyCommand);

program.parse(process.argv);
