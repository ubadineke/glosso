/**
 * Phase 2 — Tasks 2.1, 2.2, 2.3: Full Sovereign Adapter Test
 *
 * This test covers:
 * ✅ AES-256-GCM encryption round-trip
 * ✅ Wrong passphrase correctly fails
 * ✅ Sovereign adapter provisions and reads address
 * ✅ Fund from system wallet (no airdrop needed)
 * ✅ Real SOL transfer on devnet (primary → sub-wallet)
 * ✅ GlossoWallet router works with mode=sovereign
 * ✅ GlossoWallet rejects invalid modes
 */

import { 
  Connection, 
  Keypair, 
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  clusterApiUrl,
  PublicKey,
} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateMnemonic } from './utils/derive';
import { encrypt, decrypt } from './utils/encrypt';
import { SovereignAdapter } from './adapters/sovereign';
import { GlossoWallet } from './glosso';

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — Sovereign Adapter Full Test   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── Part 1: Encryption ──────────────────────────────

  console.log('── Encryption Tests ──\n');

  const testPlaintext = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const passphrase = 'test-passphrase-glosso-2026';

  const encrypted = encrypt(testPlaintext, passphrase);
  console.log(`✅ Encrypted mnemonic → ${encrypted.substring(0, 40)}...`);

  const decrypted = decrypt(encrypted, passphrase);
  if (decrypted !== testPlaintext) {
    throw new Error('Decrypt did not return original plaintext');
  }
  console.log('✅ Decrypt returns original plaintext');

  // Wrong passphrase
  let wrongPassFailed = false;
  try {
    decrypt(encrypted, 'wrong-passphrase');
  } catch {
    wrongPassFailed = true;
  }
  if (!wrongPassFailed) {
    throw new Error('Expected decrypt with wrong passphrase to fail');
  }
  console.log('✅ Wrong passphrase correctly throws error');

  // ── Part 2: Sovereign Adapter ───────────────────────

  console.log('\n── Sovereign Adapter Tests ──\n');

  // Generate and encrypt a real mnemonic
  const mnemonic = generateMnemonic();
  const encryptedSeed = encrypt(mnemonic, passphrase);

  // Create adapter with explicit config (not env vars)
  const adapter = new SovereignAdapter({
    encryptedSeed,
    passphrase,
    network: 'devnet',
  });

  // Get primary address
  const primaryAddress = await adapter.getAddress(0);
  console.log(`✅ Primary address: ${primaryAddress}`);

  // Get sub-wallet address
  const tradingAddress = await adapter.getAddress(1);
  console.log(`✅ Trading address: ${tradingAddress}`);

  if (primaryAddress === tradingAddress) {
    throw new Error('Primary and trading addresses should differ');
  }
  console.log('✅ Primary ≠ Trading (different sub-wallets)');

  // Fund from system wallet
  console.log('\n   Loading system wallet...');
  const walletPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  if (!fs.existsSync(walletPath)) {
    throw new Error(`System wallet not found at ${walletPath}`);
  }
  const secretKeyData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const systemWallet = Keypair.fromSecretKey(Uint8Array.from(secretKeyData));
  console.log(`✅ Loaded system wallet: ${systemWallet.publicKey.toBase58()}`);

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  console.log('   Sending 2 SOL from system wallet → primary address...');
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: systemWallet.publicKey,
      toPubkey: new PublicKey(primaryAddress),
      lamports: 2 * LAMPORTS_PER_SOL,
    })
  );
  await sendAndConfirmTransaction(connection, fundTx, [systemWallet]);
  console.log('✅ Funding confirmed');

  // Check balance
  const balance = await adapter.getBalance(0);
  console.log(`✅ Primary balance: ${balance} SOL`);

  if (balance < 1.9) {
    throw new Error(`Expected ≥ 1.9 SOL, got ${balance}`);
  }

  // ── Part 3: Real Transaction ────────────────────────

  console.log('\n── Real Devnet Transaction ──\n');

  const transferAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL
  console.log(`   Sending 0.1 SOL: primary → trading sub-wallet...`);

  const txSignature = await adapter.send(tradingAddress, transferAmount, 0);
  console.log(`✅ Transaction confirmed!`);
  console.log(`   Signature: ${txSignature}`);
  console.log(`   Explorer:  https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);

  // Verify balances
  const primaryAfter = await adapter.getBalance(0);
  const tradingAfter = await adapter.getBalance(1);
  console.log(`\n   Primary balance after:  ${primaryAfter} SOL`);
  console.log(`   Trading balance after:  ${tradingAfter} SOL`);

  if (tradingAfter < 0.09) {
    throw new Error(`Trading wallet should have ~0.1 SOL, got ${tradingAfter}`);
  }
  console.log('✅ Balances verified — transfer succeeded');

  // ── Part 4: GlossoWallet Router ─────────────────────

  console.log('\n── GlossoWallet Router Tests ──\n');

  // Set env vars for GlossoWallet
  process.env.GLOSSO_MODE = 'sovereign';
  process.env.GLOSSO_MASTER_SEED_ENCRYPTED = encryptedSeed;
  process.env.GLOSSO_ENCRYPTION_PASSPHRASE = passphrase;
  process.env.GLOSSO_NETWORK = 'devnet';

  const wallet = new GlossoWallet();
  const walletAddress = await wallet.getAddress();
  if (walletAddress !== primaryAddress) {
    throw new Error('GlossoWallet address should match SovereignAdapter address');
  }
  console.log(`✅ GlossoWallet.getAddress() matches adapter: ${walletAddress}`);

  const walletBalance = await wallet.getBalance();
  console.log(`✅ GlossoWallet.getBalance() = ${walletBalance} SOL`);

  // Test invalid mode
  let invalidModeFailed = false;
  try {
    new GlossoWallet({ mode: 'invalid' });
  } catch {
    invalidModeFailed = true;
  }
  if (!invalidModeFailed) {
    throw new Error('Expected error on invalid mode');
  }
  console.log('✅ Invalid mode correctly throws error');

  // Test Privy stub
  let privyStubFailed = false;
  try {
    new GlossoWallet({ mode: 'privy' });
  } catch (e: any) {
    privyStubFailed = e.message.includes('not yet implemented');
  }
  if (!privyStubFailed) {
    throw new Error('Expected "not yet implemented" for privy mode');
  }
  console.log('✅ Privy mode correctly throws "not yet implemented"');

  // Test Turnkey stub
  let turnkeyStubFailed = false;
  try {
    new GlossoWallet({ mode: 'turnkey' });
  } catch (e: any) {
    turnkeyStubFailed = e.message.includes('not yet implemented');
  }
  if (!turnkeyStubFailed) {
    throw new Error('Expected "not yet implemented" for turnkey mode');
  }
  console.log('✅ Turnkey mode correctly throws "not yet implemented"');

  // ── Summary ─────────────────────────────────────────

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ALL PHASE 2 TESTS PASSED               ║');
  console.log('║                                          ║');
  console.log('║   ✅ Encryption round-trip                ║');
  console.log('║   ✅ Sovereign adapter                    ║');
  console.log('║   ✅ Real devnet transaction               ║');
  console.log('║   ✅ GlossoWallet router                  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n   Verify on Explorer: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
