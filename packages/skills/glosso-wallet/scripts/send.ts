/**
 * glosso-wallet skill — send script
 *
 * Sends SOL from the configured wallet to a recipient address.
 * Returns the transaction signature and Explorer link.
 *
 * Usage:
 *   tsx scripts/send.ts <recipient> <amount_sol> [--index 0]
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { GlossoWallet } from '@glosso/core';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';

// Auto-load ~/.glosso/.env so the skill works when invoked by an AI agent
const _envFile = `${homedir()}/.glosso/.env`;
if (existsSync(_envFile)) {
  readFileSync(_envFile, 'utf-8').split('\n').forEach(line => {
    const l = line.replace(/^export\s+/, '').trim();
    const i = l.indexOf('=');
    if (i > 0 && !l.startsWith('#')) {
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim().replace(/^"|"$|^'|'$/g, '');
      if (k && !process.env[k]) process.env[k] = v;
    }
  });
}

interface SendResult {
  from: string;
  to: string;
  amountSol: number;
  amountLamports: number;
  signature: string;
  explorer: string;
}

/**
 * Send SOL from wallet at given index to a recipient.
 */
export async function glosso_send(
  to: string,
  amountSol: number,
  index: number = 0
): Promise<SendResult> {
  if (!to || to.length < 30) {
    throw new Error('Invalid recipient address');
  }
  if (amountSol <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const wallet = new GlossoWallet();
  const from = await wallet.getAddress(index);
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

  const signature = await wallet.send(to, lamports, index);
  const network = process.env.GLOSSO_NETWORK || 'devnet';

  return {
    from,
    to,
    amountSol,
    amountLamports: lamports,
    signature,
    explorer: `https://explorer.solana.com/tx/${signature}?cluster=${network}`,
  };
}

// CLI entry point
if (require.main === module || process.argv[1]?.includes('send')) {
  const args = process.argv.slice(2);
  const recipient = args[0];
  const amount = parseFloat(args[1]);
  const indexFlag = args.indexOf('--index');
  const index = indexFlag >= 0 ? parseInt(args[indexFlag + 1], 10) : 0;

  if (!recipient || isNaN(amount)) {
    console.error('Usage: tsx scripts/send.ts <recipient> <amount_sol> [--index 0]');
    process.exit(1);
  }

  glosso_send(recipient, amount, index)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
