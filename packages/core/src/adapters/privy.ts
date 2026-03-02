import {
  Connection,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import { WalletAdapter } from './interface';

/**
 * Privy embedded wallet adapter.
 *
 * Uses Privy's server-side wallet API for key management.
 * Keys are held in Privy's secure enclaves — never on your machine.
 *
 * Requires:
 * - PRIVY_APP_ID
 * - PRIVY_APP_SECRET
 * - PRIVY_WALLET_ID (created during provisioning)
 */
export class PrivyAdapter implements WalletAdapter {
  private connection: Connection;
  private appId: string;
  private appSecret: string;
  private walletId: string;
  private cachedAddress: string | null = null;

  constructor(config?: {
    appId?: string;
    appSecret?: string;
    walletId?: string;
    network?: string;
  }) {
    const network =
      config?.network || process.env.GLOSSO_NETWORK || 'devnet';
    this.connection = new Connection(
      clusterApiUrl(network as 'devnet' | 'mainnet-beta' | 'testnet'),
      'confirmed'
    );

    const appId = config?.appId || process.env.PRIVY_APP_ID;
    if (!appId) {
      throw new Error(
        'PRIVY_APP_ID not set. Get it from https://dashboard.privy.io'
      );
    }
    this.appId = appId;

    const appSecret = config?.appSecret || process.env.PRIVY_APP_SECRET;
    if (!appSecret) {
      throw new Error(
        'PRIVY_APP_SECRET not set. Get it from https://dashboard.privy.io'
      );
    }
    this.appSecret = appSecret;

    const walletId = config?.walletId || process.env.PRIVY_WALLET_ID;
    if (!walletId) {
      throw new Error(
        'PRIVY_WALLET_ID not set. Run `glosso provision --mode privy` first.'
      );
    }
    this.walletId = walletId;
  }

  private getAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64')}`;
  }

  private async privyRequest(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<any> {
    const response = await fetch(`https://auth.privy.io/api/v1${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'privy-app-id': this.appId,
        Authorization: this.getAuthHeader(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Privy API error (${response.status}): ${text}`);
    }

    return response.json();
  }

  /**
   * Get the wallet address.
   * Privy wallets don't support sub-wallet indices —
   * index is ignored (each Privy wallet is a single address).
   */
  async getAddress(_index: number = 0): Promise<string> {
    if (this.cachedAddress) return this.cachedAddress;

    const wallet = await this.privyRequest('GET', `/wallets/${this.walletId}`);
    this.cachedAddress = wallet.address;
    return wallet.address;
  }

  async getBalance(_index: number = 0): Promise<number> {
    const address = await this.getAddress();
    const pubkey = new PublicKey(address);
    const balance = await this.connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Sign a transaction via Privy's signing API.
   */
  async sign(
    transaction: Transaction,
    _index: number = 0
  ): Promise<Transaction> {
    const address = await this.getAddress();

    // Ensure the transaction has a recent blockhash
    if (!transaction.recentBlockhash) {
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
    }

    if (!transaction.feePayer) {
      transaction.feePayer = new PublicKey(address);
    }

    // Serialize the transaction for Privy to sign
    const serialized = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    const result = await this.privyRequest(
      'POST',
      `/wallets/${this.walletId}/rpc`,
      {
        method: 'signTransaction',
        params: {
          encoding: 'base64',
          transaction: serialized,
        },
      }
    );

    // Reconstruct the signed transaction
    const signedBytes = Buffer.from(result.data.signedTransaction, 'base64');
    return Transaction.from(signedBytes);
  }

  async send(
    to: string,
    lamports: number,
    _index: number = 0
  ): Promise<string> {
    const address = await this.getAddress();

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();

    // Use Privy's RPC to sign and send
    const result = await this.privyRequest(
      'POST',
      `/wallets/${this.walletId}/rpc`,
      {
        method: 'signAndSendTransaction',
        caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        params: {
          encoding: 'base64',
          transaction: this.buildTransferBase64(address, to, lamports, blockhash),
        },
      }
    );

    const signature = result.data.hash;

    // Confirm the transaction
    await this.connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed'
    );

    return signature;
  }

  private buildTransferBase64(
    from: string,
    to: string,
    lamports: number,
    blockhash: string
  ): string {
    const { SystemProgram } = require('@solana/web3.js');
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(from),
        toPubkey: new PublicKey(to),
        lamports,
      })
    );
    tx.recentBlockhash = blockhash;
    tx.feePayer = new PublicKey(from);
    return tx.serialize({ requireAllSignatures: false }).toString('base64');
  }
}
