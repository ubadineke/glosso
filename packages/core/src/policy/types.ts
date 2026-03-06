/**
 * types.ts — Policy configuration and error types for scoped permissions.
 *
 * These types define what limits can be imposed on a GlossoWallet.
 * The PolicyEngine reads a PolicyConfig and enforces it before every sign/send.
 */

// ── Policy Configuration ──────────────────────────────────

export interface ActiveHours {
  /** Hour of day (0–23) signing becomes permitted. */
  from: number;
  /** Hour of day (0–23) signing is no longer permitted. */
  to: number;
  /** IANA timezone string, e.g. "UTC", "America/New_York". */
  timezone: string;
}

export interface PolicyConfig {
  // ── Spend limits ──────────────────────────────────────────
  /** Max SOL transferable in a single transaction. */
  maxSolPerTx?: number;
  /** Rolling 24h SOL spend ceiling. */
  maxSolPerDay?: number;
  /** Rolling 7-day SOL spend ceiling. */
  maxSolPerWeek?: number;
  /** Max SOL spend for process lifetime. */
  maxSolPerSession?: number;

  // ── Rate limits ───────────────────────────────────────────
  /** Max signed txs in any 60-minute window. */
  maxTxPerHour?: number;
  /** Max signed txs in any 24-hour window. */
  maxTxPerDay?: number;
  /** Max txs this process may sign before halting. */
  maxTxPerSession?: number;

  // ── Program / protocol controls ───────────────────────────
  /** Whitelist of program IDs allowed at top-level instructions. */
  allowedPrograms?: string[];
  /** Explicit denylist — checked even if allowedPrograms is empty. */
  blockedPrograms?: string[];
  /** Restrict which SPL token mints may appear in instructions. */
  allowedTokenMints?: string[];

  // ── Recipient controls ────────────────────────────────────
  /** Whitelist of addresses SOL/tokens may be sent to. */
  allowedRecipients?: string[];
  /** Explicit denylist of addresses. */
  blockedRecipients?: string[];
  /** Limit address fan-out per 24h window. */
  maxUniqueRecipientsPerDay?: number;

  // ── Time-based controls ───────────────────────────────────
  /** Clock window per day when signing is permitted. */
  activeHours?: ActiveHours;
  /** Days of week allowed. */
  activeDays?: string[];
  /** Hard cutoff — all signing refused after this datetime. */
  expiresAt?: Date | string;
  /** Scheduled activation — signing refused before this datetime. */
  startsAt?: Date | string;
  /** Auto-expire N hours after process start. */
  maxSessionDurationHours?: number;

  // ── Instruction-level controls ────────────────────────────
  /** Limit transaction complexity by instruction count. */
  maxInstructionsPerTx?: number;
  /** Every tx must include a memo instruction (audit trail). */
  requireMemo?: boolean;

  // ── Emergency controls ────────────────────────────────────
  /** Kill switch — blocks all signing immediately. */
  paused?: boolean;
}

export interface PolicyPersistenceOptions {
  /** Write counters to disk so they survive restarts. Default: false (in-memory). */
  persist?: boolean;
  /** Path to the state file. Default: ~/.glosso/policy-state.json */
  stateFile?: string;
}

// ── Policy State (rolling counters) ────────────────────────

export interface TxRecord {
  /** Unix timestamp (seconds). */
  ts: number;
  /** SOL moved in this transaction. */
  solAmount: number;
  /** Recipient address (if applicable). */
  recipient?: string;
}

export interface PolicyState {
  /** All recorded transactions in the rolling window. */
  txs: TxRecord[];
  /** Session start time (unix seconds). */
  sessionStartedAt: number;
  /** Session tx counter. */
  sessionTxCount: number;
  /** Session SOL counter. */
  sessionSolSpent: number;
}

// ── Policy Violation Error ─────────────────────────────────

export class PolicyViolationError extends Error {
  /** Human-readable reason string (e.g. "MAX_SOL_PER_DAY exceeded (2.8/3.0 SOL)"). */
  public readonly reason: string;
  /** The specific scope that was violated. */
  public readonly scope: string;

  constructor(scope: string, reason: string) {
    super(`Policy violation [${scope}]: ${reason}`);
    this.name = 'PolicyViolationError';
    this.scope = scope;
    this.reason = reason;
  }
}
