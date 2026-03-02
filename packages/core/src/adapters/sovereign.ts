import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import { WalletAdapter } from './interface';
import { deriveKeypair } from '../utils/derive';
import { decrypt } from '../utils/encrypt';

/**
 * Sovereign (non-custodial) wallet adapter.
 *
 * Keys are never stored in raw form. The BIP39 mnemonic is encrypted
 * in .env and only decrypted momentarily when a signing operation
 * is needed. The derived private key exists only in memory for the
 * duration of the function call.
 *
 * Security properties:
 * - Private key never persists beyond function scope
 * - Mnemonic is AES-256-GCM encrypted at rest
 * - No key material in logs, API responses, or LLM context
 */
export class SovereignAdapter implements WalletAdapter {
  private connection: Connection;
  private encryptedSeed: string;
  private passphrase: string;

  constructor(config?: {
    encryptedSeed?: string;
    passphrase?: string;
    network?: string;
  }) {
    const network =
      config?.network || process.env.GLOSSO_NETWORK || 'devnet';
    this.connection = new Connection(
      clusterApiUrl(network as 'devnet' | 'mainnet-beta' | 'testnet'),
      'confirmed'
    );

    const encryptedSeed =
      config?.encryptedSeed || process.env.GLOSSO_MASTER_SEED_ENCRYPTED;
    if (!encryptedSeed) {
      throw new Error(
        'GLOSSO_MASTER_SEED_ENCRYPTED not set. Run `npx glosso provision --mode sovereign` first.'
      );
    }
    this.encryptedSeed = encryptedSeed;

    const passphrase =
      config?.passphrase || process.env.GLOSSO_ENCRYPTION_PASSPHRASE;
    if (!passphrase) {
      throw new Error(
        'GLOSSO_ENCRYPTION_PASSPHRASE not set. This is required to decrypt the master seed.'
      );
    }
    this.passphrase = passphrase;
  }

  /**
   * Decrypt mnemonic, derive keypair, return it.
   * The mnemonic string is discarded when this function returns.
   */
  private getKeypair(index: number = 0): Keypair {
    const mnemonic = decrypt(this.encryptedSeed, this.passphrase);
    const keypair = deriveKeypair(mnemonic, index);
    // `mnemonic` goes out of scope here — eligible for GC
    return keypair;
  }

  async getAddress(index: number = 0): Promise<string> {
    const keypair = this.getKeypair(index);
    return keypair.publicKey.toBase58();
  }

  async getBalance(index: number = 0): Promise<number> {
    const keypair = this.getKeypair(index);
    const balance = await this.connection.getBalance(keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  async sign(
    transaction: Transaction,
    index: number = 0
  ): Promise<Transaction> {
    const keypair = this.getKeypair(index);

    // Ensure the transaction has a recent blockhash
    if (!transaction.recentBlockhash) {
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
    }

    // Set fee payer if not already set
    if (!transaction.feePayer) {
      transaction.feePayer = keypair.publicKey;
    }

    transaction.partialSign(keypair);
    return transaction;
  }

  async send(
    to: string,
    lamports: number,
    index: number = 0
  ): Promise<string> {
    const keypair = this.getKeypair(index);
    const recipient = new PublicKey(to);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [keypair]
    );

    return signature;
  }
}
