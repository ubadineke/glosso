/**
 * logger.ts — Structured activity logger for Glosso agents.
 *
 * Writes append-only JSON Lines to ~/.glosso/activity.log (default).
 * Every tool call, result, error, and agent reasoning is captured.
 *
 * Consumers:
 *   - `npx glosso logs`      — pretty tail (CLI)
 *   - `npx @glosso/monitor`  — live TUI dashboard
 *   - any tool reading JSONL
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

// ── Event Types ───────────────────────────────────────────

export type ActivityEventType =
  | 'agent_start'
  | 'agent_round'
  | 'agent_thinking'
  | 'agent_end'
  | 'tool_call'
  | 'tool_success'
  | 'tool_error'
  | 'wallet_sign'
  | 'price_check'
  | 'balance_check'
  | 'policy_block';

export interface ActivityEvent {
  type: ActivityEventType;
  tool?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  text?: string;
  signature?: string;
  explorer?: string;
  round?: number;
  maxRounds?: number;
  mode?: string;
  address?: string;
  network?: string;
  model?: string;
  [key: string]: unknown;
}

export interface LogEntry extends ActivityEvent {
  ts: string;
  id: string;
}

// ── Logger ────────────────────────────────────────────────

const DEFAULT_LOG_DIR = path.join(homedir(), '.glosso');
const DEFAULT_LOG_FILE = 'activity.log';

let _logPath: string | null = null;
let _sessionId: string | null = null;

/**
 * Generate a short session ID (8 hex chars).
 */
function newSessionId(): string {
  return Math.random().toString(16).slice(2, 10);
}

/**
 * Get / set the log file path.
 * Defaults to ~/.glosso/activity.log
 */
export function getLogPath(): string {
  if (_logPath) return _logPath;
  _logPath = path.join(DEFAULT_LOG_DIR, DEFAULT_LOG_FILE);
  return _logPath;
}

export function setLogPath(p: string): void {
  _logPath = p;
}

/**
 * Get / set the session ID.
 * A session groups all events from one agent run.
 */
export function getSessionId(): string {
  if (!_sessionId) _sessionId = newSessionId();
  return _sessionId;
}

export function setSessionId(id: string): void {
  _sessionId = id;
}

/**
 * Append a structured event to the log file.
 *
 * This is the only write function — everything goes through here.
 * It's synchronous to guarantee ordering and simplicity.
 */
export function logEvent(event: ActivityEvent): void {
  const logPath = getLogPath();

  // Ensure directory exists
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    id: getSessionId(),
    ...event,
  };

  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(logPath, line, 'utf-8');
}

// ── Convenience helpers ───────────────────────────────────

/** Log agent session start */
export function logAgentStart(opts: {
  mode?: string;
  address?: string;
  network?: string;
  model?: string;
  maxRounds?: number;
}): void {
  logEvent({ type: 'agent_start', ...opts });
}

/** Log a new agent round */
export function logAgentRound(round: number, maxRounds: number): void {
  logEvent({ type: 'agent_round', round, maxRounds });
}

/** Log agent reasoning text */
export function logAgentThinking(text: string): void {
  logEvent({ type: 'agent_thinking', text });
}

/** Log agent session end */
export function logAgentEnd(rounds: number): void {
  logEvent({ type: 'agent_end', round: rounds });
}

/** Log a tool being called */
export function logToolCall(tool: string, args?: Record<string, unknown>): void {
  logEvent({ type: 'tool_call', tool, args });
}

/** Log a successful tool result */
export function logToolSuccess(
  tool: string,
  result: Record<string, unknown>
): void {
  logEvent({
    type: 'tool_success',
    tool,
    result,
    signature: result.signature as string | undefined,
    explorer: result.explorer as string | undefined,
  });
}

/** Log a tool error */
export function logToolError(tool: string, error: string): void {
  logEvent({ type: 'tool_error', tool, error });
}

/** Log a price check result */
export function logPriceCheck(
  symbol: string,
  price: number,
  confidence: number
): void {
  logEvent({
    type: 'price_check',
    tool: 'get_sol_price',
    result: { symbol, price, confidence },
  });
}

/** Log a balance check result */
export function logBalanceCheck(
  address: string,
  sol: number,
  network: string
): void {
  logEvent({
    type: 'balance_check',
    tool: 'get_balance',
    result: { address, sol, network },
  });
}

// ── Log reader (for CLI / monitor) ────────────────────────

/**
 * Read log entries from the activity log.
 * Supports optional session filter and tail (last N entries).
 */
export function readLogEntries(opts?: {
  sessionId?: string;
  tail?: number;
  logPath?: string;
}): LogEntry[] {
  const logPath = opts?.logPath || getLogPath();

  if (!fs.existsSync(logPath)) return [];

  const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
  let entries: LogEntry[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  // Filter by session if specified
  if (opts?.sessionId) {
    entries = entries.filter((e) => e.id === opts.sessionId);
  }

  // Tail
  if (opts?.tail && entries.length > opts.tail) {
    entries = entries.slice(-opts.tail);
  }

  return entries;
}

/**
 * List unique session IDs in the log (most recent last).
 */
export function listSessions(logPath?: string): string[] {
  const entries = readLogEntries({ logPath });
  const seen = new Set<string>();
  const sessions: string[] = [];

  for (const e of entries) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      sessions.push(e.id);
    }
  }

  return sessions;
}
