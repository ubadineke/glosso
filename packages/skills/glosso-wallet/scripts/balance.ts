/**
 * glosso-wallet skill — balance script
 *
 * Reads wallet balance (SOL + SPL tokens) for the configured wallet.
 * Can be called by an AI agent to check available funds.
 *
 * Usage:
 *   tsx scripts/balance.ts [--index 0] [--tokens]
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  GlossoWallet,
  SovereignAdapter,
} from '@glosso/core';
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

interface BalanceResult {
  address: string;
  index: number;
  sol: number;
  tokens: Array<{
    mint: string;
    amount: number;
    decimals: number;
  }>;
}

/**
 * Get the SOL and SPL token balances for a wallet at a given index.
 */
export async function glosso_balance(
  index: number = 0,
  includeTokens: boolean = false
): Promise<BalanceResult> {
  const wallet = new GlossoWallet();
  const address = await wallet.getAddress(index);
  const sol = await wallet.getBalance(index);

  const result: BalanceResult = {
    address,
    index,
    sol,
    tokens: [],
  };

  if (includeTokens) {
    const network = process.env.GLOSSO_NETWORK || 'devnet';
    const connection = new Connection(
      clusterApiUrl(network as 'devnet' | 'testnet' | 'mainnet-beta'),
      'confirmed'
    );
    const pubkey = new PublicKey(address);

    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        pubkey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );

      for (const { account } of tokenAccounts.value) {
        const info = account.data.parsed.info;
        result.tokens.push({
          mint: info.mint,
          amount: parseFloat(info.tokenAmount.uiAmountString || '0'),
          decimals: info.tokenAmount.decimals,
        });
      }
    } catch {
      // No token accounts — that's fine
    }
  }

  return result;
}

// CLI entry point
if (require.main === module || process.argv[1]?.includes('balance')) {
  const args = process.argv.slice(2);
  const indexFlag = args.indexOf('--index');
  const index = indexFlag >= 0 ? parseInt(args[indexFlag + 1], 10) : 0;
  const includeTokens = args.includes('--tokens');

  glosso_balance(index, includeTokens)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
