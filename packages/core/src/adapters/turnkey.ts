import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import { WalletAdapter } from './interface';

/**
 * Turnkey wallet adapter.
 *
 * Uses Turnkey's server SDK for key management and signing.
 * Keys are held in Turnkey's HSMs — never on your machine.
 * Transactions are signed via stamped API requests.
 *
 * Requires:
 * - TURNKEY_ORGANIZATION_ID
 * - TURNKEY_API_PUBLIC_KEY
 * - TURNKEY_API_PRIVATE_KEY
 * - TURNKEY_WALLET_ID (created during provisioning)
 */
export class TurnkeyAdapter implements WalletAdapter {
  private connection: Connection;
  private orgId: string;
  private apiPublicKey: string;
  private apiPrivateKey: string;
  private walletId: string;
  private cachedAddress: string | null = null;

  constructor(config?: {
    orgId?: string;
    apiPublicKey?: string;
    apiPrivateKey?: string;
    walletId?: string;
    network?: string;
  }) {
    const network =
      config?.network || process.env.GLOSSO_NETWORK || 'devnet';
    this.connection = new Connection(
      clusterApiUrl(network as 'devnet' | 'mainnet-beta' | 'testnet'),
      'confirmed'
    );

    const orgId = config?.orgId || process.env.TURNKEY_ORGANIZATION_ID;
    if (!orgId) {
      throw new Error(
        'TURNKEY_ORGANIZATION_ID not set. Get it from https://dashboard.turnkey.com'
      );
    }
    this.orgId = orgId;

    const apiPublicKey =
      config?.apiPublicKey || process.env.TURNKEY_API_PUBLIC_KEY;
    if (!apiPublicKey) {
      throw new Error(
        'TURNKEY_API_PUBLIC_KEY not set. Get it from Turnkey dashboard.'
      );
    }
    this.apiPublicKey = apiPublicKey;

    const apiPrivateKey =
      config?.apiPrivateKey || process.env.TURNKEY_API_PRIVATE_KEY;
    if (!apiPrivateKey) {
      throw new Error(
        'TURNKEY_API_PRIVATE_KEY not set. Get it from Turnkey dashboard.'
      );
    }
    this.apiPrivateKey = apiPrivateKey;

    const walletId = config?.walletId || process.env.TURNKEY_WALLET_ID;
    if (!walletId) {
      throw new Error(
        'TURNKEY_WALLET_ID not set. Run `glosso provision --mode turnkey` first.'
      );
    }
    this.walletId = walletId;
  }

  /**
   * Get or create the Turnkey API client.
   */
  private async getClient(): Promise<any> {
    const { Turnkey } = await import('@turnkey/sdk-server');
    const turnkey = new Turnkey({
      apiBaseUrl: 'https://api.turnkey.com',
      apiPublicKey: this.apiPublicKey,
      apiPrivateKey: this.apiPrivateKey,
      defaultOrganizationId: this.orgId,
    });
    return turnkey.apiClient();
  }

  /**
   * Get the Solana signer from Turnkey SDK.
   */
  private async getSigner(): Promise<any> {
    const { TurnkeySigner } = await import('@turnkey/solana');
    const { Turnkey } = await import('@turnkey/sdk-server');
    
    const turnkey = new Turnkey({
      apiBaseUrl: 'https://api.turnkey.com',
      apiPublicKey: this.apiPublicKey,
      apiPrivateKey: this.apiPrivateKey,
      defaultOrganizationId: this.orgId,
    });

    const client = await turnkey.apiClient();

    return new TurnkeySigner({
      organizationId: this.orgId,
      client: client as any,
    });
  }

  /**
   * Get the wallet address.
   * Turnkey wallets use a single address per wallet account.
   */
  async getAddress(_index: number = 0): Promise<string> {
    if (this.cachedAddress) return this.cachedAddress;

    const client = await this.getClient();
    const wallet = await client.getWallet({
      walletId: this.walletId,
    });

    // The first account's address in the wallet
    const accounts = await client.getWalletAccounts({
      walletId: this.walletId,
    });

    if (!accounts.accounts || accounts.accounts.length === 0) {
      throw new Error('No accounts found in Turnkey wallet');
    }

    this.cachedAddress = accounts.accounts[0].address;
    return this.cachedAddress!;
  }

  async getBalance(_index: number = 0): Promise<number> {
    const address = await this.getAddress();
    const pubkey = new PublicKey(address);
    const balance = await this.connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Sign a legacy transaction via Turnkey's signing infrastructure.
   */
  async sign(
    transaction: Transaction,
    _index: number = 0
  ): Promise<Transaction> {
    const signer = await this.getSigner();
    const address = await this.getAddress();

    // Ensure the transaction has a recent blockhash
    if (!transaction.recentBlockhash) {
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
    }

    if (!transaction.feePayer) {
      transaction.feePayer = new PublicKey(address);
    }

    // Sign via Turnkey
    await signer.addSignature(transaction, address);
    return transaction;
  }

  /**
   * Sign a versioned transaction via Turnkey's signing infrastructure.
   */
  async signVersioned(
    transaction: VersionedTransaction,
    _index: number = 0
  ): Promise<VersionedTransaction> {
    const signer = await this.getSigner();
    const address = await this.getAddress();

    // TurnkeySigner.addSignature handles both Transaction and VersionedTransaction
    await signer.addSignature(transaction, address);
    return transaction;
  }

  async send(
    to: string,
    lamports: number,
    _index: number = 0
  ): Promise<string> {
    const address = await this.getAddress();
    const fromPubkey = new PublicKey(address);
    const toPubkey = new PublicKey(to);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
      })
    );

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    // Sign via Turnkey
    const signer = await this.getSigner();
    await signer.addSignature(transaction, address);

    // Broadcast
    const rawTransaction = transaction.serialize();
    const signature = await this.connection.sendRawTransaction(
      rawTransaction,
      { skipPreflight: false }
    );

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
}
