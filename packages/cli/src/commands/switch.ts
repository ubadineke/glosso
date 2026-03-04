import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import {
  loadEnvFile,
  parseEnvFile,
  serializeEnvFile,
  upsertHeaderKey,
  upsertSectionKey,
  readHeaderKey,
  readSectionKey,
  listProvisionedModes,
  MODE_TO_LABEL,
  WALLET_ADDRESS_KEY,
} from '../utils/env';

export const switchCommand = new Command('switch')
  .description('Switch the active wallet mode to an already-provisioned wallet')
  .option('-m, --mode <mode>', 'Target wallet mode: sovereign, privy, or turnkey')
  .option('-d, --dir <path>', 'Directory containing .env file', '.')
  .option('-l, --list', 'List all provisioned modes without switching')
  .action(async (options) => {
    try {
      await runSwitch(options);
    } catch (err: any) {
      console.error(`\n❌ Switch failed: ${err.message}`);
      process.exit(1);
    }
  });

interface SwitchOptions {
  mode?: string;
  dir: string;
  list?: boolean;
}

async function runSwitch(options: SwitchOptions) {
  const outputDir = path.resolve(options.dir);
  const envPath = path.join(outputDir, '.env');

  // Load env so process.env reflects current state
  loadEnvFile(envPath);

  if (!fs.existsSync(envPath)) {
    throw new Error(
      `No .env file found at ${envPath}.\n` +
      'Run `npx glosso provision --mode <mode>` first to create a wallet.'
    );
  }

  const envFile = parseEnvFile(envPath);
  const currentMode = process.env.GLOSSO_MODE || 'none';
  const currentAddress = readHeaderKey(envFile.header, 'GLOSSO_PRIMARY_ADDRESS');

  // ── Auto-migrate: backfill per-mode wallet address for the current mode ──
  // Older .env files only stored the address in the header. Before switching,
  // persist it into the current mode's section so we can switch back later.
  if (currentMode !== 'none' && currentAddress) {
    const curLabel = MODE_TO_LABEL[currentMode];
    if (curLabel && envFile.sections.has(curLabel)) {
      const curAddrKey = WALLET_ADDRESS_KEY[curLabel];
      if (!readSectionKey(envFile, curLabel, curAddrKey)) {
        upsertSectionKey(envFile, curLabel, curAddrKey, currentAddress);
      }
    }
  }

  const provisioned = listProvisionedModes(envFile);

  // ── List mode ─────────────────────────────────────────
  if (options.list || !options.mode) {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   GLOSSO — Provisioned Wallets           ║');
    console.log('╚══════════════════════════════════════════╝\n');

    if (provisioned.length === 0) {
      console.log('   No wallets provisioned yet.');
      console.log('   Run `npx glosso provision --mode <mode>` to create one.\n');
      return;
    }

    for (const { mode, address } of provisioned) {
      const active = mode === currentMode ? ' ← active' : '';
      console.log(`   ${mode.padEnd(10)} ${address}${active}`);
    }

    console.log(`\n   Active mode: ${currentMode}`);
    console.log('   Switch with: npx glosso switch --mode <mode>\n');
    return;
  }

  // ── Switch mode ───────────────────────────────────────
  const targetMode = options.mode;

  if (!['sovereign', 'privy', 'turnkey'].includes(targetMode)) {
    throw new Error(
      `Invalid mode "${targetMode}". Must be one of: sovereign, privy, turnkey`
    );
  }

  if (targetMode === currentMode) {
    console.log(`\n   Already on "${targetMode}" mode — nothing to do.\n`);
    return;
  }

  // Check that the target mode was previously provisioned
  const label = MODE_TO_LABEL[targetMode];
  const addrKey = WALLET_ADDRESS_KEY[label];
  let targetAddress = readSectionKey(envFile, label, addrKey);

  // Fallback for .env files provisioned before per-mode address keys existed
  if (!targetAddress) {
    const sectionLines = envFile.sections.get(label);
    if (!sectionLines || !sectionLines.some((l) => /^\s*[A-Z0-9_]+=/.test(l))) {
      // Section doesn't exist at all
      const available = provisioned.map((p) => p.mode).join(', ') || 'none';
      throw new Error(
        `Mode "${targetMode}" has not been provisioned yet.\n` +
        `   Available modes: ${available}\n` +
        `   Run \`npx glosso provision --mode ${targetMode}\` first.`
      );
    }
    // Section exists but no explicit address key — try to find address
    // from sovereign sub-wallet comments
    for (const line of sectionLines) {
      const m = line.match(/^#\s+Index\s+0\s+\(primary\):\s+(\S+)/);
      if (m) { targetAddress = m[1]; break; }
    }

    // For Privy/Turnkey: resolve the wallet address from the API using stored credentials
    if (!targetAddress && targetMode === 'privy') {
      const appId = readSectionKey(envFile, label, 'PRIVY_APP_ID');
      const appSecret = readSectionKey(envFile, label, 'PRIVY_APP_SECRET');
      const walletId = readSectionKey(envFile, label, 'PRIVY_WALLET_ID');
      if (appId && appSecret && walletId) {
        console.log('   Resolving Privy wallet address from API...');
        try {
          const authHeader = `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`;
          const res = await fetch(`https://auth.privy.io/api/v1/wallets/${walletId}`, {
            headers: { 'privy-app-id': appId, Authorization: authHeader },
          });
          if (res.ok) {
            const data = await res.json() as { address: string };
            targetAddress = data.address;
          }
        } catch { /* fall through to error */ }
      }
    }

    if (!targetAddress && targetMode === 'turnkey') {
      const orgId = readSectionKey(envFile, label, 'TURNKEY_ORGANIZATION_ID');
      const apiPub = readSectionKey(envFile, label, 'TURNKEY_API_PUBLIC_KEY');
      const apiPriv = readSectionKey(envFile, label, 'TURNKEY_API_PRIVATE_KEY');
      const walletId = readSectionKey(envFile, label, 'TURNKEY_WALLET_ID');
      if (orgId && apiPub && apiPriv && walletId) {
        console.log('   Resolving Turnkey wallet address from API...');
        try {
          const { Turnkey } = await import('@turnkey/sdk-server');
          const turnkey = new Turnkey({
            apiBaseUrl: 'https://api.turnkey.com',
            apiPublicKey: apiPub,
            apiPrivateKey: apiPriv,
            defaultOrganizationId: orgId,
          });
          const client = await turnkey.apiClient();
          const accounts = await client.getWalletAccounts({ walletId });
          if (accounts.accounts?.length) {
            targetAddress = accounts.accounts[0].address;
          }
        } catch { /* fall through to error */ }
      }
    }

    // If we resolved the address, persist it so future switches are instant
    if (targetAddress) {
      upsertSectionKey(envFile, label, addrKey, targetAddress);
      console.log(`   ✅ Migrated: ${addrKey}=${targetAddress}`);
    } else {
      throw new Error(
        `Mode "${targetMode}" section exists but wallet address could not be resolved.\n` +
        `   Re-provision with \`npx glosso provision --mode ${targetMode}\` to fix.`
      );
    }
  }

  // Perform the switch: update header keys
  upsertHeaderKey(envFile.header, 'GLOSSO_MODE', targetMode);
  upsertHeaderKey(envFile.header, 'GLOSSO_PRIMARY_ADDRESS', targetAddress);

  fs.writeFileSync(envPath, serializeEnvFile(envFile), 'utf-8');

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — Mode Switched                 ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`   Previous: ${currentMode}`);
  console.log(`   Active:   ${targetMode}\n`);
  console.log(`   Your active wallet is now ${targetAddress}`);
  console.log('   All previous wallet credentials are preserved.');
  console.log('   Switch back anytime with `npx glosso switch --mode <mode>`.\n');
}
