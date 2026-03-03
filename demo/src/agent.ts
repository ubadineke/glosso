/**
 * agent.ts — Autonomous AI Trading Agent
 *
 * An AI agent powered by Grok (xAI) that uses Glosso wallet infrastructure
 * to autonomously monitor prices and execute trades on Solana devnet.
 *
 * The agent runs in a loop:
 *   1. Grok receives market context + tool definitions
 *   2. Grok decides which tools to call (price check, balance, swap)
 *   3. Glosso executes the on-chain transactions autonomously
 *   4. Results fed back to Grok for next decision
 *
 * Usage:
 *   export XAI_API_KEY=xai-xxxxx
 *   npx tsx src/agent.ts
 *
 * Or with wallet env pre-loaded:
 *   npx tsx src/agent.ts --rounds 5 --interval 20
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import OpenAI from 'openai';
import { TOOL_DEFINITIONS, executeTool } from './tools';

// ── Load .env files (priority order) ──────────────────────
// 1. demo/.env          (local dev — project env)
// 2. repo root .env     (project-wide config)
// 3. ~/.glosso/.env     (provisioned wallet — OpenClaw / VM compat)
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  readFileSync(filePath, 'utf-8')
    .split('\n')
    .forEach((line) => {
      const l = line.replace(/^export\s+/, '').trim();
      const i = l.indexOf('=');
      if (i > 0 && !l.startsWith('#')) {
        const k = l.slice(0, i).trim();
        const v = l.slice(i + 1).trim().replace(/^"|"$|^'|'$/g, '');
        if (k && !process.env[k]) process.env[k] = v;
      }
    });
}

// __dirname = demo/src — go up one level to reach demo/
const demoDir = path.resolve(__dirname, '..');      // demo/
const repoRoot = path.resolve(__dirname, '../..'); // repo root

loadEnvFile(path.join(demoDir, '.env'));            // demo/.env       ← primary
loadEnvFile(path.join(repoRoot, '.env'));           // repo root .env
loadEnvFile(path.join(homedir(), '.glosso', '.env')); // ~/.glosso/.env

// ── Config ─────────────────────────────────────────────────

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error(
    '✗ XAI_API_KEY not set.\n\n' +
      '  Add to demo/.env:       XAI_API_KEY=xai-xxxxx\n' +
      '  Or export in shell:     export XAI_API_KEY=xai-xxxxx\n'
  );
  process.exit(1);
}

const MODEL = process.env.GROK_MODEL || 'grok-3-mini-fast';

const args = process.argv.slice(2);
const roundsIdx = args.indexOf('--rounds');
const MAX_ROUNDS = roundsIdx >= 0 ? parseInt(args[roundsIdx + 1], 10) : 5;
const intervalIdx = args.indexOf('--interval');
const INTERVAL_SEC = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) : 30;

// ── Grok Client (OpenAI-compatible) ────────────────────────

const grok = new OpenAI({
  apiKey: XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

// ── System Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are an autonomous AI trading agent operating on Solana devnet using Drift Protocol for perpetual futures trading.
You have a Glosso wallet that signs and broadcasts real on-chain transactions WITHOUT any human approval.

Your tools:
- get_sol_price: Check real-time SOL/USD price from Pyth oracle
- get_balance: Check your wallet's SOL balance
- deposit_collateral: Deposit SOL into Drift Protocol as trading collateral (required before trading)
- open_perp_position: Open a SOL-PERP long or short position on Drift
- close_perp_position: Close your current SOL-PERP position
- get_position: Check your current Drift perp position, PnL, and direction

Your workflow:
1. Check SOL price and wallet balance
2. If no collateral deposited yet, deposit 0.5 SOL into Drift
3. Analyze the price — decide long or short
4. Open a SOL-PERP position (0.1 to 0.5 SOL size)
5. In later rounds, check position PnL and decide whether to hold or close
6. Report every transaction signature and explorer link

IMPORTANT RULES:
- Always check price AND balance before any action
- Deposit collateral before trying to open a position
- Max position size: 0.5 SOL (devnet safety)
- Max deposit: 1 SOL (devnet safety)
- Explain your reasoning before each trade
- After any transaction, report the Solana Explorer link
- These are REAL on-chain Drift Protocol transactions — not simulations

You are demonstrating that an AI agent can autonomously deposit collateral and trade perpetual futures on Drift Protocol using Glosso wallet infrastructure on Solana.`;

// ── Agent Loop ─────────────────────────────────────────────

async function runAgentRound(
  roundNumber: number,
  conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<void> {
  console.log(
    `\n${'═'.repeat(60)}\n  🤖 ROUND ${roundNumber}/${MAX_ROUNDS}  —  ${new Date().toLocaleTimeString()}\n${'═'.repeat(60)}\n`
  );

  // Add the user prompt for this round
  conversationHistory.push({
    role: 'user',
    content: `Round ${roundNumber}: Analyze the current market and decide whether to trade. Check price and balance first, then act.`,
  });

  // Agent may need multiple turns to call tools and get results
  let iterationCount = 0;
  const MAX_ITERATIONS = 10; // safety limit

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;

    const response = await grok.chat.completions.create({
      model: MODEL,
      messages: conversationHistory,
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
    });

    const message = response.choices[0].message;

    // Add assistant message to history
    conversationHistory.push(message);

    // If no tool calls, the agent is done reasoning
    if (!message.tool_calls || message.tool_calls.length === 0) {
      if (message.content) {
        console.log(`\n💬 Agent:\n${message.content}\n`);
      }
      break;
    }

    // Process each tool call
    for (const toolCall of message.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown> = {};

      try {
        fnArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        fnArgs = {};
      }

      console.log(`  🔧 Calling: ${fnName}(${JSON.stringify(fnArgs)})`);

      try {
        const result = await executeTool(fnName, fnArgs);
        const resultStr = JSON.stringify(result, null, 2);
        console.log(`  ✅ Result: ${resultStr}`);

        // Highlight on-chain transaction links
        if (result && typeof result === 'object') {
          const r = result as Record<string, unknown>;
          if (r.signature && r.explorer) {
            console.log(`\n  🔗 Transaction confirmed on-chain!`);
            console.log(`     Tool      : ${fnName}`);
            console.log(`     Signature : ${r.signature}`);
            console.log(`     Explorer  : ${r.explorer}\n`);
          }
        }

        // Add tool result to history
        conversationHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: resultStr,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ❌ Error: ${errorMsg}`);

        conversationHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorMsg }),
        });
      }
    }
  }
}

async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 GLOSSO — Autonomous AI Trading Agent            ║
║                                                          ║
║     Model:    ${MODEL.padEnd(41)}║
║     Network:  Solana Devnet                              ║
║     Rounds:   ${String(MAX_ROUNDS).padEnd(41)}║
║     Interval: ${(INTERVAL_SEC + 's').padEnd(41)}║
╚══════════════════════════════════════════════════════════╝
  `);

  // Initialize conversation with system prompt
  const conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
    ];

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    try {
      await runAgentRound(round, conversationHistory);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`\n❌ Round ${round} failed: ${errorMsg}`);

      // If rate limited, wait longer
      if (errorMsg.includes('rate') || errorMsg.includes('429')) {
        console.log('⏳ Rate limited — waiting 60s...');
        await sleep(60_000);
      }
    }

    // Wait between rounds (except after the last one)
    if (round < MAX_ROUNDS) {
      console.log(`\n⏳ Next round in ${INTERVAL_SEC}s...\n`);
      await sleep(INTERVAL_SEC * 1000);
    }
  }

  console.log(`
╔══════════════════════════════════════════════════════════╗
║     ✅ Agent session complete — ${MAX_ROUNDS} rounds finished          ║
╚══════════════════════════════════════════════════════════╝
  `);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Entry point ────────────────────────────────────────────
main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
