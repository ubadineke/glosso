import { Transaction } from '@solana/web3.js';

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
   * Sign a transaction with the keypair at the given index.
   * Returns the signed transaction — does NOT broadcast it.
   */
  sign(transaction: Transaction, index?: number): Promise<Transaction>;

  /**
   * Build, sign, and broadcast a SOL transfer.
   * Returns the transaction signature (verifiable on Explorer).
   */
  send(to: string, lamports: number, index?: number): Promise<string>;
}
