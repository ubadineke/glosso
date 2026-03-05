/**
 * test-logger.ts — Generate realistic mock agent sessions for TUI demo.
 *
 * Usage:
 *   npx tsx scripts/test-logger.ts              — write all events at once
 *   npx tsx scripts/test-logger.ts --live        — drip events with realistic delays (for live TUI demo)
 *   npx tsx scripts/test-logger.ts --clean       — clear log and write fresh
 */
import {
  logAgentStart,
  logAgentRound,
  logAgentThinking,
  logToolCall,
  logToolSuccess,
  logToolError,
  logAgentEnd,
  getLogPath,
  setSessionId,
} from '../packages/core/src/utils/logger';
import * as fs from 'fs';

const args = process.argv.slice(2);
const isLive = args.includes('--live');
const isClean = args.includes('--clean');

if (isClean) {
  const logPath = getLogPath();
  if (fs.existsSync(logPath)) fs.writeFileSync(logPath, '', 'utf-8');
  console.log('Cleared activity log.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function emit(fn: () => void, delayMs = 0) {
  if (isLive && delayMs > 0) await sleep(delayMs);
  fn();
}

async function runSession1() {
  // Session 1: Sovereign wallet — full trading cycle on Drift
  setSessionId('demo-sv01');

  await emit(() =>
    logAgentStart({
      mode: 'sovereign',
      address: '9w56obAnvFhVtkpcPNFDnYpN1zbKAV8W8FjyK3Vp5sPT',
      network: 'devnet',
      model: 'grok-3-mini-fast',
      maxRounds: 5,
    })
  );

  // ── Round 1: Reconnaissance ─────────────────────────────
  await emit(() => logAgentRound(1, 5), 1500);

  await emit(() => logToolCall('get_sol_price', {}), 800);
  await emit(
    () =>
      logToolSuccess('get_sol_price', {
        symbol: 'SOL/USD',
        price: 142.87,
        confidence: 0.06,
        timestamp: new Date().toISOString(),
      }),
    600
  );

  await emit(() => logToolCall('get_balance', {}), 500);
  await emit(
    () =>
      logToolSuccess('get_balance', {
        address: '9w56obAnvFhVtkpcPNFDnYpN1zbKAV8W8FjyK3Vp5sPT',
        sol: 4.82,
        network: 'devnet',
      }),
    400
  );

  await emit(
    () =>
      logAgentThinking(
        'SOL at $142.87 with tight confidence band. Balance is 4.82 SOL. No collateral deposited yet — I need to fund my Drift account before trading. Depositing 1.5 SOL as initial collateral.'
      ),
    1200
  );

  // ── Round 2: Deposit collateral ─────────────────────────
  await emit(() => logAgentRound(2, 5), 2000);

  await emit(() => logToolCall('deposit_collateral', { amountSol: 1.5 }), 800);
  await emit(
    () =>
      logToolSuccess('deposit_collateral', {
        depositedSol: 1.5,
        signature: '4vJ9kM3nRtP7wX2yA5bC8dE1fGhI6jK4lMnO9pQrStUvWxYz',
        explorer:
          'https://explorer.solana.com/tx/4vJ9kM3nRtP7wX2yA5bC8dE1fGhI6jK4lMnO9pQrStUvWxYz?cluster=devnet',
      }),
    3000
  );

  await emit(
    () =>
      logAgentThinking(
        'Collateral deposited successfully. 1.5 SOL now available for margin trading. SOL price shows bullish momentum — opening a long position.'
      ),
    1000
  );

  // ── Round 3: Open long position ─────────────────────────
  await emit(() => logAgentRound(3, 5), 2000);

  await emit(() => logToolCall('get_sol_price', {}), 600);
  await emit(
    () =>
      logToolSuccess('get_sol_price', {
        symbol: 'SOL/USD',
        price: 143.52,
        confidence: 0.05,
        timestamp: new Date().toISOString(),
      }),
    500
  );

  await emit(
    () =>
      logAgentThinking(
        'Price ticked up to $143.52 from $142.87 — confirming bullish momentum. Opening 0.3 SOL long on SOL-PERP.'
      ),
    1000
  );

  await emit(
    () => logToolCall('open_perp_position', { direction: 'long', sizeSol: 0.3 }),
    800
  );
  await emit(
    () =>
      logToolSuccess('open_perp_position', {
        direction: 'long',
        sizeSol: 0.3,
        marketIndex: 0,
        signature: '2hTnBm5qRsV8wK1yC4dF7eG3iHjL6kNpO9rQtSuUvWxYz0aB',
        explorer:
          'https://explorer.solana.com/tx/2hTnBm5qRsV8wK1yC4dF7eG3iHjL6kNpO9rQtSuUvWxYz0aB?cluster=devnet',
      }),
    2500
  );

  // ── Round 4: Monitor position ───────────────────────────
  await emit(() => logAgentRound(4, 5), 3000);

  await emit(() => logToolCall('get_position', {}), 600);
  await emit(
    () =>
      logToolSuccess('get_position', {
        hasPosition: true,
        direction: 'long',
        baseSize: 0.3,
        quoteEntry: 43.06,
        unrealizedPnl: 0.28,
        marketIndex: 0,
      }),
    800
  );

  await emit(() => logToolCall('get_sol_price', {}), 500);
  await emit(
    () =>
      logToolSuccess('get_sol_price', {
        symbol: 'SOL/USD',
        price: 144.41,
        confidence: 0.07,
        timestamp: new Date().toISOString(),
      }),
    500
  );

  await emit(
    () =>
      logAgentThinking(
        'Position is in profit at +$0.28. SOL moved to $144.41. Holding — the trend is strong. Will check again next round.'
      ),
    1000
  );

  // ── Round 5: Take profit ────────────────────────────────
  await emit(() => logAgentRound(5, 5), 3000);

  await emit(() => logToolCall('get_position', {}), 600);
  await emit(
    () =>
      logToolSuccess('get_position', {
        hasPosition: true,
        direction: 'long',
        baseSize: 0.3,
        quoteEntry: 43.06,
        unrealizedPnl: 0.65,
        marketIndex: 0,
      }),
    800
  );

  await emit(
    () =>
      logAgentThinking(
        'PnL increased to +$0.65. Taking profit — closing the long position to lock in gains before any reversal.'
      ),
    1200
  );

  await emit(() => logToolCall('close_perp_position', {}), 800);
  // First close attempt fails with RPC timeout
  await emit(
    () =>
      logToolError(
        'close_perp_position',
        'SendTransactionError: Transaction was not confirmed in 30.28 seconds. It is unknown if it succeeded or failed. Check signature 7pFnLm… using the Solana Explorer.'
      ),
    2200
  );

  await emit(
    () =>
      logAgentThinking(
        'Close transaction timed out — RPC congestion. Will retry the close. Position still open.'
      ),
    1000
  );

  // Retry close — succeeds
  await emit(() => logToolCall('close_perp_position', {}), 800);
  await emit(
    () =>
      logToolSuccess('close_perp_position', {
        closedMarketIndex: 0,
        signature: '7pFnLm8qWsX3vK2yB5cD9eR1gHjI4kNtO6rSuUvAxYz0aC3d',
        explorer:
          'https://explorer.solana.com/tx/7pFnLm8qWsX3vK2yB5cD9eR1gHjI4kNtO6rSuUvAxYz0aC3d?cluster=devnet',
      }),
    2500
  );

  await emit(() => logToolCall('get_balance', {}), 600);
  await emit(
    () =>
      logToolSuccess('get_balance', {
        address: '9w56obAnvFhVtkpcPNFDnYpN1zbKAV8W8FjyK3Vp5sPT',
        sol: 3.97,
        network: 'devnet',
      }),
    400
  );

  // Send profit to treasury wallet
  await emit(
    () =>
      logAgentThinking(
        'Session complete. Realized +$0.65. Distributing 0.3 SOL to treasury wallet as per strategy config.'
      ),
    1000
  );

  await emit(
    () =>
      logToolCall('send', {
        to: 'TrEasury7xKpLmN3wPqRsT4uVyX6zA7bC8dE9fGhI1jK',
        amountSol: 0.3,
      }),
    800
  );
  // First send fails — insufficient gas buffer
  await emit(
    () =>
      logToolError(
        'send',
        'Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1 (insufficient lamports for rent exemption)'
      ),
    1800
  );

  await emit(
    () =>
      logAgentThinking(
        'Send failed — reducing amount to 0.2 SOL to keep minimum rent-exempt balance.'
      ),
    800
  );

  await emit(
    () =>
      logToolCall('send', {
        to: 'TrEasury7xKpLmN3wPqRsT4uVyX6zA7bC8dE9fGhI1jK',
        amountSol: 0.2,
      }),
    600
  );
  await emit(
    () =>
      logToolSuccess('send', {
        to: 'TrEasury7xKpLmN3wPqRsT4uVyX6zA7bC8dE9fGhI1jK',
        amountSol: 0.2,
        signature: 'Aa2BcDeFgHiJkLmNoPqRsTuVwXyZ9876543210abcdefghij',
        explorer:
          'https://explorer.solana.com/tx/Aa2BcDeFgHiJkLmNoPqRsTuVwXyZ9876543210abcdefghij?cluster=devnet',
      }),
    2000
  );

  await emit(() => logAgentEnd(5), 500);
}

async function runSession2() {
  // Session 2: Privy wallet — failed trade attempt + recovery
  setSessionId('demo-pv02');

  await emit(
    () =>
      logAgentStart({
        mode: 'privy',
        address: '75RpLHKdM4d89kqcA5y9U6zBeptFGSG1Rj7g2vFSgmWF',
        network: 'devnet',
        model: 'grok-3-mini-fast',
        maxRounds: 4,
      }),
    2000
  );

  // ── Round 1 ─────────────────────────────────────────────
  await emit(() => logAgentRound(1, 4), 1500);

  await emit(() => logToolCall('get_sol_price', {}), 600);
  await emit(
    () =>
      logToolSuccess('get_sol_price', {
        symbol: 'SOL/USD',
        price: 138.21,
        confidence: 0.12,
        timestamp: new Date().toISOString(),
      }),
    500
  );

  await emit(() => logToolCall('get_balance', {}), 400);
  await emit(
    () =>
      logToolSuccess('get_balance', {
        address: '75RpLHKdM4d89kqcA5y9U6zBeptFGSG1Rj7g2vFSgmWF',
        sol: 20.0,
        network: 'devnet',
      }),
    400
  );

  await emit(
    () =>
      logAgentThinking(
        'SOL dropped to $138.21 with wider confidence band (0.12). This signals bearish pressure. I\'ll deposit and open a short.'
      ),
    1000
  );

  await emit(() => logToolCall('deposit_collateral', { amountSol: 0.8 }), 800);
  await emit(
    () =>
      logToolSuccess('deposit_collateral', {
        depositedSol: 0.8,
        signature: '5nGhI3jK7lMnO2pQrStUvWxYzAbCdEfGhIjKlMnOpQrSt',
        explorer:
          'https://explorer.solana.com/tx/5nGhI3jK7lMnO2pQrStUvWxYzAbCdEfGhIjKlMnOpQrSt?cluster=devnet',
      }),
    2800
  );

  // ── Round 2: Attempt short — fails ──────────────────────
  await emit(() => logAgentRound(2, 4), 2000);

  await emit(
    () =>
      logToolCall('open_perp_position', { direction: 'short', sizeSol: 0.5 }),
    800
  );
  await emit(
    () =>
      logToolError(
        'open_perp_position',
        'Transaction simulation failed: Error Number: 6010. Error Message: User Has No Position In Market.'
      ),
    2000
  );

  await emit(
    () =>
      logAgentThinking(
        'Position open failed — market error 6010. May need to initialize the market subscription. Retrying with smaller size.'
      ),
    1200
  );

  await emit(
    () =>
      logToolCall('open_perp_position', { direction: 'short', sizeSol: 0.2 }),
    800
  );
  await emit(
    () =>
      logToolSuccess('open_perp_position', {
        direction: 'short',
        sizeSol: 0.2,
        marketIndex: 0,
        signature: '8qFnLm4pWsX9vK2yC5dR1eG3hJi6kNtO7rSuUvBxYz0aC4e',
        explorer:
          'https://explorer.solana.com/tx/8qFnLm4pWsX9vK2yC5dR1eG3hJi6kNtO7rSuUvBxYz0aC4e?cluster=devnet',
      }),
    2500
  );

  // ── Round 3: Price drops — short is profitable ──────────
  await emit(() => logAgentRound(3, 4), 3000);

  await emit(() => logToolCall('get_sol_price', {}), 600);
  await emit(
    () =>
      logToolSuccess('get_sol_price', {
        symbol: 'SOL/USD',
        price: 135.89,
        confidence: 0.09,
        timestamp: new Date().toISOString(),
      }),
    500
  );

  await emit(() => logToolCall('get_position', {}), 500);
  await emit(
    () =>
      logToolSuccess('get_position', {
        hasPosition: true,
        direction: 'short',
        baseSize: 0.2,
        quoteEntry: 27.64,
        unrealizedPnl: 0.46,
        marketIndex: 0,
      }),
    700
  );

  await emit(
    () =>
      logAgentThinking(
        'Short is working — SOL dropped from $138.21 to $135.89. Unrealized PnL +$0.46 on 0.2 SOL short. Taking profit.'
      ),
    1200
  );

  await emit(() => logToolCall('close_perp_position', {}), 800);
  await emit(
    () =>
      logToolSuccess('close_perp_position', {
        closedMarketIndex: 0,
        signature: '3kMnL9pQrStUvWxYzAbCdEf2hIjKlMnOpQrStUvWxYz0aB',
        explorer:
          'https://explorer.solana.com/tx/3kMnL9pQrStUvWxYzAbCdEf2hIjKlMnOpQrStUvWxYz0aB?cluster=devnet',
      }),
    2500
  );

  // ── Round 4: Wrap up ────────────────────────────────────
  await emit(() => logAgentRound(4, 4), 2000);

  await emit(() => logToolCall('get_balance', {}), 500);
  await emit(
    () =>
      logToolSuccess('get_balance', {
        address: '75RpLHKdM4d89kqcA5y9U6zBeptFGSG1Rj7g2vFSgmWF',
        sol: 19.66,
        network: 'devnet',
      }),
    400
  );

  // Try to send 2 SOL to second wallet — fails: not enough balance after collateral lock
  await emit(
    () =>
      logToolCall('send', {
        to: 'SecWlt3nRtP7wX2yA5bC8dE1fGhI6jK4lMn9pQrStUvWxYz',
        amountSol: 2.0,
      }),
    800
  );
  await emit(
    () =>
      logToolError(
        'send',
        'Transaction simulation failed: insufficient funds for transfer. Available: 19.66 SOL, collateral locked: 0.8 SOL, free: 18.86 SOL. Requested: 2.0 SOL (exceeds safe limit with fee buffer).'
      ),
    1800
  );

  await emit(
    () =>
      logAgentThinking(
        'Transfer of 2 SOL rejected — available liquid balance after collateral lock is 18.86 SOL but fee buffer check failed. Retrying with 1.5 SOL.'
      ),
    900
  );

  await emit(
    () =>
      logToolCall('send', {
        to: 'SecWlt3nRtP7wX2yA5bC8dE1fGhI6jK4lMn9pQrStUvWxYz',
        amountSol: 1.5,
      }),
    600
  );
  await emit(
    () =>
      logToolSuccess('send', {
        to: 'SecWlt3nRtP7wX2yA5bC8dE1fGhI6jK4lMn9pQrStUvWxYz',
        amountSol: 1.5,
        signature: 'Bb7CdEfGhIjKlMnOpQrStUvWxYz1234567890abcdefghij',
        explorer:
          'https://explorer.solana.com/tx/Bb7CdEfGhIjKlMnOpQrStUvWxYz1234567890abcdefghij?cluster=devnet',
      }),
    2000
  );

  await emit(
    () =>
      logAgentThinking(
        'Short trade realized +$0.46. One error recovered from. Transfer of 1.5 SOL complete. Final balance 19.66 SOL. Good session — the Privy signing pipeline handled all transactions correctly.'
      ),
    1000
  );

  await emit(() => logAgentEnd(4), 500);
}

async function runSession3() {
  // Session 3: Turnkey wallet — rapid multi-tool sequence
  setSessionId('demo-tk03');

  await emit(
    () =>
      logAgentStart({
        mode: 'turnkey',
        address: 'EzwNi5jN2xTjaZRqAigXzKp4KyzcN8bXkwA1PHfckGo5',
        network: 'devnet',
        model: 'grok-3-mini-fast',
        maxRounds: 3,
      }),
    2000
  );

  // ── Round 1 ─────────────────────────────────────────────
  await emit(() => logAgentRound(1, 3), 1500);

  await emit(() => logToolCall('get_sol_price', {}), 500);
  await emit(
    () =>
      logToolSuccess('get_sol_price', {
        symbol: 'SOL/USD',
        price: 146.03,
        confidence: 0.04,
        timestamp: new Date().toISOString(),
      }),
    400
  );

  await emit(() => logToolCall('get_balance', {}), 300);
  await emit(
    () =>
      logToolSuccess('get_balance', {
        address: 'EzwNi5jN2xTjaZRqAigXzKp4KyzcN8bXkwA1PHfckGo5',
        sol: 8.15,
        network: 'devnet',
      }),
    400
  );

  await emit(
    () =>
      logAgentThinking(
        'SOL at $146.03 with very tight confidence (0.04) — strong signal. Balance 8.15 SOL. Depositing 2 SOL.'
      ),
    1000
  );

  // First deposit attempt fails — blockhash expired (common on congested devnet)
  await emit(() => logToolCall('deposit_collateral', { amountSol: 2.0 }), 800);
  await emit(
    () =>
      logToolError(
        'deposit_collateral',
        'BlockhashNotFound: Transaction uses a blockhash that has expired or is otherwise invalid. Please retry the transaction.'
      ),
    2200
  );

  await emit(
    () =>
      logAgentThinking(
        'Deposit failed — blockhash expired mid-flight. Fetching fresh blockhash and retrying deposit.'
      ),
    800
  );

  // Retry — succeeds
  await emit(() => logToolCall('deposit_collateral', { amountSol: 2.0 }), 600);
  await emit(
    () =>
      logToolSuccess('deposit_collateral', {
        depositedSol: 2.0,
        signature: '9aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcdefghij',
        explorer:
          'https://explorer.solana.com/tx/9aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcdefghij?cluster=devnet',
      }),
    2800
  );

  // ── Round 2 ─────────────────────────────────────────────
  await emit(() => logAgentRound(2, 3), 2000);

  await emit(
    () => logToolCall('open_perp_position', { direction: 'long', sizeSol: 0.5 }),
    600
  );
  await emit(
    () =>
      logToolSuccess('open_perp_position', {
        direction: 'long',
        sizeSol: 0.5,
        marketIndex: 0,
        signature: '1xYzAbCdEfGhIjKlMnOpQrStUvWxYz0aBcDeFgHiJkLmNo',
        explorer:
          'https://explorer.solana.com/tx/1xYzAbCdEfGhIjKlMnOpQrStUvWxYz0aBcDeFgHiJkLmNo?cluster=devnet',
      }),
    2500
  );

  await emit(() => logToolCall('get_position', {}), 1500);
  await emit(
    () =>
      logToolSuccess('get_position', {
        hasPosition: true,
        direction: 'long',
        baseSize: 0.5,
        quoteEntry: 73.02,
        unrealizedPnl: -0.15,
        marketIndex: 0,
      }),
    700
  );

  await emit(
    () =>
      logAgentThinking(
        'Slight loss at -$0.15 but within normal noise. Holding. HSM-signed via Turnkey — sub-second signing latency confirmed.'
      ),
    1000
  );

  // ── Round 3 ─────────────────────────────────────────────
  await emit(() => logAgentRound(3, 3), 3000);

  await emit(() => logToolCall('get_sol_price', {}), 500);
  await emit(
    () =>
      logToolSuccess('get_sol_price', {
        symbol: 'SOL/USD',
        price: 147.89,
        confidence: 0.05,
        timestamp: new Date().toISOString(),
      }),
    400
  );

  await emit(() => logToolCall('get_position', {}), 500);
  await emit(
    () =>
      logToolSuccess('get_position', {
        hasPosition: true,
        direction: 'long',
        baseSize: 0.5,
        quoteEntry: 73.02,
        unrealizedPnl: 0.93,
        marketIndex: 0,
      }),
    700
  );

  await emit(
    () =>
      logAgentThinking(
        'SOL pumped to $147.89. Long position now +$0.93 on 0.5 SOL. Excellent trade — closing to realize profit.'
      ),
    1000
  );

  await emit(() => logToolCall('close_perp_position', {}), 800);
  await emit(
    () =>
      logToolSuccess('close_perp_position', {
        closedMarketIndex: 0,
        signature: '6mNoPqRsTuVwXyZ9aBcDeFgHiJkLmNoPqRsTuVwXyZ012',
        explorer:
          'https://explorer.solana.com/tx/6mNoPqRsTuVwXyZ9aBcDeFgHiJkLmNoPqRsTuVwXyZ012?cluster=devnet',
      }),
    2500
  );

  await emit(() => logToolCall('get_balance', {}), 500);
  await emit(
    () =>
      logToolSuccess('get_balance', {
        address: 'EzwNi5jN2xTjaZRqAigXzKp4KyzcN8bXkwA1PHfckGo5',
        sol: 7.08,
        network: 'devnet',
      }),
    400
  );

  // Send to treasury
  await emit(
    () =>
      logAgentThinking(
        'Session complete. +$0.93 realized. Sending 0.5 SOL to treasury address as per Turnkey policy.'
      ),
    800
  );

  await emit(
    () =>
      logToolCall('send', {
        to: 'TrEasury7xKpLmN3wPqRsT4uVyX6zA7bC8dE9fGhI1jK',
        amountSol: 0.5,
      }),
    600
  );
  await emit(
    () =>
      logToolSuccess('send', {
        to: 'TrEasury7xKpLmN3wPqRsT4uVyX6zA7bC8dE9fGhI1jK',
        amountSol: 0.5,
        signature: 'Cc9DeFgHiJkLmNoPqRsTuVwXyZ1234567890abcdefghij',
        explorer:
          'https://explorer.solana.com/tx/Cc9DeFgHiJkLmNoPqRsTuVwXyZ1234567890abcdefghij?cluster=devnet',
      }),
    2000
  );

  await emit(
    () =>
      logAgentThinking(
        'Treasury transfer confirmed. 3 wallet modes demonstrated — sovereign, privy, turnkey — all signing real Drift Protocol transactions on Solana devnet autonomously.'
      ),
    1200
  );

  await emit(() => logAgentEnd(3), 500);
}

async function main() {
  console.log(isLive ? '▶ Live mode — dripping events with delays...\n' : '▶ Writing all events at once...\n');

  await runSession1();
  console.log('  ✅ Session 1 (sovereign) — 5 rounds, long trade +$0.65, close timeout+retry, failed send+retry, treasury transfer');

  await runSession2();
  console.log('  ✅ Session 2 (privy)    — 4 rounds, short trade +$0.46, open error+retry, failed send+retry');

  await runSession3();
  console.log('  ✅ Session 3 (turnkey)  — 3 rounds, long trade +$0.93, deposit blockhash+retry, treasury transfer');

  console.log(`\n  📄 Log: ${getLogPath()}`);
  console.log('  View: npx tsx packages/cli/src/index.ts logs --tail 50');
  console.log('  TUI:  npx tsx packages/monitor/src/index.tsx\n');
}

main().catch(console.error);
