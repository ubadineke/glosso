/**
 * Phase 3 — CLI Provisioner Test
 *
 * Tests:
 * ✅ CLI --help works
 * ✅ provision --help works
 * ✅ Sovereign provision creates .env and GLOSSO.md
 * ✅ .env contains correct values
 * ✅ .env does NOT contain raw mnemonic
 * ✅ GLOSSO.md contains correct address and skills
 * ✅ Status command reads provisioned wallet
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLI = 'npx tsx packages/cli/src/index.ts';
const TEST_DIR = path.join(os.tmpdir(), `glosso-test-${Date.now()}`);

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd: path.resolve(__dirname, '../../..') });
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — CLI Provisioner Test          ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. --help
  console.log('── Test: glosso --help ──\n');
  const helpOutput = run(`${CLI} --help`);
  if (!helpOutput.includes('Glosso') || !helpOutput.includes('provision')) {
    throw new Error('--help output missing expected content');
  }
  console.log('✅ glosso --help works\n');

  // 2. provision --help
  console.log('── Test: glosso provision --help ──\n');
  const provHelpOutput = run(`${CLI} provision --help`);
  if (!provHelpOutput.includes('--mode') || !provHelpOutput.includes('--agent')) {
    throw new Error('provision --help missing expected options');
  }
  console.log('✅ glosso provision --help works\n');

  // 3. Sovereign provision
  console.log('── Test: Sovereign Provision ──\n');
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const provOutput = run(
    `${CLI} provision --mode sovereign --agent test-agent --dir ${TEST_DIR} --network devnet --no-airdrop --passphrase test-passphrase-2026`
  );
  console.log(provOutput);

  // 4. Check .env exists and has correct content
  const envPath = path.join(TEST_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env not created at ${envPath}`);
  }
  const envContent = fs.readFileSync(envPath, 'utf-8');
  console.log('✅ .env file created\n');

  // Verify .env contents
  if (!envContent.includes('GLOSSO_MODE=sovereign')) {
    throw new Error('.env missing GLOSSO_MODE=sovereign');
  }
  console.log('✅ .env contains GLOSSO_MODE=sovereign');

  if (!envContent.includes('GLOSSO_NETWORK=devnet')) {
    throw new Error('.env missing GLOSSO_NETWORK=devnet');
  }
  console.log('✅ .env contains GLOSSO_NETWORK=devnet');

  if (!envContent.includes('GLOSSO_MASTER_SEED_ENCRYPTED=')) {
    throw new Error('.env missing encrypted seed');
  }
  console.log('✅ .env contains encrypted master seed');

  if (!envContent.includes('GLOSSO_ENCRYPTION_PASSPHRASE=')) {
    throw new Error('.env missing passphrase');
  }
  console.log('✅ .env contains encryption passphrase');

  if (!envContent.includes('GLOSSO_PRIMARY_ADDRESS=')) {
    throw new Error('.env missing primary address');
  }
  console.log('✅ .env contains primary address');

  // 5. Verify NO raw mnemonic appears
  // Raw mnemonics are 12+ words from BIP39 wordlist — if the env has a space-separated
  // 12-word string NOT in the encrypted blob line, that's a leak
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const [key] = line.split('=');
    if (key === 'GLOSSO_MASTER_SEED_ENCRYPTED') continue; // encrypted is fine
    if (key === 'GLOSSO_ENCRYPTION_PASSPHRASE') continue;
    const value = line.substring(line.indexOf('=') + 1);
    const words = value.split(' ');
    if (words.length >= 12) {
      throw new Error(`Possible raw mnemonic leak in .env key: ${key}`);
    }
  }
  console.log('✅ .env does NOT contain raw mnemonic');

  // 6. Check GLOSSO.md
  const mdPath = path.join(TEST_DIR, 'GLOSSO.md');
  if (!fs.existsSync(mdPath)) {
    throw new Error(`GLOSSO.md not created at ${mdPath}`);
  }
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  console.log('✅ GLOSSO.md file created');

  if (!mdContent.includes('test-agent')) {
    throw new Error('GLOSSO.md missing agent name');
  }
  console.log('✅ GLOSSO.md contains agent name');

  if (!mdContent.includes('sovereign')) {
    throw new Error('GLOSSO.md missing mode');
  }
  console.log('✅ GLOSSO.md contains wallet mode');

  if (!mdContent.includes('glosso-wallet')) {
    throw new Error('GLOSSO.md missing skills');
  }
  console.log('✅ GLOSSO.md lists available skills');

  // Extract address from .env
  const addressLine = lines.find((l) => l.startsWith('GLOSSO_PRIMARY_ADDRESS='));
  const address = addressLine?.split('=')[1];
  if (!address || address.length < 30) {
    throw new Error('Invalid primary address in .env');
  }
  if (!mdContent.includes(address)) {
    throw new Error('GLOSSO.md does not contain the primary address');
  }
  console.log('✅ GLOSSO.md contains correct primary address');

  // 7. Status command
  console.log('\n── Test: glosso status ──\n');
  const statusOutput = run(`${CLI} status --dir ${TEST_DIR}`);
  if (!statusOutput.includes('sovereign') && !statusOutput.includes(address)) {
    throw new Error('Status output missing expected info');
  }
  console.log(statusOutput);
  console.log('✅ glosso status works');

  // Cleanup
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  console.log('\n   🧹 Cleaned up test directory');

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ALL CLI TESTS PASSED                   ║');
  console.log('╚══════════════════════════════════════════╝');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  // Cleanup on failure
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
