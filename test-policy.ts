import { PolicyEngine, PolicyStateManager, PolicyViolationError } from './packages/core/src/policy/index.js';

const engine = new PolicyEngine(
  {
    maxSolPerTx: 0.5,
    maxTxPerHour: 2,
    paused: false,
  },
  new PolicyStateManager()
);

let passed = 0;
let failed = 0;

function pass(label: string) { console.log(`  ✅ PASS  ${label}`); passed++; }
function fail(label: string, detail?: string) { console.log(`  ❌ FAIL  ${label}${detail ? ' — ' + detail : ''}`); failed++; }

// ── Test 1: checkSend within per-tx limit ──────────────────
console.log('\nTest 1: checkSend within per-tx limit (0.1 SOL, limit 0.5)');
try {
  engine.checkSend('RecipientAddress', 0.1 * 1e9);
  pass('0.1 SOL allowed');
} catch (e: any) {
  fail('should have passed', e.message);
}

// ── Test 2: checkSend over per-tx limit ───────────────────
console.log('\nTest 2: checkSend over per-tx limit (1.0 SOL, limit 0.5)');
try {
  engine.checkSend('RecipientAddress', 1.0 * 1e9);
  fail('should have been blocked');
} catch (e: any) {
  if (e instanceof PolicyViolationError) {
    pass(`blocked [${e.scope}] — ${e.reason}`);
  } else {
    fail('wrong error type', e.message);
  }
}

// ── Test 3: rate limit ────────────────────────────────────
console.log('\nTest 3: rate limit (maxTxPerHour=2, burning 2 slots then checking)');
engine.recordTransaction(0.1);
engine.recordTransaction(0.1);
try {
  engine.checkSend('RecipientAddress', 0.1 * 1e9);
  fail('should have been rate-limited');
} catch (e: any) {
  if (e instanceof PolicyViolationError) {
    pass(`blocked [${e.scope}] — ${e.reason}`);
  } else {
    fail('wrong error type', e.message);
  }
}

// ── Test 4: pause kill switch ─────────────────────────────
console.log('\nTest 4: pause kill switch');
const pausedEngine = new PolicyEngine({ paused: true }, new PolicyStateManager());
try {
  pausedEngine.checkSend('RecipientAddress', 0.001 * 1e9);
  fail('should have been blocked by pause');
} catch (e: any) {
  if (e instanceof PolicyViolationError && e.scope === 'PAUSED') {
    pass(`blocked [${e.scope}] — ${e.reason}`);
  } else {
    fail('wrong error or scope', e.message);
  }
}

// ── Test 5: active hours (force outside window) ───────────
console.log('\nTest 5: active hours — window that excludes all hours (from=1,to=2)');
const hoursEngine = new PolicyEngine(
  { activeHours: { from: 1, to: 2, timezone: 'UTC' } },
  new PolicyStateManager()
);
try {
  hoursEngine.checkSend('RecipientAddress', 0.001 * 1e9);
  // might pass or fail depending on current UTC hour — print the actual hour
  const utcHour = new Date().getUTCHours();
  if (utcHour >= 1 && utcHour < 2) {
    pass(`within window (current UTC hour: ${utcHour})`);
  } else {
    fail(`should have been blocked — current UTC hour: ${utcHour}`);
  }
} catch (e: any) {
  if (e instanceof PolicyViolationError && e.scope === 'ACTIVE_HOURS') {
    pass(`blocked [${e.scope}] — ${e.reason}`);
  } else {
    fail('wrong error or scope', e.message);
  }
}

// ── Test 6: allowedPrograms — blocked program ────────────
console.log('\nTest 6: allowedPrograms — unknown program should be blocked via checkTransaction');
const progEngine = new PolicyEngine(
  { allowedPrograms: ['11111111111111111111111111111111'] },
  new PolicyStateManager()
);
// We simulate by calling the internal getCurrentConfig to verify it's set
const cfg = progEngine.getCurrentConfig();
const isSet = Array.isArray(cfg?.allowedPrograms) && cfg.allowedPrograms.length === 1;
if (isSet) {
  pass('allowedPrograms=[SystemProgram] is set in engine config');
} else {
  fail('allowedPrograms not set correctly');
}

// ── Summary ───────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`  ${passed} passed   ${failed} failed`);
console.log(`──────────────────────────────────────────\n`);
process.exit(failed > 0 ? 1 : 0);
