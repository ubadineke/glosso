 /**
 * Test all Glosso skill modules (Phase 6)
 *
 * Tests:
 *   1. glosso-pyth: price feeds (no wallet needed)
 *   2. glosso-wallet: balance check
 *   3. glosso-jupiter: devnet quote
 *
 * Usage: tsx packages/skills/test-skills.ts
 */

import { generateMnemonic } from '../../packages/core/src/utils/derive';
import { encrypt } from '../../packages/core/src/utils/encrypt';

async function setupWalletEnv() {
  // Self-provision a sovereign wallet for testing
  const mnemonic = generateMnemonic();
  const passphrase = 'test-skills-passphrase-2025';
  const encrypted = encrypt(mnemonic, passphrase);

  process.env.GLOSSO_MODE = 'sovereign';
  process.env.GLOSSO_MASTER_SEED_ENCRYPTED = encrypted;
  process.env.GLOSSO_ENCRYPTION_PASSPHRASE = passphrase;
  process.env.GLOSSO_NETWORK = 'devnet';
}

async function main() {
  // Set up wallet env vars before any tests
  await setupWalletEnv();

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║    Glosso Skills — Integration Tests      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  let passed = 0;
  let failed = 0;

  // ── Test 1: Pyth Price Feeds ──────────────────────────
  console.log('── Test 1: glosso-pyth (price feeds) ──');
  try {
    const { glosso_price, glosso_supported_feeds } = await import(
      './glosso-pyth/scripts/price'
    );

    // Test supported feeds
    const feeds = glosso_supported_feeds();
    if (!Array.isArray(feeds) || feeds.length === 0) {
      throw new Error('glosso_supported_feeds returned empty');
    }
    console.log(`  ✅ Supported feeds: ${feeds.length} pairs`);
    passed++;

    // Test single price fetch
    const prices = await glosso_price('SOL/USD');
    if (!Array.isArray(prices) || prices.length !== 1) {
      throw new Error('glosso_price did not return 1 result');
    }
    const sol = prices[0];
    if (typeof sol.price !== 'number' || sol.price <= 0) {
      throw new Error(`Invalid SOL price: ${sol.price}`);
    }
    console.log(`  ✅ SOL/USD: $${sol.price.toFixed(2)} (±$${sol.confidence.toFixed(4)})`);
    passed++;

    // Test multi-price fetch
    const multi = await glosso_price('BTC/USD', 'ETH/USD');
    if (multi.length !== 2) {
      throw new Error(`Expected 2 prices, got ${multi.length}`);
    }
    console.log(
      `  ✅ Multi-fetch: BTC=$${multi[0].price.toFixed(0)}, ETH=$${multi[1].price.toFixed(0)}`
    );
    passed++;
  } catch (e: any) {
    console.log(`  ❌ FAILED: ${e.message}`);
    failed++;
  }

  console.log('');

  // ── Test 2: Wallet Balance ──────────────────────────
  console.log('── Test 2: glosso-wallet (balance) ──');
  try {
    const { glosso_balance } = await import(
      './glosso-wallet/scripts/balance'
    );

    const result = await glosso_balance(0, false);
    if (!result.address || result.address.length < 30) {
      throw new Error('Invalid address returned');
    }
    if (typeof result.sol !== 'number') {
      throw new Error('Balance is not a number');
    }
    console.log(`  ✅ Address: ${result.address}`);
    console.log(`  ✅ Balance: ${result.sol} SOL`);
    passed++;
  } catch (e: any) {
    console.log(`  ❌ FAILED: ${e.message}`);
    failed++;
  }

  console.log('');

  // ── Test 3: Wallet History ──────────────────────────
  console.log('── Test 3: glosso-wallet (history) ──');
  try {
    const { glosso_history } = await import(
      './glosso-wallet/scripts/history'
    );

    const result = await glosso_history(0, 3);
    if (!result.address || result.address.length < 30) {
      throw new Error('Invalid address returned');
    }
    console.log(`  ✅ Address: ${result.address}`);
    console.log(`  ✅ Transactions found: ${result.count}`);
    if (result.transactions.length > 0) {
      const tx = result.transactions[0];
      console.log(`  ✅ Latest: ${tx.type} — ${tx.status}`);
    }
    passed++;
  } catch (e: any) {
    console.log(`  ❌ FAILED: ${e.message}`);
    failed++;
  }

  console.log('');

  // ── Test 4: Jupiter Quote (devnet) ──────────────────
  console.log('── Test 4: glosso-jupiter (quote, devnet) ──');
  try {
    const { glosso_quote, glosso_supported_tokens } = await import(
      './glosso-jupiter/scripts/swap'
    );

    // Test supported tokens
    const tokens = glosso_supported_tokens();
    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new Error('glosso_supported_tokens returned empty');
    }
    console.log(`  ✅ Supported tokens: ${tokens.join(', ')}`);
    passed++;

    // Test quote
    const quote = await glosso_quote('SOL', 'USDC', 0.1);
    if (quote.inputToken !== 'SOL' || quote.outputToken !== 'USDC') {
      throw new Error('Quote tokens mismatch');
    }
    if (quote.outputAmount <= 0) {
      throw new Error('Quote output amount must be > 0');
    }
    console.log(
      `  ✅ Quote: 0.1 SOL → ${quote.outputAmount} USDC (impact: ${quote.priceImpact}%)`
    );
    console.log(`  ✅ Route: ${quote.route}`);
    console.log(`  ✅ Network: ${quote.network}`);
    passed++;
  } catch (e: any) {
    console.log(`  ❌ FAILED: ${e.message}`);
    failed++;
  }

  console.log('');

  // ── Summary ──────────────────────────
  console.log('╔══════════════════════════════════════════╗');
  console.log(`║   Results: ${passed} passed, ${failed} failed               ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
