# Glosso Policy Engine — Scoped Permissions

> Control exactly what your AI agent is allowed to do — per transaction, per day, per protocol, per hour of the clock.

AI agents can be clumsy. The policy engine sits between every agent action and the signing adapter, enforcing limits you define. When a limit is hit, signing is refused and the agent receives a structured error it can reason about — not silence.

---

## Architecture

```
Agent calls wallet.signAny(tx)
        ↓
PolicyEngine.check(tx)
  ├── parse instructions (extract SOL amount, program IDs)
  ├── check spend limits
  ├── check rate limits
  ├── check program allowlist
  ├── check time windows
  ├── check expiry
  └── APPROVE / REJECT (PolicyViolationError)
        ↓
Adapter.sign(tx)  [sovereign / privy / turnkey]
        ↓
Broadcast to Solana
```

The engine re-reads `~/.glosso/policy.json` on every call — **no restart needed** to apply changes. Edit the file or use `glosso policy set` and limits take effect on the next agent action.

### CPI Note

When the agent calls Drift or Jupiter through their SDKs, the transaction contains top-level instructions pointing at those protocol program IDs. CPI chains happen on-chain — Glosso never sees them. The policy engine checks **top-level `programId`s only**, which is the correct boundary. If `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` is in `allowedPrograms`, the full transaction including its inner token program CPIs is approved.

For versioned transactions (ALTs): the engine resolves static accounts before checking. Lookup Table resolution is a known complexity for future hardening.

---

## SDK API

### `wallet.withPolicy(config, options?)`

Returns a scoped version of the same wallet. All subsequent `signAny()`, `signVersioned()`, and `send()` calls go through the policy engine.

```typescript
import { GlossoWallet, Policy } from "@glosso/core";

const wallet = new GlossoWallet();

const scopedWallet = wallet.withPolicy({
  // Spend limits
  maxSolPerTx: 0.5,
  maxSolPerDay: 3.0,
  maxSolPerWeek: 10.0,
  maxSolPerSession: 5.0,

  // Rate limits
  maxTxPerHour: 5,
  maxTxPerDay: 20,
  maxTxPerSession: 50,

  // Protocol controls
  allowedPrograms: [
    "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",  // Drift
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",  // Jupiter
    "11111111111111111111111111111111",               // System Program
  ],

  // Time controls
  activeHours: { from: 8, to: 20, timezone: "UTC" },
  activeDays: ["mon", "tue", "wed", "thu", "fri"],
  expiresAt: new Date("2025-06-01"),

  // Emergency
  paused: false,
});

// All subsequent calls go through the policy engine
await scopedWallet.signAny(tx);
await scopedWallet.send(recipient, lamports);
```

### Persistence Options

```typescript
// Ephemeral — counters reset on process restart (good for testing/dev)
wallet.withPolicy({ maxTxPerDay: 10 })

// Persistent — counters survive restarts (good for production)
wallet.withPolicy(
  { maxTxPerDay: 10 },
  { persist: true }
)

// Shared with CLI — same state file the CLI policy commands read/write
wallet.withPolicy(
  { maxTxPerDay: 10 },
  { persist: true, stateFile: "~/.glosso/policy-state.json" }
)
```

When `persist: true` is set, the SDK and CLI share the same rolling counters — a `glosso policy status` will show the agent's real-time usage.

---

## Catching Policy Violations

`PolicyViolationError` is thrown synchronously before any signing or network call. Catch it in your tool implementations and return a structured error the agent can reason about.

```typescript
import { PolicyViolationError } from "@glosso/core";

async function open_perp_position(args: { direction: string; sizeSol: number }) {
  try {
    const tx = await buildDriftTx(args);
    const sig = await scopedWallet.signAny(tx);
    return { success: true, signature: sig };
  } catch (e) {
    if (e instanceof PolicyViolationError) {
      // Structured — agent can read reason and adjust its plan
      return {
        error: `Blocked by policy: ${e.reason}`,
        // e.g. "MAX_SOL_PER_DAY exceeded (2.8/3.0 SOL used today)"
        // e.g. "Program dRiftyHA... not in allowedPrograms"
        // e.g. "Signing not permitted outside activeHours (08:00–20:00 UTC)"
        // e.g. "PAUSED — all signing suspended"
      };
    }
    throw e;
  }
}
```

