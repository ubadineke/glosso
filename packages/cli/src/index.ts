#!/usr/bin/env node

import { Command } from 'commander';
import { provisionCommand } from './commands/provision';
import { statusCommand } from './commands/status';

const program = new Command();

program
  .name('glosso')
  .description('Glosso — Agentic Wallet Infrastructure for Solana')
  .version('0.1.0');

program.addCommand(provisionCommand);
program.addCommand(statusCommand);

program.parse(process.argv);
