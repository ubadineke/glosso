/**
 * state.ts — Rolling counter state management for the policy engine.
 *
 * Manages a sliding window of transaction records. Supports both
 * in-memory (ephemeral) and file-persisted (survives restarts) modes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import type { PolicyState, TxRecord, PolicyPersistenceOptions } from './types.js';

const DEFAULT_STATE_PATH = path.join(homedir(), '.glosso', 'policy-state.json');

// Keep 7 days of history max (for weekly windows) — prune older entries
const MAX_HISTORY_SECONDS = 7 * 24 * 60 * 60;

export class PolicyStateManager {
  private state: PolicyState;
  private persist: boolean;
  private stateFile: string;

  constructor(opts?: PolicyPersistenceOptions) {
    this.persist = opts?.persist ?? false;
    this.stateFile = opts?.stateFile ?? DEFAULT_STATE_PATH;

    if (this.persist && fs.existsSync(this.stateFile)) {
      try {
        const raw = fs.readFileSync(this.stateFile, 'utf-8');
        this.state = JSON.parse(raw);
      } catch {
        this.state = this.freshState();
      }
    } else {
      this.state = this.freshState();
    }
  }

  private freshState(): PolicyState {
    return {
      txs: [],
      sessionStartedAt: Math.floor(Date.now() / 1000),
      sessionTxCount: 0,
      sessionSolSpent: 0,
    };
  }

  /**
   * Record a new transaction. Call AFTER a successful sign/send.
   */
  recordTx(solAmount: number, recipient?: string): void {
    const now = Math.floor(Date.now() / 1000);

    this.state.txs.push({ ts: now, solAmount, recipient });
    this.state.sessionTxCount++;
    this.state.sessionSolSpent += solAmount;

    // Prune entries older than 7 days
    const cutoff = now - MAX_HISTORY_SECONDS;
    this.state.txs = this.state.txs.filter((r) => r.ts >= cutoff);

    if (this.persist) this.save();
  }

  /**
   * Count txs in the last N seconds.
   */
  txCountInWindow(windowSeconds: number): number {
    const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
    return this.state.txs.filter((r) => r.ts >= cutoff).length;
  }

  /**
   * Sum SOL spent in the last N seconds.
   */
  solSpentInWindow(windowSeconds: number): number {
    const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
    return this.state.txs
      .filter((r) => r.ts >= cutoff)
      .reduce((sum, r) => sum + r.solAmount, 0);
  }

  /**
   * Count unique recipients in the last 24h.
   */
  uniqueRecipientsInDay(): number {
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    const recipients = new Set(
      this.state.txs.filter((r) => r.ts >= cutoff && r.recipient).map((r) => r.recipient)
    );
    return recipients.size;
  }

  /**
   * Session counters (process lifetime).
   */
  get sessionTxCount(): number {
    return this.state.sessionTxCount;
  }

  get sessionSolSpent(): number {
    return this.state.sessionSolSpent;
  }

  get sessionStartedAt(): number {
    return this.state.sessionStartedAt;
  }

  /**
   * Get the full state (for CLI status display).
   */
  getState(): Readonly<PolicyState> {
    return this.state;
  }

  /**
   * Reset all counters. Used by `glosso policy reset-counters`.
   */
  reset(): void {
    this.state = this.freshState();
    if (this.persist) this.save();
  }

  private save(): void {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8');
  }
}
