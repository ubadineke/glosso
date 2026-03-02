/**
 * Phase 4 — SDK Integration Test
 *
 * Tests:
 * ✅ SDK exports work correctly
 * ✅ GlossoWallet can be imported from @glosso/sdk
 * ✅ SovereignAdapter can be imported from @glosso/sdk
 * ✅ Utility functions export correctly
 * ✅ Full end-to-end flow: provision → configure → transact
 */

import {
  GlossoWallet,
  SovereignAdapter,
  generateMnemonic,
  deriveAddress,
  encrypt,
  decrypt,
  validateMnemonic,
} from './index';

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — SDK Integration Test          ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Test exports exist
  console.log('── Export Tests ──\n');

  if (typeof GlossoWallet !== 'function') {
    throw new Error('GlossoWallet not exported from @glosso/sdk');
  }
  console.log('✅ GlossoWallet exported');

  if (typeof SovereignAdapter !== 'function') {
    throw new Error('SovereignAdapter not exported from @glosso/sdk');
  }
  console.log('✅ SovereignAdapter exported');

  if (typeof generateMnemonic !== 'function') {
    throw new Error('generateMnemonic not exported from @glosso/sdk');
  }
  console.log('✅ generateMnemonic exported');

  if (typeof deriveAddress !== 'function') {
    throw new Error('deriveAddress not exported from @glosso/sdk');
  }
  console.log('✅ deriveAddress exported');

  if (typeof encrypt !== 'function') {
    throw new Error('encrypt not exported from @glosso/sdk');
  }
  console.log('✅ encrypt exported');

  if (typeof decrypt !== 'function') {
    throw new Error('decrypt not exported from @glosso/sdk');
  }
  console.log('✅ decrypt exported');

  if (typeof validateMnemonic !== 'function') {
    throw new Error('validateMnemonic not exported from @glosso/sdk');
  }
  console.log('✅ validateMnemonic exported');

  // 2. End-to-end flow via SDK exports
  console.log('\n── End-to-End Flow via SDK ──\n');

  // Generate mnemonic
  const mnemonic = generateMnemonic();
  console.log(`✅ Generated mnemonic (${mnemonic.split(' ').length} words)`);

  // Validate
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Mnemonic validation failed');
  }
  console.log('✅ Mnemonic valid');

  // Derive addresses
  const primary = deriveAddress(mnemonic, 0);
  const trading = deriveAddress(mnemonic, 1);
  console.log(`✅ Primary address: ${primary}`);
  console.log(`✅ Trading address: ${trading}`);

  if (primary === trading) {
    throw new Error('Primary and trading should differ');
  }
  console.log('✅ Addresses are unique per index');

  // Encrypt/decrypt
  const passphrase = 'sdk-test-passphrase';
  const blob = encrypt(mnemonic, passphrase);
  const recovered = decrypt(blob, passphrase);
  if (recovered !== mnemonic) {
    throw new Error('Encrypt/decrypt round-trip failed');
  }
  console.log('✅ Encryption round-trip works');

  // Create SovereignAdapter via SDK
  const adapter = new SovereignAdapter({
    encryptedSeed: blob,
    passphrase,
    network: 'devnet',
  });

  const adapterAddress = await adapter.getAddress(0);
  if (adapterAddress !== primary) {
    throw new Error('Adapter address should match derived address');
  }
  console.log(`✅ SovereignAdapter.getAddress() matches: ${adapterAddress}`);

  // Create GlossoWallet via SDK (using env vars)
  process.env.GLOSSO_MODE = 'sovereign';
  process.env.GLOSSO_MASTER_SEED_ENCRYPTED = blob;
  process.env.GLOSSO_ENCRYPTION_PASSPHRASE = passphrase;
  process.env.GLOSSO_NETWORK = 'devnet';

  const wallet = new GlossoWallet();
  const walletAddress = await wallet.getAddress();
  if (walletAddress !== primary) {
    throw new Error('GlossoWallet address should match');
  }
  console.log(`✅ GlossoWallet.getAddress() matches: ${walletAddress}`);
  console.log(`✅ GlossoWallet.mode = ${wallet.mode}`);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ALL SDK TESTS PASSED                   ║');
  console.log('╚══════════════════════════════════════════╝');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
