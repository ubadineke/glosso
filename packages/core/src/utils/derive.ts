import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';

/**
 * Generate a new 12-word BIP39 mnemonic.
 */
export function generateMnemonic(): string {
  return bip39.generateMnemonic();
}

/**
 * Validate a BIP39 mnemonic.
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Derive a Solana keypair from a BIP39 mnemonic at a given account index.
 *
 * Uses the BIP44 derivation path for Solana: m/44'/501'/{index}'/0'
 * - 44'  = BIP44 purpose
 * - 501' = Solana coin type (SLIP-0044)
 * - {index}' = account index (0 = primary, 1+ = sub-wallets)
 * - 0'   = hardened change index
 *
 * Same mnemonic + same index always produces the same keypair (deterministic).
 */
export function deriveKeypair(mnemonic: string, index: number = 0): Keypair {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid BIP39 mnemonic');
  }

  if (index < 0 || !Number.isInteger(index)) {
    throw new Error('Index must be a non-negative integer');
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const path = `m/44'/501'/${index}'/0'`;
  const { key } = derivePath(path, seed.toString('hex'));

  return Keypair.fromSeed(key);
}

/**
 * Derive the public address for a mnemonic at a given index.
 * Convenience wrapper — does not expose the keypair.
 */
export function deriveAddress(mnemonic: string, index: number = 0): string {
  return deriveKeypair(mnemonic, index).publicKey.toBase58();
}
