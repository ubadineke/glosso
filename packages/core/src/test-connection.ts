/**
 * Phase 1 — Task 1.2: Verify Solana Devnet Connection
 *
 * Tests:
 * ✅ RPC connection works (slot number prints)
 * ✅ Load local wallet from filesystem
 * ✅ Balance reads correctly
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — Devnet Connection Test        ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const slot = await connection.getSlot();
  console.log(`✅ Connected to devnet — current slot: ${slot}`);

  // 2. Load local wallet from Solana CLI default location
  const walletPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  
  if (!fs.existsSync(walletPath)) {
    throw new Error(
      `Wallet not found at ${walletPath}\n` +
      `   Run: solana-keygen new --outfile ~/.config/solana/id.json\n` +
      `   Or set a custom path by modifying this test file.`
    );
  }

  const secretKeyData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyData));
  console.log(`✅ Loaded local wallet — address: ${keypair.publicKey.toBase58()}`);

  // 3. Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  const solBalance = balance / LAMPORTS_PER_SOL;
  console.log(`✅ Balance: ${solBalance} SOL`);

  console.log('\n══════════════════════════════════════════');
  console.log('   ALL CHECKS PASSED — devnet is live');
  console.log('══════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
