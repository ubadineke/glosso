import { Transaction } from '@solana/web3.js';
import { WalletAdapter } from './adapters/interface';
import { SovereignAdapter } from './adapters/sovereign';
import { PrivyAdapter } from './adapters/privy';
import { TurnkeyAdapter } from './adapters/turnkey';

/**
 * GlossoWallet — the unified wallet interface for AI agents.
 *
 * Reads GLOSSO_MODE from the environment and routes all operations
 * to the correct backend adapter. Agent code is always identical
 * regardless of which wallet mode is configured underneath.
 *
 * Usage:
 *   const wallet = new GlossoWallet();
 *   const address = await wallet.getAddress();
 *   const balance = await wallet.getBalance();
 *   await wallet.send(recipientAddress, 100_000);
 */
export class GlossoWallet implements WalletAdapter {
  private adapter: WalletAdapter;
  public readonly mode: string;

  constructor(config?: { mode?: string }) {
    const mode = config?.mode || process.env.GLOSSO_MODE;

    if (!mode) {
      throw new Error(
        'GLOSSO_MODE not set. Run `npx glosso provision` first, or set GLOSSO_MODE in your .env file.'
      );
    }

    this.mode = mode;

    switch (mode) {
      case 'sovereign':
        this.adapter = new SovereignAdapter();
        break;

      case 'privy':
        this.adapter = new PrivyAdapter();
        break;

      case 'turnkey':
        this.adapter = new TurnkeyAdapter();
        break;

      default:
        throw new Error(
          `Invalid GLOSSO_MODE: "${mode}". Must be one of: sovereign, privy, turnkey`
        );
    }
  }

  async getAddress(index?: number): Promise<string> {
    return this.adapter.getAddress(index);
  }

  async getBalance(index?: number): Promise<number> {
    return this.adapter.getBalance(index);
  }

  async sign(
    transaction: Transaction,
    index?: number
  ): Promise<Transaction> {
    return this.adapter.sign(transaction, index);
  }

  async send(
    to: string,
    lamports: number,
    index?: number
  ): Promise<string> {
    return this.adapter.send(to, lamports, index);
  }
}
