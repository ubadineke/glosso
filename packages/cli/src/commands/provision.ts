import { Command } from 'commander';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  generateMnemonic,
  deriveAddress,
  encrypt,
} from '@glosso/core';
import { generateGlossoMd } from '../generate-md.js';
import {
  loadEnvFile,
  parseEnvFile,
  serializeEnvFile,
  upsertHeaderKey,
  reconcileKeys,
  ENV_FILE_HEADER_COMMENT,
  WALLET_ADDRESS_KEY,
} from '../utils/env.js';

export const provisionCommand = new Command('provision')
  .description('Provision a new Glosso wallet for an AI agent')
  .option('-m, --mode <mode>', 'Wallet mode: sovereign, privy, or turnkey', 'sovereign')
  .option('-a, --agent <name>', 'Agent name (used for display and GLOSSO.md)', 'default-agent')
  .option('-d, --dir <path>', 'Output directory for .env and GLOSSO.md', '.')
  .option('-n, --network <network>', 'Solana network: devnet, testnet, mainnet-beta', 'devnet')
  .option('--passphrase <passphrase>', 'Encryption passphrase (auto-generated if omitted)')
  .option('--sub-wallets <count>', 'Number of sub-wallets to derive', '3')
  .addHelpText('after', `
Examples:
  glosso provision                                         # sovereign, devnet, current dir
  glosso provision --mode privy --network mainnet-beta
  glosso provision --mode turnkey --agent my-trader --dir ./demo
  glosso provision --mode sovereign --passphrase "my-strong-pass" --sub-wallets 5
`)
  .action(async (options) => {
    try {
      await runProvision(options);
    } catch (err: any) {
      console.error(`\n❌ Provisioning failed: ${err.message}`);
      process.exit(1);
    }
  });

interface ProvisionOptions {
  mode: string;
  agent: string;
  dir: string;
  network: string;
  passphrase?: string;
  subWallets: string;
}

