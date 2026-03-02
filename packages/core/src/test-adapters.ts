/**
 * Phase 5 — Adapter Router Test
 *
 * Tests:
 * ✅ GlossoWallet routes to SovereignAdapter
 * ✅ GlossoWallet routes to PrivyAdapter (config validation)
 * ✅ GlossoWallet routes to TurnkeyAdapter (config validation)
 * ✅ All adapters construct with correct config
 * ✅ Missing config throws clear errors
 * ✅ Invalid mode throws clear error
 */

import { GlossoWallet } from './glosso';
import { SovereignAdapter } from './adapters/sovereign';
import { PrivyAdapter } from './adapters/privy';
import { TurnkeyAdapter } from './adapters/turnkey';
import { generateMnemonic } from './utils/derive';
import { encrypt } from './utils/encrypt';

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — Adapter Router Test           ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Setup: create a sovereign wallet for testing
  const mnemonic = generateMnemonic();
  const passphrase = 'router-test-2026';
  const encryptedSeed = encrypt(mnemonic, passphrase);

  // ── Test 1: Sovereign mode ──
  console.log('── Test 1: Sovereign Mode ──\n');
  
  process.env.GLOSSO_MODE = 'sovereign';
  process.env.GLOSSO_MASTER_SEED_ENCRYPTED = encryptedSeed;
  process.env.GLOSSO_ENCRYPTION_PASSPHRASE = passphrase;
  process.env.GLOSSO_NETWORK = 'devnet';

  const sovereignWallet = new GlossoWallet();
  if (sovereignWallet.mode !== 'sovereign') {
    throw new Error(`Expected mode sovereign, got ${sovereignWallet.mode}`);
  }
  const addr = await sovereignWallet.getAddress();
  console.log(`✅ Sovereign mode works — address: ${addr}`);

  // ── Test 2: Privy mode — config validation ──
  console.log('\n── Test 2: Privy Mode (Config Validation) ──\n');

  // Missing PRIVY_APP_ID should throw
  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.PRIVY_WALLET_ID;

  process.env.GLOSSO_MODE = 'privy';
  let privyMissingConfig = false;
  try {
    new GlossoWallet();
  } catch (e: any) {
    privyMissingConfig = e.message.includes('PRIVY_APP_ID');
  }
  if (!privyMissingConfig) {
    throw new Error('Expected Privy adapter to throw on missing config');
  }
  console.log('✅ Privy mode throws clear error on missing PRIVY_APP_ID');

  // With partial config — missing wallet ID
  process.env.PRIVY_APP_ID = 'test-app-id';
  process.env.PRIVY_APP_SECRET = 'test-app-secret';
  let privyMissingWallet = false;
  try {
    new GlossoWallet();
  } catch (e: any) {
    privyMissingWallet = e.message.includes('PRIVY_WALLET_ID');
  }
  if (!privyMissingWallet) {
    throw new Error('Expected Privy adapter to throw on missing wallet ID');
  }
  console.log('✅ Privy mode throws clear error on missing PRIVY_WALLET_ID');

  // With full config — should construct without error
  process.env.PRIVY_WALLET_ID = 'test-wallet-id';
  const privyWallet = new GlossoWallet();
  if (privyWallet.mode !== 'privy') {
    throw new Error(`Expected mode privy, got ${privyWallet.mode}`);
  }
  console.log('✅ Privy adapter constructs with valid config');

  // ── Test 3: Turnkey mode — config validation ──
  console.log('\n── Test 3: Turnkey Mode (Config Validation) ──\n');

  delete process.env.TURNKEY_ORGANIZATION_ID;
  delete process.env.TURNKEY_API_PUBLIC_KEY;
  delete process.env.TURNKEY_API_PRIVATE_KEY;
  delete process.env.TURNKEY_WALLET_ID;

  process.env.GLOSSO_MODE = 'turnkey';
  let turnkeyMissingConfig = false;
  try {
    new GlossoWallet();
  } catch (e: any) {
    turnkeyMissingConfig = e.message.includes('TURNKEY_ORGANIZATION_ID');
  }
  if (!turnkeyMissingConfig) {
    throw new Error('Expected Turnkey adapter to throw on missing config');
  }
  console.log('✅ Turnkey mode throws clear error on missing TURNKEY_ORGANIZATION_ID');

  // With full config — should construct
  process.env.TURNKEY_ORGANIZATION_ID = 'test-org-id';
  process.env.TURNKEY_API_PUBLIC_KEY = 'test-pub-key';
  process.env.TURNKEY_API_PRIVATE_KEY = 'test-priv-key';
  process.env.TURNKEY_WALLET_ID = 'test-wallet-id';
  
  const turnkeyWallet = new GlossoWallet();
  if (turnkeyWallet.mode !== 'turnkey') {
    throw new Error(`Expected mode turnkey, got ${turnkeyWallet.mode}`);
  }
  console.log('✅ Turnkey adapter constructs with valid config');

  // ── Test 4: Invalid mode ──
  console.log('\n── Test 4: Invalid Mode ──\n');

  process.env.GLOSSO_MODE = 'invalid-mode';
  let invalidModeFailed = false;
  try {
    new GlossoWallet();
  } catch (e: any) {
    invalidModeFailed = e.message.includes('Invalid GLOSSO_MODE');
  }
  if (!invalidModeFailed) {
    throw new Error('Expected error on invalid mode');
  }
  console.log('✅ Invalid mode throws clear error');

  // ── Test 5: Missing mode ──
  console.log('\n── Test 5: Missing Mode ──\n');

  delete process.env.GLOSSO_MODE;
  let missingModeFailed = false;
  try {
    new GlossoWallet();
  } catch (e: any) {
    missingModeFailed = e.message.includes('GLOSSO_MODE');
  }
  if (!missingModeFailed) {
    throw new Error('Expected error when GLOSSO_MODE is not set');
  }
  console.log('✅ Missing GLOSSO_MODE throws clear error');

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ALL ADAPTER ROUTER TESTS PASSED        ║');
  console.log('╚══════════════════════════════════════════╝');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
