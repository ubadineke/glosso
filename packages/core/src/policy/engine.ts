/**
 * engine.ts — The Glosso Policy Engine.
 *
 * Sits between the agent and the signing adapter. Every sign/send call
 * passes through PolicyEngine.check() before reaching the adapter.
 *
 * The engine re-reads policy.json on every call (hot reload).
 * Counters are managed by PolicyStateManager (in-memory or persisted).
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import type { AnyTransaction } from '../adapters/interface.js';
import { PolicyViolationError } from './types.js';
import type { PolicyConfig } from './types.js';
import { PolicyStateManager } from './state.js';
import {
  extractProgramIds,
  extractSolAmount,
  countInstructions,
  hasMemoInstruction,
} from './parser.js';

const ONE_HOUR = 3600;
const ONE_DAY = 86400;
const ONE_WEEK = 7 * ONE_DAY;

const DEFAULT_POLICY_PATH = path.join(homedir(), '.glosso', 'policy.json');

export class PolicyEngine {
  private config: PolicyConfig;
  private stateManager: PolicyStateManager;
  private policyFilePath: string;
  private useFileConfig: boolean;

  /**
   * Create a policy engine.
   *
   * @param config — inline config (SDK usage with withPolicy())
   * @param stateManager — counter state manager
   * @param policyFilePath — path to policy.json for hot-reload (CLI usage)
   */
  constructor(
    config: PolicyConfig,
    stateManager: PolicyStateManager,
    policyFilePath?: string
  ) {
    this.config = config;
    this.stateManager = stateManager;
    this.policyFilePath = policyFilePath ?? DEFAULT_POLICY_PATH;
    // If config was passed inline (SDK), don't read from file
    this.useFileConfig = Object.keys(config).length === 0;
  }

  /**
   * Get the current effective config (re-reads from file if using file mode).
   */
  private getConfig(): PolicyConfig {
    if (this.useFileConfig) {
      return this.loadFileConfig();
    }
    return this.config;
  }

  /**
   * Hot-reload policy.json from disk.
   */
  private loadFileConfig(): PolicyConfig {
    if (!fs.existsSync(this.policyFilePath)) return {};
    try {
      const raw = fs.readFileSync(this.policyFilePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  /**
   * Check a transaction against the policy BEFORE signing.
   * Throws PolicyViolationError if any limit is exceeded.
   *
   * Call this before every sign/signVersioned/send operation.
   */
  checkTransaction(tx: AnyTransaction): void {
    const cfg = this.getConfig();

    // ── Emergency: paused ─────────────────────────────────
    if (cfg.paused) {
      throw new PolicyViolationError('PAUSED', 'All signing is suspended');
    }

    // ── Time controls ─────────────────────────────────────
    this.checkTimeControls(cfg);

    // ── Program allowlist / blocklist ──────────────────────
    this.checkPrograms(tx, cfg);

    // ── Instruction count ─────────────────────────────────
    this.checkInstructionCount(tx, cfg);

    // ── Memo requirement ──────────────────────────────────
    this.checkMemoRequirement(tx, cfg);

    // ── Rate limits ───────────────────────────────────────
    this.checkRateLimits(cfg);

    // ── SOL spend limits ──────────────────────────────────
    this.checkSolLimits(tx, cfg);
  }

  /**
   * Check a send() call against the policy.
   * Uses the explicit recipient + lamport amount rather than parsing.
   */
  checkSend(to: string, lamports: number): void {
    const cfg = this.getConfig();
    const solAmount = lamports / 1e9;

    // ── Emergency ─────────────────────────────────────────
    if (cfg.paused) {
      throw new PolicyViolationError('PAUSED', 'All signing is suspended');
    }

    // ── Time controls ─────────────────────────────────────
    this.checkTimeControls(cfg);

    // ── Recipient controls ────────────────────────────────
    this.checkRecipient(to, cfg);

    // ── Rate limits ───────────────────────────────────────
    this.checkRateLimits(cfg);

    // ── SOL amount limits ─────────────────────────────────
    this.checkSolAmountLimits(solAmount, cfg);
  }

  /**
   * Record a successful transaction in the rolling counters.
   * Call AFTER a transaction is successfully signed/sent.
   */
  recordTransaction(solAmount: number, recipient?: string): void {
    this.stateManager.recordTx(solAmount, recipient);
  }

  // ── Private check methods ─────────────────────────────────

  private checkTimeControls(cfg: PolicyConfig): void {
    const now = new Date();

    // Hard expiry
    if (cfg.expiresAt) {
      const expiry = new Date(cfg.expiresAt);
      if (now > expiry) {
        throw new PolicyViolationError(
          'EXPIRES_AT',
          `Policy expired at ${expiry.toISOString()}`
        );
      }
    }

    // Not yet started
    if (cfg.startsAt) {
      const start = new Date(cfg.startsAt);
      if (now < start) {
        throw new PolicyViolationError(
          'STARTS_AT',
          `Policy not active until ${start.toISOString()}`
        );
      }
    }

    // Session duration
    if (cfg.maxSessionDurationHours != null) {
      const sessionAge =
        Math.floor(Date.now() / 1000) - this.stateManager.sessionStartedAt;
      const maxSeconds = cfg.maxSessionDurationHours * 3600;
      if (sessionAge > maxSeconds) {
        throw new PolicyViolationError(
          'MAX_SESSION_DURATION',
          `Session exceeded ${cfg.maxSessionDurationHours}h limit`
        );
      }
    }

    // Active hours
    if (cfg.activeHours) {
      const { from, to, timezone } = cfg.activeHours;
      let currentHour: number;
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: timezone,
        });
        currentHour = parseInt(formatter.format(now), 10);
      } catch {
        // Fallback to UTC if invalid timezone
        currentHour = now.getUTCHours();
      }

      const inWindow =
        from <= to
          ? currentHour >= from && currentHour < to
          : currentHour >= from || currentHour < to; // wraps midnight

      if (!inWindow) {
        throw new PolicyViolationError(
          'ACTIVE_HOURS',
          `Signing not permitted outside ${from}:00–${to}:00 ${timezone}`
        );
      }
    }

    // Active days
    if (cfg.activeDays && cfg.activeDays.length > 0) {
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const today = dayNames[now.getDay()];
      if (!cfg.activeDays.includes(today)) {
        throw new PolicyViolationError(
          'ACTIVE_DAYS',
          `Signing not permitted on ${today} (allowed: ${cfg.activeDays.join(', ')})`
        );
      }
    }
  }

  private checkPrograms(tx: AnyTransaction, cfg: PolicyConfig): void {
    const programIds = extractProgramIds(tx);

    // Check blocklist first
    if (cfg.blockedPrograms && cfg.blockedPrograms.length > 0) {
      for (const pid of programIds) {
        if (cfg.blockedPrograms.includes(pid)) {
          throw new PolicyViolationError(
            'BLOCKED_PROGRAM',
            `Program ${shortenId(pid)} is in blockedPrograms`
          );
        }
      }
    }

    // Check allowlist (if set, only these are permitted)
    if (cfg.allowedPrograms && cfg.allowedPrograms.length > 0) {
      for (const pid of programIds) {
        if (!cfg.allowedPrograms.includes(pid)) {
          throw new PolicyViolationError(
            'ALLOWED_PROGRAMS',
            `Program ${shortenId(pid)} not in allowedPrograms`
          );
        }
      }
    }
  }

  private checkInstructionCount(tx: AnyTransaction, cfg: PolicyConfig): void {
    if (cfg.maxInstructionsPerTx != null) {
      const count = countInstructions(tx);
      if (count > cfg.maxInstructionsPerTx) {
        throw new PolicyViolationError(
          'MAX_INSTRUCTIONS_PER_TX',
          `Transaction has ${count} instructions (max: ${cfg.maxInstructionsPerTx})`
        );
      }
    }
  }

  private checkMemoRequirement(tx: AnyTransaction, cfg: PolicyConfig): void {
    if (cfg.requireMemo && !hasMemoInstruction(tx)) {
      throw new PolicyViolationError(
        'REQUIRE_MEMO',
        'Transaction must include a Memo instruction'
      );
    }
  }

  private checkRateLimits(cfg: PolicyConfig): void {
    // Per-hour
    if (cfg.maxTxPerHour != null) {
      const count = this.stateManager.txCountInWindow(ONE_HOUR);
      if (count >= cfg.maxTxPerHour) {
        throw new PolicyViolationError(
          'MAX_TX_PER_HOUR',
          `${count}/${cfg.maxTxPerHour} txs in the last hour`
        );
      }
    }

    // Per-day
    if (cfg.maxTxPerDay != null) {
      const count = this.stateManager.txCountInWindow(ONE_DAY);
      if (count >= cfg.maxTxPerDay) {
        throw new PolicyViolationError(
          'MAX_TX_PER_DAY',
          `${count}/${cfg.maxTxPerDay} txs in the last 24h`
        );
      }
    }

    // Per-session
    if (cfg.maxTxPerSession != null) {
      if (this.stateManager.sessionTxCount >= cfg.maxTxPerSession) {
        throw new PolicyViolationError(
          'MAX_TX_PER_SESSION',
          `${this.stateManager.sessionTxCount}/${cfg.maxTxPerSession} txs this session`
        );
      }
    }
  }

  private checkSolLimits(tx: AnyTransaction, cfg: PolicyConfig): void {
    const solAmount = extractSolAmount(tx);
    this.checkSolAmountLimits(solAmount, cfg);
  }

  private checkSolAmountLimits(solAmount: number, cfg: PolicyConfig): void {
    // Per-tx
    if (cfg.maxSolPerTx != null && solAmount > cfg.maxSolPerTx) {
      throw new PolicyViolationError(
        'MAX_SOL_PER_TX',
        `${solAmount.toFixed(4)} SOL exceeds per-tx limit of ${cfg.maxSolPerTx} SOL`
      );
    }

    // Per-day (rolling 24h)
    if (cfg.maxSolPerDay != null) {
      const spent = this.stateManager.solSpentInWindow(ONE_DAY);
      if (spent + solAmount > cfg.maxSolPerDay) {
        throw new PolicyViolationError(
          'MAX_SOL_PER_DAY',
          `${(spent + solAmount).toFixed(4)}/${cfg.maxSolPerDay} SOL in the last 24h`
        );
      }
    }

    // Per-week (rolling 7d)
    if (cfg.maxSolPerWeek != null) {
      const spent = this.stateManager.solSpentInWindow(ONE_WEEK);
      if (spent + solAmount > cfg.maxSolPerWeek) {
        throw new PolicyViolationError(
          'MAX_SOL_PER_WEEK',
          `${(spent + solAmount).toFixed(4)}/${cfg.maxSolPerWeek} SOL in the last 7d`
        );
      }
    }

    // Per-session
    if (cfg.maxSolPerSession != null) {
      const spent = this.stateManager.sessionSolSpent;
      if (spent + solAmount > cfg.maxSolPerSession) {
        throw new PolicyViolationError(
          'MAX_SOL_PER_SESSION',
          `${(spent + solAmount).toFixed(4)}/${cfg.maxSolPerSession} SOL this session`
        );
      }
    }
  }

  private checkRecipient(to: string, cfg: PolicyConfig): void {
    // Blocked recipients
    if (cfg.blockedRecipients && cfg.blockedRecipients.length > 0) {
      if (cfg.blockedRecipients.includes(to)) {
        throw new PolicyViolationError(
          'BLOCKED_RECIPIENT',
          `Recipient ${shortenId(to)} is in blockedRecipients`
        );
      }
    }

    // Allowed recipients (whitelist)
    if (cfg.allowedRecipients && cfg.allowedRecipients.length > 0) {
      if (!cfg.allowedRecipients.includes(to)) {
        throw new PolicyViolationError(
          'ALLOWED_RECIPIENTS',
          `Recipient ${shortenId(to)} not in allowedRecipients`
        );
      }
    }

    // Unique recipients per day
    if (cfg.maxUniqueRecipientsPerDay != null) {
      const count = this.stateManager.uniqueRecipientsInDay();
      // Only check if this is a new recipient
      if (count >= cfg.maxUniqueRecipientsPerDay) {
        throw new PolicyViolationError(
          'MAX_UNIQUE_RECIPIENTS_PER_DAY',
          `${count}/${cfg.maxUniqueRecipientsPerDay} unique recipients in the last 24h`
        );
      }
    }
  }

  /**
   * Get the current config (for status display).
   */
  getCurrentConfig(): PolicyConfig {
    return this.getConfig();
  }

  /**
   * Get the state manager (for status display).
   */
  getStateManager(): PolicyStateManager {
    return this.stateManager;
  }
}

// ── Helpers ──────────────────────────────────────────────────

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
