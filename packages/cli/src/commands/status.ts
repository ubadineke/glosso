import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import {
  Connection,
  clusterApiUrl,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

export const statusCommand = new Command('status')
  .description('Show Glosso wallet status and balances')
  .option('-d, --dir <path>', 'Directory containing .env file', '.')
  .addHelpText('after', `
Examples:
  glosso status                        # reads .env in current directory
  glosso status --dir ./demo
`)
  .action(async (options) => {
    try {
      await runStatus(options);
    } catch (err: any) {
      console.error(`\n❌ Status check failed: ${err.message}`);
      process.exit(1);
    }
  });

async function runStatus(options: { dir: string }) {
  const envPath = path.resolve(options.dir, '.env');

  if (!fs.existsSync(envPath)) {
    throw new Error(`No .env file found at ${envPath}. Run 'glosso provision' first.`);
  }

  // Parse .env file manually (no dotenv dependency)
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
  }

  const mode = env['GLOSSO_MODE'] || 'unknown';
  const network = env['GLOSSO_NETWORK'] || 'devnet';
  const primaryAddress = env['GLOSSO_PRIMARY_ADDRESS'];

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — Wallet Status                 ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`   Mode:     ${mode}`);
  console.log(`   Network:  ${network}`);

  if (!primaryAddress) {
    console.log('   Address:  ⚠️  Not found in .env');
    return;
  }

  console.log(`   Address:  ${primaryAddress}`);

  // Fetch on-chain balance
  try {
    const connection = new Connection(
      clusterApiUrl(network as 'devnet' | 'testnet' | 'mainnet-beta'),
      'confirmed'
    );
    const pubkey = new PublicKey(primaryAddress);
    const balance = await connection.getBalance(pubkey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    console.log(`   Balance:  ${solBalance} SOL`);
    console.log(`\n   Explorer: https://explorer.solana.com/address/${primaryAddress}?cluster=${network}`);
  } catch (err: any) {
    console.log(`   Balance:  ⚠️  Could not fetch (${err.message})`);
  }

  // Check GLOSSO.md
  const mdPath = path.resolve(options.dir, 'GLOSSO.md');
  if (fs.existsSync(mdPath)) {
    console.log(`\n   GLOSSO.md: ✅ present`);
  } else {
    console.log(`\n   GLOSSO.md: ❌ missing — run 'glosso provision' to generate`);
  }
}
