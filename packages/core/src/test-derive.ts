/**
 * Phase 1 — Task 1.3: HD Key Derivation Test
 *
 * Tests:
 * ✅ Mnemonic generation works
 * ✅ Deterministic: same mnemonic → same address every time
 * ✅ Sub-wallets: different indices → different addresses
 * ✅ Invalid mnemonic → throws error
 * ✅ Derived keypair can sign data
 */

import { generateMnemonic, deriveKeypair, deriveAddress, validateMnemonic } from './utils/derive';
import nacl from 'tweetnacl';

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — HD Key Derivation Test        ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Generate mnemonic
  const mnemonic = generateMnemonic();
  const wordCount = mnemonic.split(' ').length;
  console.log(`✅ Generated mnemonic (${wordCount} words): ${mnemonic.split(' ').slice(0, 3).join(' ')}...`);

  if (wordCount !== 12) {
    throw new Error(`Expected 12 words, got ${wordCount}`);
  }

  // 2. Validate mnemonic
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Generated mnemonic failed validation');
  }
  console.log('✅ Mnemonic passes BIP39 validation');

  // 3. Deterministic derivation
  const address1a = deriveAddress(mnemonic, 0);
  const address1b = deriveAddress(mnemonic, 0);
  if (address1a !== address1b) {
    throw new Error('Same mnemonic + same index produced different addresses!');
  }
  console.log(`✅ Deterministic — index 0 always produces: ${address1a}`);

  // 4. Different indices → different addresses
  const address0 = deriveAddress(mnemonic, 0);
  const address1 = deriveAddress(mnemonic, 1);
  const address2 = deriveAddress(mnemonic, 2);

  if (address0 === address1 || address1 === address2 || address0 === address2) {
    throw new Error('Different indices produced the same address!');
  }
  console.log(`✅ Sub-wallets produce unique addresses:`);
  console.log(`   Index 0 (primary):  ${address0}`);
  console.log(`   Index 1 (trading):  ${address1}`);
  console.log(`   Index 2 (vault):    ${address2}`);

  // 5. Invalid mnemonic → throws
  let threwOnInvalid = false;
  try {
    deriveKeypair('invalid garbage words that are not a real mnemonic phrase at all', 0);
  } catch {
    threwOnInvalid = true;
  }
  if (!threwOnInvalid) {
    throw new Error('Expected error on invalid mnemonic — got none');
  }
  console.log('✅ Invalid mnemonic correctly throws error');

  // 6. Signing test
  const keypair = deriveKeypair(mnemonic, 0);
  const message = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const signature = nacl.sign.detached(message, keypair.secretKey);
  const verified = nacl.sign.detached.verify(
    message,
    signature,
    keypair.publicKey.toBytes()
  );
  if (!verified) {
    throw new Error('Signature verification failed');
  }
  console.log('✅ Derived keypair can sign and verify data');

  console.log('\n══════════════════════════════════════════');
  console.log('   ALL DERIVATION CHECKS PASSED');
  console.log('══════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
