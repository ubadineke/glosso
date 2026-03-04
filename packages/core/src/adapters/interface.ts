import { Transaction, VersionedTransaction } from '@solana/web3.js';

/** Union type for both legacy and versioned transactions. */
export type AnyTransaction = Transaction | VersionedTransaction;

/** Type guard: returns true if the transaction is a VersionedTransaction. */
export function isVersionedTx(tx: AnyTransaction): tx is VersionedTransaction {
  return 'version' in tx;
}

/**
 * The universal wallet adapter interface.
 *
 * Every wallet backend (Sovereign, Privy, Turnkey) implements this
 * identical interface. Agent code never changes — only the .env config
 * determines which adapter runs underneath.
 */
export interface WalletAdapter {
  /**
   * Get the public wallet address at the given sub-wallet index.
   * Index 0 = primary wallet. Index 1+ = purpose-specific sub-wallets.
   */
  getAddress(index?: number): Promise<string>;

  /**
   * Get the SOL balance (in SOL, not lamports) at the given index.
   */
  getBalance(index?: number): Promise<number>;

  /**
   * Sign a legacy transaction with the keypair at the given index.
   * Returns the signed transaction — does NOT broadcast it.
   */
  sign(transaction: Transaction, index?: number): Promise<Transaction>;

  /**
   * Sign a versioned transaction with the keypair at the given index.
   * Returns the signed transaction — does NOT broadcast it.
   */
  signVersioned(transaction: VersionedTransaction, index?: number): Promise<VersionedTransaction>;

  /**
   * Build, sign, and broadcast a SOL transfer.
   * Returns the transaction signature (verifiable on Explorer).
   */
  send(to: string, lamports: number, index?: number): Promise<string>;
}