The agent receives the reason as a tool result, can tell the user "I've used 2.8 of my 3.0 SOL daily limit — I'll wait until tomorrow to execute this trade", and stops attempting the operation.

### Activity Log Event

Policy blocks are written to `~/.glosso/activity.log` as a `POLICY_BLOCK` event and surface in both `glosso logs` and the TUI dashboard:

```
16:42:01 [demo-sv01]  BLOCKED  open_perp_position — MAX_SOL_PER_DAY exceeded (2.8/3.0 SOL)
16:51:14 [demo-sv01]  BLOCKED  deposit_collateral — Program not in allowedPrograms
```

---

## CLI Reference

```bash
# View current policy and live counters
glosso policy status

# Set a limit
glosso policy set MAX_SOL_PER_TX 0.5
glosso policy set MAX_SOL_PER_DAY 3.0
glosso policy set MAX_TX_PER_DAY 20
glosso policy set MAX_TX_PER_HOUR 5

# Allow / remove a program
glosso policy allow-program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
glosso policy allow-program dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
glosso policy deny-program <program-id>

# Time windows
glosso policy set ACTIVE_HOURS_FROM 8
glosso policy set ACTIVE_HOURS_TO 20
glosso policy set ACTIVE_DAYS mon,tue,wed,thu,fri

# Hard expiry
glosso policy set EXPIRES_AT 2025-06-01

# Pause all signing immediately (kill switch)
glosso policy pause
glosso policy resume

# Reset rolling counters (e.g. after testing)
glosso policy reset-counters
```

All commands update `~/.glosso/policy.json`. Changes take effect on the next agent action — no restart required.

---

## Config Files

### `~/.glosso/policy.json` — user-defined limits

```json
{
  "maxSolPerTx": 0.5,
  "maxSolPerDay": 3.0,
  "maxSolPerWeek": 10.0,
  "maxSolPerSession": null,
  "maxTxPerHour": 5,
  "maxTxPerDay": 20,
  "maxTxPerSession": null,
  "allowedPrograms": [
    "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    "11111111111111111111111111111111"
  ],
  "blockedPrograms": [],
  "allowedRecipients": [],
  "blockedRecipients": [],
  "activeHours": { "from": 8, "to": 20, "timezone": "UTC" },
  "activeDays": ["mon", "tue", "wed", "thu", "fri"],
  "expiresAt": null,
  "paused": false,
  "requireMemo": false
}
```

`null` means unlimited. All fields are optional — omit any you don't need.

### `~/.glosso/policy-state.json` — rolling counters (managed automatically)

```json
{
  "txs": [
    { "ts": 1741234567, "solAmount": 0.3 },
    { "ts": 1741234890, "solAmount": 0.1 }
  ]
}
```

Maintained by the policy engine using sliding windows (not calendar resets). Do not edit manually — use `glosso policy reset-counters` to clear.

---

## All Possible Scopes

### Spend Limits

| Scope | Type | Description |
|---|---|---|
| `maxSolPerTx` | `number` | Max SOL transferable in a single transaction |
| `maxSolPerDay` | `number` | Rolling 24h SOL spend ceiling (sliding window) |
| `maxSolPerWeek` | `number` | Rolling 7-day SOL spend ceiling |
| `maxSolPerSession` | `number` | Max SOL spend for the current process lifetime |

### Rate Limits

| Scope | Type | Description |
|---|---|---|
| `maxTxPerHour` | `number` | Burst protection — max txs in any 60-minute window |
| `maxTxPerDay` | `number` | Max txs signed in any 24-hour window |
| `maxTxPerSession` | `number` | Max txs this process may sign before halting |

