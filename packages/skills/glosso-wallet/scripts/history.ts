/**
 * glosso-wallet skill — history script
 *
 * Fetches recent transactions for the configured wallet.
 * Returns parsed transaction summaries.
 *
 * Usage:
 *   tsx scripts/history.ts [--index 0] [--limit 10]
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';
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

interface TransactionSummary {
  signature: string;
  timestamp: string | null;
  type: string;
  amountSol: number | null;
  from: string | null;
  to: string | null;
  status: 'success' | 'failed';
  explorer: string;
}

interface HistoryResult {
  address: string;
  index: number;
  transactions: TransactionSummary[];
  count: number;
}

/**
 * Get recent transaction history for the wallet at a given index.
 */
export async function glosso_history(
  index: number = 0,
  limit: number = 10
): Promise<HistoryResult> {
  const wallet = new GlossoWallet();
  const address = await wallet.getAddress(index);
  const network = process.env.GLOSSO_NETWORK || 'devnet';

  const connection = new Connection(
    clusterApiUrl(network as 'devnet' | 'testnet' | 'mainnet-beta'),
    'confirmed'
  );
  const pubkey = new PublicKey(address);

  const signatures = await connection.getSignaturesForAddress(pubkey, {
    limit,
  });

  const transactions: TransactionSummary[] = [];

  for (const sig of signatures) {
    let parsed: ParsedTransactionWithMeta | null = null;
    try {
      parsed = await connection.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      // Skip unparseable transactions
    }

    let type = 'unknown';
    let amountSol: number | null = null;
    let from: string | null = null;
    let to: string | null = null;

    if (parsed?.transaction?.message?.instructions) {
      for (const ix of parsed.transaction.message.instructions) {
        if ('parsed' in ix && ix.program === 'system') {
          const info = ix.parsed;
          if (info.type === 'transfer') {
            type = 'transfer';
            amountSol = info.info.lamports / LAMPORTS_PER_SOL;
            from = info.info.source;
            to = info.info.destination;
          } else if (info.type === 'createAccount') {
            type = 'createAccount';
          }
        }
      }
    }

    transactions.push({
      signature: sig.signature,
      timestamp: sig.blockTime
        ? new Date(sig.blockTime * 1000).toISOString()
        : null,
      type,
      amountSol,
      from,
      to,
      status: sig.err ? 'failed' : 'success',
      explorer: `https://explorer.solana.com/tx/${sig.signature}?cluster=${network}`,
    });
  }

  return {
    address,
    index,
    transactions,
    count: transactions.length,
  };
}

// CLI entry point
if (require.main === module || process.argv[1]?.includes('history')) {
  const args = process.argv.slice(2);
  const indexFlag = args.indexOf('--index');
  const index = indexFlag >= 0 ? parseInt(args[indexFlag + 1], 10) : 0;
  const limitFlag = args.indexOf('--limit');
  const limit = limitFlag >= 0 ? parseInt(args[limitFlag + 1], 10) : 10;

  glosso_history(index, limit)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
