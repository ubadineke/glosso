import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { WalletAdapter, isVersionedTx, AnyTransaction } from './adapters/interface';
import { SovereignAdapter } from './adapters/sovereign';
import { PrivyAdapter } from './adapters/privy';
import { TurnkeyAdapter } from './adapters/turnkey';

/**
 * A Drift-compatible IWallet that delegates all signing to GlossoWallet.
 * No mode-specific logic — works identically for sovereign, turnkey, and privy.
 *
 * Drift's DriftWallet class wraps a raw Keypair and exposes `.payer.secretKey`,
 * which breaks non-sovereign wallets. This adapter satisfies the IWallet
 * interface without ever exposing a secret key.
 */
export interface GlossoDriftWallet {
  publicKey: PublicKey;
  signTransaction(tx: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction>;
  signAllTransactions(txs: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]>;
}

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

  async signVersioned(
    transaction: VersionedTransaction,
    index?: number
  ): Promise<VersionedTransaction> {
    return this.adapter.signVersioned(transaction, index);
  }

  /**
   * Sign any transaction — auto-detects legacy vs versioned.
   * Used internally by toDriftWallet(); prefer sign() / signVersioned()
   * when you know the type at compile time.
   */
  async signAny(tx: AnyTransaction, index?: number): Promise<AnyTransaction> {
    if (isVersionedTx(tx)) return this.signVersioned(tx, index);
    return this.sign(tx, index);
  }

  async send(
    to: string,
    lamports: number,
    index?: number
  ): Promise<string> {
    return this.adapter.send(to, lamports, index);
  }

  /**
   * Returns a Drift SDK–compatible IWallet object.
   *
   * Pass this to DriftClient instead of using `new DriftWallet(keypair)`.
   * All signing is delegated through GlossoWallet — no secret key is ever
   * exposed. Works identically for sovereign, turnkey, and privy modes.
   *
   * Usage:
   *   const wallet = new GlossoWallet();
   *   const driftWallet = await wallet.toDriftWallet();
   *   const driftClient = new DriftClient({ wallet: driftWallet, ... });
   */
  async toDriftWallet(): Promise<GlossoDriftWallet> {
    const address = await this.getAddress();
    const publicKey = new PublicKey(address);

    return {
      publicKey,
      signTransaction: (tx: Transaction | VersionedTransaction) => this.signAny(tx),
      signAllTransactions: async (txs: (Transaction | VersionedTransaction)[]) => {
        const signed: (Transaction | VersionedTransaction)[] = [];
        for (const tx of txs) {
          signed.push(await this.signAny(tx));
        }
        return signed;
      },
    };
  }
}