### Program / Protocol Controls

| Scope | Type | Description |
|---|---|---|
| `allowedPrograms` | `string[]` | Whitelist of program IDs allowed at top-level instructions |
| `blockedPrograms` | `string[]` | Explicit denylist — checked even if allowedPrograms is empty |
| `allowedTokenMints` | `string[]` | Restrict which SPL token mints may appear in instructions |

### Recipient Controls

| Scope | Type | Description |
|---|---|---|
| `allowedRecipients` | `string[]` | Whitelist of addresses SOL/tokens may be sent to |
| `blockedRecipients` | `string[]` | Explicit denylist of addresses |
| `maxUniqueRecipientsPerDay` | `number` | Limit address fan-out — anti-distribution-spam |

### Time-Based Controls

| Scope | Type | Description |
|---|---|---|
| `activeHours` | `{ from: number, to: number, timezone: string }` | Clock window per day when signing is permitted |
| `activeDays` | `string[]` | Days of week allowed: `"mon"` `"tue"` `"wed"` `"thu"` `"fri"` `"sat"` `"sun"` |
| `expiresAt` | `Date \| string` | Hard cutoff — all signing refused after this datetime |
| `startsAt` | `Date \| string` | Scheduled activation — signing refused before this datetime |
| `maxSessionDurationHours` | `number` | Auto-expire the scoped wallet N hours after process start |

### Instruction-Level Controls

| Scope | Type | Description |
|---|---|---|
| `maxInstructionsPerTx` | `number` | Limit transaction complexity by instruction count |
| `requireMemo` | `boolean` | Every transaction must include a memo instruction (audit trail) |

### DeFi / Collateral Controls

| Scope | Type | Description |
|---|---|---|
| `maxCollateralDeposit` | `number` | Max SOL depositable into any protocol in one tx |
| `maxPositionSizeSol` | `number` | Max notional size of any opened position |
| `maxOpenPositions` | `number` | Max concurrent open positions across all protocols |
| `maxLeverage` | `number` | Cap on leverage multiplier (requires protocol-aware instruction parsing) |

### Emergency Controls

| Scope | Type | Description |
|---|---|---|
| `paused` | `boolean` | Kill switch — blocks all signing immediately when `true` |
| `requireConfirmation` | `number` | SOL threshold above which signing is paused and a `PENDING_CONFIRM` event is emitted — enables human-in-the-loop for high-value txs only |

---

## Implementation Status

### Built ✅

| Component | Location | Notes |
|---|---|---|
| `PolicyConfig` type + all 25 scopes | `packages/core/src/policy/types.ts` | Full type definitions, `PolicyViolationError` class |
| `PolicyStateManager` — sliding window counters | `packages/core/src/policy/state.ts` | In-memory or persistent (`~/.glosso/policy-state.json`), auto-prune >7d |
| `PolicyEngine.checkTransaction()` | `packages/core/src/policy/engine.ts` | Hot-reloads `policy.json` on every call. Checks: spend, rate, programs, recipients, time, memo, instructions, pause, expiry |
| SOL amount parser — System Program transfers | `packages/core/src/policy/parser.ts` | Detects `[2,0,0,0]` discriminator, reads u64 LE lamports. Also: `extractProgramIds`, `countInstructions`, `hasMemoInstruction` |
| `wallet.withPolicy()` → `ScopedGlossoWallet` | `packages/core/src/glosso.ts` | Wraps inner wallet, runs engine checks before every sign/send, records on success, logs `policy_block` on violation |
| `policy_block` event type | `packages/core/src/utils/logger.ts` | Feeds into `glosso logs` and TUI dashboard |
| `POLICY_BLOCK` display in TUI | `packages/monitor/src/components/ActivityFeed.tsx` | Red `⛔ BLOCKED` with scope + reason |
| `glosso policy` CLI command | `packages/cli/src/commands/policy.ts` | Subcommands: `status`, `set`, `allow-program`, `deny-program`, `allow-recipient`, `block-recipient`, `pause`, `resume`, `reset-counters` |
| Agent policy awareness | `packages/skills/glosso-wallet/SKILL.md` | Agent knows violations are possible, how to report them, and that it cannot change policy |
| All exports from `@glosso/core` | `packages/core/src/index.ts` | `PolicyEngine`, `PolicyStateManager`, `PolicyViolationError`, `ScopedGlossoWallet`, parser utils |

