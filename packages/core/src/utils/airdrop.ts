import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';

/**
 * Request a devnet SOL airdrop to a given address.
 *
 * @param address - Base58-encoded Solana public key
 * @param amountSol - Amount of SOL to airdrop (default: 1)
 * @param network - Solana cluster (default: 'devnet')
 * @returns The airdrop transaction signature
 */
export async function requestAirdrop(
  address: string,
  amountSol: number = 1,
  network: string = 'devnet'
): Promise<string> {
  if (network !== 'devnet' && network !== 'testnet') {
    throw new Error('Airdrops are only available on devnet and testnet');
  }

  const connection = new Connection(
    clusterApiUrl(network as 'devnet' | 'testnet'),
    'confirmed'
  );
  const publicKey = new PublicKey(address);

  const signature = await connection.requestAirdrop(
    publicKey,
    amountSol * LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}