async function runProvision(options: ProvisionOptions) {
  const { mode, agent, dir, network } = options;
  const subWalletCount = parseInt(options.subWallets, 10);

  // Load .env files so credentials set in --dir or repo root are available.
  // Priority: --dir .env first, then repo root .env (non-overwriting).
  const outputDir = path.resolve(dir);
  loadEnvFile(path.join(outputDir, '.env'));
  loadEnvFile(path.join(process.cwd(), '.env'));

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GLOSSO — Wallet Provisioning            ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`   Mode:       ${mode}`);
  console.log(`   Agent:      ${agent}`);
  console.log(`   Network:    ${network}`);
  console.log(`   Directory:  ${path.resolve(dir)}\n`);

  if (!['sovereign', 'privy', 'turnkey'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Must be: sovereign, privy, or turnkey`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (mode === 'sovereign') {
    await provisionSovereign(options, outputDir, subWalletCount);
  } else if (mode === 'privy') {
    await provisionPrivy(options, outputDir, subWalletCount);
  } else if (mode === 'turnkey') {
    await provisionTurnkey(options, outputDir, subWalletCount);
  }
}

async function provisionSovereign(
  options: ProvisionOptions,
  outputDir: string,
  subWalletCount: number
) {
  // 1. Generate mnemonic
  console.log('── Step 1: Generate BIP39 Mnemonic ──\n');
  const mnemonic = generateMnemonic();
  console.log('   ✅ 12-word mnemonic generated');
  console.log('   ⚠️  Mnemonic will NOT be displayed — it is encrypted immediately\n');

  // 2. Generate or use provided passphrase
  console.log('── Step 2: Encrypt Master Seed ──\n');
  const passphrase =
    options.passphrase || crypto.randomBytes(32).toString('base64url');
  const encryptedSeed = encrypt(mnemonic, passphrase);
  console.log('   ✅ Mnemonic encrypted with AES-256-GCM');
  console.log(`   ✅ Encrypted blob: ${encryptedSeed.substring(0, 30)}...`);

  // 3. Derive addresses
  console.log('\n── Step 3: Derive Wallet Addresses ──\n');
  const addresses: string[] = [];
  const labels = ['primary', 'trading', 'vault', 'gas', 'escrow', 'reserve'];
  for (let i = 0; i < subWalletCount; i++) {
    const addr = deriveAddress(mnemonic, i);
    addresses.push(addr);
    const label = labels[i] || `sub-${i}`;
    console.log(`   ✅ Index ${i} (${label}): ${addr}`);
  }

  // 4. Write .env file (append/update section — never overwrite other sections)
  console.log('\n── Step 4: Write Configuration ──\n');
  const envPath = path.join(outputDir, '.env');
  const envFile = parseEnvFile(envPath);
  // Initialise header comment block if the file is new, empty, or whitespace-only.
  // Checking for any key=value line (not just array length) handles all blank cases.
  if (!envFile.header.some((l) => /^\s*\w+=/.test(l))) {
    envFile.header = [...ENV_FILE_HEADER_COMMENT];
  }
  upsertHeaderKey(envFile.header, 'GLOSSO_MODE', options.mode);
  upsertHeaderKey(envFile.header, 'GLOSSO_NETWORK', options.network);
  upsertHeaderKey(envFile.header, 'GLOSSO_PRIMARY_ADDRESS', addresses[0]);
  const subWalletComments = addresses.map(
    (addr, i) => `#   Index ${i} (${labels[i] || `sub-${i}`}): ${addr}`
  );
  reconcileKeys(envFile, 'Sovereign', [
    WALLET_ADDRESS_KEY.Sovereign,
    'GLOSSO_MASTER_SEED_ENCRYPTED',
    'GLOSSO_ENCRYPTION_PASSPHRASE',
  ]);
  envFile.sections.set('Sovereign', [
    `# Provisioned: ${new Date().toISOString()} | Agent: ${options.agent}`,
    `# ⚠️  In production store these in a secrets manager, not .env`,
    `${WALLET_ADDRESS_KEY.Sovereign}=${addresses[0]}`,
    `GLOSSO_MASTER_SEED_ENCRYPTED=${encryptedSeed}`,
    `GLOSSO_ENCRYPTION_PASSPHRASE=${passphrase}`,
    '#',
    '# Derived sub-wallet addresses:',
    ...subWalletComments,
  ]);
  fs.writeFileSync(envPath, serializeEnvFile(envFile), 'utf-8');
  console.log(`   ✅ .env updated (Sovereign section) → ${envPath}`);

  // 5. Generate GLOSSO.md
  console.log('\n── Step 5: Generate GLOSSO.md ──\n');
  const glossoMd = generateGlossoMd({
    agentName: options.agent,
    mode: options.mode,
    network: options.network,
    primaryAddress: addresses[0],
    subWallets: addresses.map((addr, i) => ({
      index: i,
      label: labels[i] || `sub-${i}`,
      address: addr,
    })),
    skills: ['glosso-wallet'],
  });

  const mdPath = path.join(outputDir, 'GLOSSO.md');
  fs.writeFileSync(mdPath, glossoMd, 'utf-8');
  console.log(`   ✅ GLOSSO.md written to ${mdPath}`);

  // 6. Summary
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   PROVISIONING COMPLETE                   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n   Agent:     ${options.agent}`);
  console.log(`   Mode:      ${options.mode}`);
  console.log(`   Network:   ${options.network}`);
  console.log(`   Address:   ${addresses[0]}`);
  console.log(`   .env:      ${envPath}`);
  console.log(`   GLOSSO.md: ${mdPath}`);
  console.log('\n   ⚠️  Back up your .env file securely — it holds your encrypted keys');
  console.log('   ⚠️  NEVER share or commit the .env file to version control\n');
}

async function provisionPrivy(
  options: ProvisionOptions,
  outputDir: string,
  _subWalletCount: number
) {
  console.log('── Privy Provisioning ──\n');

  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'Privy provisioning requires PRIVY_APP_ID and PRIVY_APP_SECRET environment variables.\n' +
      'Get these from https://dashboard.privy.io'
    );
  }

  // Create wallet via Privy server API
  const response = await fetch('https://auth.privy.io/api/v1/wallets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'privy-app-id': appId,
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
    },
    body: JSON.stringify({
      chain_type: 'solana',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Privy API error (${response.status}): ${body}`);
  }

  const walletData = await response.json() as {
    id: string;
    address: string;
    chain_type: string;
  };
  console.log(`   ✅ Privy wallet created`);
  console.log(`   Wallet ID: ${walletData.id}`);
  console.log(`   Address:   ${walletData.address}`);

  // Write .env (append/update section — never overwrite other sections)
  const envPath = path.join(outputDir, '.env');
  const envFile = parseEnvFile(envPath);
  if (!envFile.header.some((l) => /^\s*\w+=/.test(l))) {
    envFile.header = [...ENV_FILE_HEADER_COMMENT];
  }
  upsertHeaderKey(envFile.header, 'GLOSSO_MODE', 'privy');
  upsertHeaderKey(envFile.header, 'GLOSSO_NETWORK', options.network);
  upsertHeaderKey(envFile.header, 'GLOSSO_PRIMARY_ADDRESS', walletData.address);
  reconcileKeys(envFile, 'Privy', [
    WALLET_ADDRESS_KEY.Privy,
    'PRIVY_APP_ID',
    'PRIVY_APP_SECRET',
    'PRIVY_WALLET_ID',
  ]);
  envFile.sections.set('Privy', [
    `# Provisioned: ${new Date().toISOString()} | Agent: ${options.agent}`,
    `${WALLET_ADDRESS_KEY.Privy}=${walletData.address}`,
    `PRIVY_APP_ID=${appId}`,
    `PRIVY_APP_SECRET=${appSecret}`,
    `PRIVY_WALLET_ID=${walletData.id}`,
  ]);
  fs.writeFileSync(envPath, serializeEnvFile(envFile), 'utf-8');
  console.log(`   ✅ .env updated (Privy section) → ${envPath}`);

  // Generate GLOSSO.md
  const glossoMd = generateGlossoMd({
    agentName: options.agent,
    mode: 'privy',
    network: options.network,
    primaryAddress: walletData.address,
    subWallets: [{ index: 0, label: 'primary', address: walletData.address }],
    skills: ['glosso-wallet'],
  });

  const mdPath = path.join(outputDir, 'GLOSSO.md');
  fs.writeFileSync(mdPath, glossoMd, 'utf-8');
  console.log(`   ✅ GLOSSO.md written to ${mdPath}`);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   PRIVY PROVISIONING COMPLETE             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n   Address: ${walletData.address}\n`);
}

async function provisionTurnkey(
  options: ProvisionOptions,
  outputDir: string,
  _subWalletCount: number
) {
  console.log('── Turnkey Provisioning ──\n');

  const orgId = process.env.TURNKEY_ORGANIZATION_ID;
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;

  if (!orgId || !apiPublicKey || !apiPrivateKey) {
    throw new Error(
      'Turnkey provisioning requires TURNKEY_ORGANIZATION_ID, TURNKEY_API_PUBLIC_KEY, and TURNKEY_API_PRIVATE_KEY.\n' +
      'Get these from https://dashboard.turnkey.com'
    );
  }

  // Turnkey wallet creation via SDK
  let walletAddress: string;
  let walletId: string;

  try {
    const { Turnkey } = await import('@turnkey/sdk-server');
    const turnkey = new Turnkey({
      apiBaseUrl: 'https://api.turnkey.com',
      apiPublicKey,
      apiPrivateKey,
      defaultOrganizationId: orgId,
    });

    const client = await turnkey.apiClient();

    const wallet = await client.createWallet({
      walletName: `glosso-${options.agent}-${Date.now()}`,
      accounts: [
        {
          curve: 'CURVE_ED25519' as any,
          pathFormat: 'PATH_FORMAT_BIP32' as any,
          path: "m/44'/501'/0'/0'",
          addressFormat: 'ADDRESS_FORMAT_SOLANA' as any,
        },
      ],
    });

    walletId = wallet.walletId;
    walletAddress = wallet.addresses[0];
    console.log(`   ✅ Turnkey wallet created`);
    console.log(`   Wallet ID: ${walletId}`);
    console.log(`   Address:   ${walletAddress}`);
  } catch (err: any) {
    throw new Error(`Turnkey wallet creation failed: ${err.message}`);
  }

  // Write .env (append/update section — never overwrite other sections)
  const envPath = path.join(outputDir, '.env');
  const envFile = parseEnvFile(envPath);
  if (!envFile.header.some((l) => /^\s*\w+=/.test(l))) {
    envFile.header = [...ENV_FILE_HEADER_COMMENT];
  }
  upsertHeaderKey(envFile.header, 'GLOSSO_MODE', 'turnkey');
  upsertHeaderKey(envFile.header, 'GLOSSO_NETWORK', options.network);
  upsertHeaderKey(envFile.header, 'GLOSSO_PRIMARY_ADDRESS', walletAddress);
  reconcileKeys(envFile, 'Turnkey', [
    WALLET_ADDRESS_KEY.Turnkey,
    'TURNKEY_ORGANIZATION_ID',
    'TURNKEY_API_PUBLIC_KEY',
    'TURNKEY_API_PRIVATE_KEY',
    'TURNKEY_WALLET_ID',
  ]);
  envFile.sections.set('Turnkey', [
    `# Provisioned: ${new Date().toISOString()} | Agent: ${options.agent}`,
    `${WALLET_ADDRESS_KEY.Turnkey}=${walletAddress}`,
    `TURNKEY_ORGANIZATION_ID=${orgId}`,
    `TURNKEY_API_PUBLIC_KEY=${apiPublicKey}`,
    `TURNKEY_API_PRIVATE_KEY=${apiPrivateKey}`,
    `TURNKEY_WALLET_ID=${walletId}`,
  ]);
  fs.writeFileSync(envPath, serializeEnvFile(envFile), 'utf-8');
  console.log(`   ✅ .env updated (Turnkey section) → ${envPath}`);

  // Generate GLOSSO.md
  const glossoMd = generateGlossoMd({
    agentName: options.agent,
    mode: 'turnkey',
    network: options.network,
    primaryAddress: walletAddress,
    subWallets: [{ index: 0, label: 'primary', address: walletAddress }],
    skills: ['glosso-wallet'],
  });

  const mdPath = path.join(outputDir, 'GLOSSO.md');
  fs.writeFileSync(mdPath, glossoMd, 'utf-8');
  console.log(`   ✅ GLOSSO.md written to ${mdPath}`);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   TURNKEY PROVISIONING COMPLETE           ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n   Address: ${walletAddress}\n`);
}