### Deferred / Not Yet Built 🔧

| Feature | Why deferred | Complexity |
|---|---|---|
| **DeFi-specific SOL amount parsing** (Drift deposits, Jupiter swaps) | Requires per-protocol IDL discriminators to extract SOL amounts from protocol-specific instructions. System Program transfers are parsed; protocol-level amounts are not. | High — each protocol has different instruction layouts and discriminator bytes |
| **`allowedTokenMints`** — restrict which SPL token mints may appear | Requires Token Program instruction parsing to extract mint addresses from transfer/approve instructions | Medium |
| **`maxCollateralDeposit`** | Needs Drift/protocol-specific instruction parsing to detect deposit amounts | High |
| **`maxPositionSizeSol`** | Needs protocol-specific instruction parsing for position sizing | High |
| **`maxLeverage`** | Requires deep protocol-aware parsing of leverage parameters in instructions | High |
| **`maxOpenPositions`** | Requires querying on-chain state (Drift user accounts) to count current positions | Medium |
| **`requireConfirmation`** — human-in-the-loop above threshold | Needs an async approval flow: emit `PENDING_CONFIRM` event, wait for human response via CLI or REST API | Medium |
| **ALT (Address Lookup Table) resolution** for versioned transactions | `extractProgramIds` uses `staticAccountKeys` only. ATL-resolved accounts are not checked. | Low — needs RPC call to resolve lookup table |
| **Remote policy control** (REST API server) | See "Future: Remote Policy Control" section below. Valuable but not needed for local-first operation. | Medium |

---

## Implementation Plan (Original)

_Preserved for reference — see "Implementation Status" above for current state._

| Step | What | Where |
|---|---|---|
| 1 | `PolicyEngine` class — `check(tx, config, state)` method | `packages/core/src/policy/engine.ts` ✅ |
| 2 | Wire into `GlossoWallet.signAny()` and `send()` | `packages/core/src/glosso.ts` ✅ |
| 3 | `PolicyViolationError` class with structured `reason` | `packages/core/src/policy/types.ts` ✅ |
| 4 | `policy-state.json` reader/writer with sliding window math | `packages/core/src/policy/state.ts` ✅ |
| 5 | `glosso policy` subcommand | `packages/cli/src/commands/policy.ts` ✅ |
| 6 | `POLICY_BLOCK` event type in logger | `packages/core/src/utils/logger.ts` ✅ |
| 7 | Policy block display in TUI dashboard | `packages/monitor/src/components/ActivityFeed.tsx` ✅ |
| 8 | `SKILL.md` update — document policy awareness for agents | `packages/skills/glosso-wallet/SKILL.md` ✅ |

---

## Future: Remote Policy Control

The policy file is plain JSON on disk. A future `glosso server` process exposes it over a local REST API:

```
GET  /policy          → current policy.json
PUT  /policy          → update limits (authenticated)
POST /policy/pause    → set paused: true
POST /policy/resume   → set paused: false
GET  /policy/state    → rolling counter state
POST /policy/reset    → reset counters
```

A web dashboard or mobile app talks to this server over Tailscale or a local network — giving non-CLI users a UI to manage scopes without touching the terminal. Key material never touches the server; only the policy JSON is exposed.

See [ROADMAP.md](ROADMAP.md) for timeline.
