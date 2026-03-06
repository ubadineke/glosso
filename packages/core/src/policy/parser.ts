/**
 * parser.ts — Extract SOL movement and program IDs from transactions.
 *
 * Handles both legacy (Transaction) and versioned (VersionedTransaction).
 * For SOL amounts, only System Program Transfer instructions are decoded —
 * DeFi protocol deposits/withdrawals require per-IDL discriminator parsing
 * and are not yet supported.
 */

import {
  Transaction,
  VersionedTransaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { isVersionedTx, type AnyTransaction } from '../adapters/interface.js';

const SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();

// System Program Transfer discriminator: little-endian u32 = 2
const TRANSFER_DISCRIMINATOR = Buffer.from([2, 0, 0, 0]);

/**
 * Extract all top-level program IDs from a transaction.
 */
export function extractProgramIds(tx: AnyTransaction): string[] {
  if (isVersionedTx(tx)) {
    return extractProgramIdsVersioned(tx);
  }
  return extractProgramIdsLegacy(tx);
}

function extractProgramIdsLegacy(tx: Transaction): string[] {
  return tx.instructions.map((ix) => ix.programId.toBase58());
}

function extractProgramIdsVersioned(tx: VersionedTransaction): string[] {
  const message = tx.message;
  const accountKeys = message.staticAccountKeys;

  return message.compiledInstructions.map((ix) => {
    const programKey = accountKeys[ix.programIdIndex];
    return programKey ? programKey.toBase58() : 'unknown';
  });
}

/**
 * Count instructions in a transaction.
 */
export function countInstructions(tx: AnyTransaction): number {
  if (isVersionedTx(tx)) {
    return tx.message.compiledInstructions.length;
  }
  return tx.instructions.length;
}

/**
 * Extract total SOL movement from a transaction.
 *
 * Currently only parses System Program Transfer instructions.
 * Returns the total lamports converted to SOL.
 *
 * DeFi protocol-specific instructions (Drift deposits, Jupiter swaps)
 * are NOT parsed — they require per-protocol IDL discriminators.
 */
export function extractSolAmount(tx: AnyTransaction): number {
  if (isVersionedTx(tx)) {
    return extractSolAmountVersioned(tx);
  }
  return extractSolAmountLegacy(tx);
}

function extractSolAmountLegacy(tx: Transaction): number {
  let totalLamports = 0;

  for (const ix of tx.instructions) {
    if (ix.programId.equals(SystemProgram.programId)) {
      const amount = parseSystemTransferAmount(ix.data);
      if (amount !== null) totalLamports += amount;
    }
  }

  return totalLamports / 1e9; // lamports → SOL
}

function extractSolAmountVersioned(tx: VersionedTransaction): number {
  let totalLamports = 0;
  const message = tx.message;
  const accountKeys = message.staticAccountKeys;

  for (const ix of message.compiledInstructions) {
    const programKey = accountKeys[ix.programIdIndex];
    if (programKey && programKey.equals(SystemProgram.programId)) {
      const data = Buffer.from(ix.data);
      const amount = parseSystemTransferAmount(data);
      if (amount !== null) totalLamports += amount;
    }
  }

  return totalLamports / 1e9;
}

/**
 * Parse the lamport amount from a System Program Transfer instruction data buffer.
 *
 * Layout: [discriminator: u32 LE (4 bytes)] [lamports: u64 LE (8 bytes)]
 * Transfer discriminator = 2
 */
function parseSystemTransferAmount(data: Buffer | Uint8Array): number | null {
  const buf = Buffer.from(data);

  // Must be at least 12 bytes: 4 (discriminator) + 8 (amount)
  if (buf.length < 12) return null;

  // Check discriminator = 2 (Transfer)
  if (!buf.subarray(0, 4).equals(TRANSFER_DISCRIMINATOR)) return null;

  // Read lamports as u64 LE — JS can handle up to 2^53, which covers ~9M SOL
  const lo = buf.readUInt32LE(4);
  const hi = buf.readUInt32LE(8);
  return hi * 0x100000000 + lo;
}

/**
 * Check if a Memo program instruction exists in the transaction.
 */
export function hasMemoInstruction(tx: AnyTransaction): boolean {
  const MEMO_PROGRAM_IDS = [
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
    'Memo1UhkJBfCR6MNT9eit18YGv8TV5fU7auQRH8fDBsZ',
  ];

  const programIds = extractProgramIds(tx);
  return programIds.some((pid) => MEMO_PROGRAM_IDS.includes(pid));
}
