import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

const POLICY_DIR = path.join(homedir(), '.glosso');
const POLICY_FILE = path.join(POLICY_DIR, 'policy.json');
const STATE_FILE = path.join(POLICY_DIR, 'policy-state.json');

// ── Helpers ─────────────────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(POLICY_DIR)) {
    fs.mkdirSync(POLICY_DIR, { recursive: true });
  }
}

function readPolicy(): Record<string, unknown> {
  if (!fs.existsSync(POLICY_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(POLICY_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writePolicy(policy: Record<string, unknown>): void {
  ensureDir();
  fs.writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2) + '\n', 'utf-8');
}

function readState(): Record<string, unknown> | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function formatSol(val: unknown): string {
  if (val == null) return 'unlimited';
  return `${val} SOL`;
}

function formatNum(val: unknown): string {
  if (val == null) return 'unlimited';
  return `${val}`;
}

// Map CLI key names to policy config keys
const KEY_MAP: Record<string, string> = {
  MAX_SOL_PER_TX: 'maxSolPerTx',
  MAX_SOL_PER_DAY: 'maxSolPerDay',
  MAX_SOL_PER_WEEK: 'maxSolPerWeek',
  MAX_SOL_PER_SESSION: 'maxSolPerSession',
  MAX_TX_PER_HOUR: 'maxTxPerHour',
  MAX_TX_PER_DAY: 'maxTxPerDay',
  MAX_TX_PER_SESSION: 'maxTxPerSession',
  MAX_INSTRUCTIONS_PER_TX: 'maxInstructionsPerTx',
  MAX_UNIQUE_RECIPIENTS_PER_DAY: 'maxUniqueRecipientsPerDay',
  MAX_SESSION_DURATION_HOURS: 'maxSessionDurationHours',
  ACTIVE_HOURS_FROM: '_activeHoursFrom',
  ACTIVE_HOURS_TO: '_activeHoursTo',
  ACTIVE_HOURS_TIMEZONE: '_activeHoursTimezone',
  ACTIVE_DAYS: '_activeDays',
  EXPIRES_AT: 'expiresAt',
  STARTS_AT: 'startsAt',
  REQUIRE_MEMO: 'requireMemo',
};

// ── Policy command ─────────────────────────────────────────

export const policyCommand = new Command('policy')
  .description('Manage scoped permissions and policy limits')
  .addHelpText('after', `
Examples:
  glosso policy status                          # view current policy and counters
  glosso policy set MAX_SOL_PER_TX 0.5          # set per-tx SOL limit
  glosso policy set MAX_TX_PER_DAY 20           # set daily tx count limit
  glosso policy allow-program <program-id>      # add to program allowlist
  glosso policy deny-program <program-id>       # remove from program allowlist
  glosso policy pause                           # halt all signing immediately
  glosso policy resume                          # resume signing
  glosso policy reset-counters                  # clear rolling counters
`);

// ── glosso policy status ──────────────────────────────────

policyCommand
  .command('status')
  .description('Show current policy config and rolling counters')
  .action(async () => {
    const policy = readPolicy();
    const state = readState();

    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   GLOSSO — Policy Status                     ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    if (Object.keys(policy).length === 0) {
      console.log('  No policy configured. All operations are unrestricted.\n');
      console.log('  Set limits with: glosso policy set MAX_SOL_PER_TX 0.5');
      return;
    }

    // Paused?
    if (policy.paused) {
      console.log('  ⛔ STATUS: PAUSED — all signing is suspended\n');
    } else {
      console.log('  ✅ STATUS: Active\n');
    }

    // Spend limits
    console.log('  ── Spend Limits ──────────────────────────────');
    console.log(`    Per TX:       ${formatSol(policy.maxSolPerTx)}`);
    console.log(`    Per Day:      ${formatSol(policy.maxSolPerDay)}`);
    console.log(`    Per Week:     ${formatSol(policy.maxSolPerWeek)}`);
    console.log(`    Per Session:  ${formatSol(policy.maxSolPerSession)}`);
    console.log();

    // Rate limits
    console.log('  ── Rate Limits ───────────────────────────────');
    console.log(`    Per Hour:     ${formatNum(policy.maxTxPerHour)}`);
    console.log(`    Per Day:      ${formatNum(policy.maxTxPerDay)}`);
    console.log(`    Per Session:  ${formatNum(policy.maxTxPerSession)}`);
    console.log();

    // Programs
    const allowed = (policy.allowedPrograms as string[]) || [];
    const blocked = (policy.blockedPrograms as string[]) || [];
    console.log('  ── Programs ──────────────────────────────────');
    if (allowed.length > 0) {
      console.log(`    Allowed (${allowed.length}):`);
      for (const p of allowed) console.log(`      ✓ ${p}`);
    } else {
      console.log('    Allowed:  any (no whitelist)');
    }
    if (blocked.length > 0) {
      console.log(`    Blocked (${blocked.length}):`);
      for (const p of blocked) console.log(`      ✗ ${p}`);
    }
    console.log();

    // Recipients
    const allowedR = (policy.allowedRecipients as string[]) || [];
    const blockedR = (policy.blockedRecipients as string[]) || [];
    if (allowedR.length > 0 || blockedR.length > 0) {
      console.log('  ── Recipients ────────────────────────────────');
      if (allowedR.length > 0) {
        console.log(`    Allowed (${allowedR.length}):`);
        for (const r of allowedR) console.log(`      ✓ ${r}`);
      }
      if (blockedR.length > 0) {
        console.log(`    Blocked (${blockedR.length}):`);
        for (const r of blockedR) console.log(`      ✗ ${r}`);
      }
      console.log();
    }

    // Time controls
    const ah = policy.activeHours as { from: number; to: number; timezone: string } | undefined;
    const ad = policy.activeDays as string[] | undefined;
    if (ah || ad || policy.expiresAt || policy.startsAt || policy.maxSessionDurationHours) {
      console.log('  ── Time Controls ─────────────────────────────');
      if (ah) console.log(`    Active Hours: ${ah.from}:00–${ah.to}:00 ${ah.timezone}`);
      if (ad) console.log(`    Active Days:  ${ad.join(', ')}`);
      if (policy.startsAt) console.log(`    Starts At:    ${policy.startsAt}`);
      if (policy.expiresAt) console.log(`    Expires At:   ${policy.expiresAt}`);
      if (policy.maxSessionDurationHours) console.log(`    Max Session:  ${policy.maxSessionDurationHours}h`);
      console.log();
    }

    // Other
    if (policy.requireMemo) {
      console.log('  ── Other ─────────────────────────────────────');
      console.log('    Require Memo: yes');
      console.log();
    }

    // Rolling counters
    if (state && Array.isArray((state as any).txs)) {
      const txs = (state as any).txs as { ts: number; solAmount: number }[];
      const now = Math.floor(Date.now() / 1000);
      const oneHour = txs.filter((t) => t.ts >= now - 3600);
      const oneDay = txs.filter((t) => t.ts >= now - 86400);
      const oneWeek = txs.filter((t) => t.ts >= now - 604800);

      const solHour = oneHour.reduce((s, t) => s + t.solAmount, 0);
      const solDay = oneDay.reduce((s, t) => s + t.solAmount, 0);
      const solWeek = oneWeek.reduce((s, t) => s + t.solAmount, 0);

      console.log('  ── Rolling Counters ──────────────────────────');
      console.log(`    Last Hour:  ${oneHour.length} txs, ${solHour.toFixed(4)} SOL`);
      console.log(`    Last 24h:   ${oneDay.length} txs, ${solDay.toFixed(4)} SOL`);
      console.log(`    Last 7d:    ${oneWeek.length} txs, ${solWeek.toFixed(4)} SOL`);
      console.log();
    }

    console.log(`  Policy file: ${POLICY_FILE}`);
  });

// ── glosso policy set <key> <value> ─────────────────────

policyCommand
  .command('set <key> <value>')
  .description('Set a policy limit')
  .action(async (key: string, value: string) => {
    const upperKey = key.toUpperCase();
    const policy = readPolicy();

    // Handle special compound keys
    if (upperKey === 'ACTIVE_HOURS_FROM' || upperKey === 'ACTIVE_HOURS_TO' || upperKey === 'ACTIVE_HOURS_TIMEZONE') {
      const ah = (policy.activeHours as any) || { from: 0, to: 24, timezone: 'UTC' };
      if (upperKey === 'ACTIVE_HOURS_FROM') ah.from = parseInt(value, 10);
      else if (upperKey === 'ACTIVE_HOURS_TO') ah.to = parseInt(value, 10);
      else ah.timezone = value;
      policy.activeHours = ah;
      writePolicy(policy);
      console.log(`✅ activeHours updated → ${ah.from}:00–${ah.to}:00 ${ah.timezone}`);
      return;
    }

    if (upperKey === 'ACTIVE_DAYS') {
      policy.activeDays = value.split(',').map((d) => d.trim().toLowerCase());
      writePolicy(policy);
      console.log(`✅ activeDays → ${(policy.activeDays as string[]).join(', ')}`);
      return;
    }

    if (upperKey === 'REQUIRE_MEMO') {
      policy.requireMemo = value === 'true' || value === '1' || value === 'yes';
      writePolicy(policy);
      console.log(`✅ requireMemo → ${policy.requireMemo}`);
      return;
    }

    // Standard numeric/string keys
    const configKey = KEY_MAP[upperKey];
    if (!configKey || configKey.startsWith('_')) {
      const valid = Object.keys(KEY_MAP)
        .filter((k) => !KEY_MAP[k].startsWith('_'))
        .join(', ');
      console.error(`❌ Unknown key: ${key}`);
      console.error(`   Valid keys: ${valid}`);
      process.exit(1);
    }

    // Parse as number if it looks like one, else keep as string
    const parsed = isNaN(Number(value)) ? value : Number(value);
    policy[configKey] = parsed;
    writePolicy(policy);
    console.log(`✅ ${configKey} → ${parsed}`);
  });

// ── glosso policy allow-program <id> ────────────────────

policyCommand
  .command('allow-program <programId>')
  .description('Add a program to the allowlist')
  .action(async (programId: string) => {
    const policy = readPolicy();
    const list = ((policy.allowedPrograms as string[]) || []);
    if (list.includes(programId)) {
      console.log(`ℹ️  ${programId} is already in allowedPrograms`);
      return;
    }
    list.push(programId);
    policy.allowedPrograms = list;
    writePolicy(policy);
    console.log(`✅ Added to allowedPrograms (${list.length} total)`);
  });

// ── glosso policy deny-program <id> ─────────────────────

policyCommand
  .command('deny-program <programId>')
  .description('Remove a program from the allowlist')
  .action(async (programId: string) => {
    const policy = readPolicy();
    const list = ((policy.allowedPrograms as string[]) || []);
    const idx = list.indexOf(programId);
    if (idx === -1) {
      console.log(`ℹ️  ${programId} is not in allowedPrograms`);
      return;
    }
    list.splice(idx, 1);
    policy.allowedPrograms = list;
    writePolicy(policy);
    console.log(`✅ Removed from allowedPrograms (${list.length} remaining)`);
  });

// ── glosso policy allow-recipient <address> ─────────────

policyCommand
  .command('allow-recipient <address>')
  .description('Add a recipient address to the allowlist')
  .action(async (address: string) => {
    const policy = readPolicy();
    const list = ((policy.allowedRecipients as string[]) || []);
    if (list.includes(address)) {
      console.log(`ℹ️  ${address} is already in allowedRecipients`);
      return;
    }
    list.push(address);
    policy.allowedRecipients = list;
    writePolicy(policy);
    console.log(`✅ Added to allowedRecipients (${list.length} total)`);
  });

// ── glosso policy block-recipient <address> ─────────────

policyCommand
  .command('block-recipient <address>')
  .description('Add a recipient address to the blocklist')
  .action(async (address: string) => {
    const policy = readPolicy();
    const list = ((policy.blockedRecipients as string[]) || []);
    if (list.includes(address)) {
      console.log(`ℹ️  ${address} is already in blockedRecipients`);
      return;
    }
    list.push(address);
    policy.blockedRecipients = list;
    writePolicy(policy);
    console.log(`✅ Added to blockedRecipients (${list.length} total)`);
  });

// ── glosso policy pause / resume ────────────────────────

policyCommand
  .command('pause')
  .description('Immediately suspend all signing (kill switch)')
  .action(async () => {
    const policy = readPolicy();
    policy.paused = true;
    writePolicy(policy);
    console.log('⛔ All signing is now PAUSED');
    console.log('   Run `glosso policy resume` to re-enable');
  });

policyCommand
  .command('resume')
  .description('Resume signing after a pause')
  .action(async () => {
    const policy = readPolicy();
    policy.paused = false;
    writePolicy(policy);
    console.log('✅ Signing resumed');
  });

// ── glosso policy reset-counters ────────────────────────

policyCommand
  .command('reset-counters')
  .description('Clear all rolling counters (tx history, session stats)')
  .action(async () => {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
    console.log('✅ Counters cleared');
  });
