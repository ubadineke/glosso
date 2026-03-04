/**
 * tools.ts — Real Drift Protocol trading tools for the AI agent.
 *
 * Tools exposed to the LLM:
 *   1. get_sol_price       — Real-time SOL/USD from Pyth oracle
 *   2. get_balance          — Wallet SOL balance via Glosso
 *   3. deposit_collateral   — Deposit SOL into Drift as collateral
 *   4. open_perp_position   — Open a SOL-PERP long/short on Drift
 *   5. close_perp_position  — Close existing SOL-PERP position
 *   6. get_position         — Check current Drift perp position
 *
 * All transactions are real on-chain devnet transactions signed
 * autonomously by the Glosso wallet — mode-agnostic (sovereign/turnkey/privy).
 */

import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  DriftClient,
  initialize as driftInitialize,
  BN,
  BASE_PRECISION,
  QUOTE_PRECISION,
  PRICE_PRECISION,
  PositionDirection,
  getMarketOrderParams,
  BulkAccountLoader,
  convertToNumber,
  PerpMarkets,
  getMarketsAndOraclesForSubscription,
} from '@drift-labs/sdk';
import { GlossoWallet } from '@glosso/core';

// ── Glosso Wallet (singleton — mode-agnostic) ─────────────

let _glossoWallet: GlossoWallet | null = null;

function getGlossoWallet(): GlossoWallet {
  if (!_glossoWallet) _glossoWallet = new GlossoWallet();
  return _glossoWallet;
}

function getConnection(): Connection {
  const network = process.env.GLOSSO_NETWORK || 'devnet';
  return new Connection(
    clusterApiUrl(network as 'devnet' | 'mainnet-beta'),
    'confirmed'
  );
}

// ── Drift Client (cached) ─────────────────────────────────

let _driftClient: DriftClient | null = null;
let _driftSubscribed = false;

async function getDriftClient(): Promise<DriftClient> {
  if (_driftClient && _driftSubscribed) return _driftClient;

  const env = (process.env.GLOSSO_NETWORK as 'devnet' | 'mainnet-beta') || 'devnet';
  const sdkConfig = driftInitialize({ env });

  const connection = getConnection();
  const wallet = getGlossoWallet();
  const driftWallet = await wallet.toDriftWallet();

  const bulkAccountLoader = new BulkAccountLoader(
    connection as any,
    'confirmed',
    1000
  );

  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } =
    getMarketsAndOraclesForSubscription(env);

  _driftClient = new DriftClient({
    connection: connection as any,
    wallet: driftWallet as any,
    programID: new PublicKey(sdkConfig.DRIFT_PROGRAM_ID),
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos,
    env,
  });

  await _driftClient.subscribe();
  _driftSubscribed = true;

  return _driftClient;
}

// ── Tool 1: Get SOL Price (Pyth) ──────────────────────────

const PYTH_FEED_SOL_USD =
  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
const HERMES_URL = 'https://hermes.pyth.network';

export interface PriceResult {
  symbol: string;
  price: number;
  confidence: number;
  timestamp: string;
}

export async function get_sol_price(): Promise<PriceResult> {
  const id = PYTH_FEED_SOL_USD.replace('0x', '');
  const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${id}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pyth API error: ${res.status}`);

  const data = (await res.json()) as {
    parsed: Array<{
      id: string;
      price: { price: string; conf: string; expo: number; publish_time: number };
    }>;
  };

  const entry = data.parsed?.[0];
  if (!entry) throw new Error('No price data returned from Pyth');

  const price = parseFloat(entry.price.price) * Math.pow(10, entry.price.expo);
  const confidence = parseFloat(entry.price.conf) * Math.pow(10, entry.price.expo);

  return {
    symbol: 'SOL/USD',
    price: parseFloat(price.toFixed(4)),
    confidence: parseFloat(confidence.toFixed(4)),
    timestamp: new Date(entry.price.publish_time * 1000).toISOString(),
  };
}

// ── Tool 2: Get Wallet Balance ────────────────────────────

export interface BalanceResult {
  address: string;
  sol: number;
  network: string;
}

export async function get_balance(): Promise<BalanceResult> {
  const wallet = getGlossoWallet();
  const address = await wallet.getAddress();
  const connection = getConnection();
  const balance = await connection.getBalance(new PublicKey(address));

  return {
    address,
    sol: balance / LAMPORTS_PER_SOL,
    network: process.env.GLOSSO_NETWORK || 'devnet',
  };
}

// ── Tool 3: Deposit SOL Collateral into Drift ─────────────

export interface DepositResult {
  depositedSol: number;
  signature: string;
  explorer: string;
}

export async function deposit_collateral(
  amountSol: number
): Promise<DepositResult> {
  if (amountSol <= 0 || amountSol > 2) {
    throw new Error('Deposit amount must be between 0 and 2 SOL (devnet safety limit)');
  }

  const driftClient = await getDriftClient();
  const amountLamports = new BN(Math.round(amountSol * LAMPORTS_PER_SOL));

  // Spot market index: 0 = USDC, 1 = SOL
  const SOL_SPOT_MARKET_INDEX = 1;

  // Check if user account exists, if not initialize + deposit
  try {
    await driftClient.getUser().getUserAccount();
  } catch {
    // User account doesn't exist — initialize it with the deposit
    // Returns [TransactionSignature, PublicKey]
    const [txSig] = await driftClient.initializeUserAccountAndDepositCollateral(
      amountLamports,
      driftClient.wallet.publicKey,
      SOL_SPOT_MARKET_INDEX
    );
    const sigStr = String(txSig);
    const cluster = process.env.GLOSSO_NETWORK || 'devnet';
    return {
      depositedSol: amountSol,
      signature: sigStr,
      explorer: `https://explorer.solana.com/tx/${sigStr}?cluster=${cluster}`,
    };
  }

  // Existing account — just deposit
  const sig = await driftClient.deposit(
    amountLamports,
    SOL_SPOT_MARKET_INDEX,
    driftClient.wallet.publicKey
  );
  const sigStr = String(sig);
  const cluster = process.env.GLOSSO_NETWORK || 'devnet';

  return {
    depositedSol: amountSol,
    signature: sigStr,
    explorer: `https://explorer.solana.com/tx/${sigStr}?cluster=${cluster}`,
  };
}

// ── Tool 4: Open Perp Position ────────────────────────────

export interface PositionOpenResult {
  direction: string;
  sizeSol: number;
  marketIndex: number;
  signature: string;
  explorer: string;
}

export async function open_perp_position(
  direction: 'long' | 'short',
  sizeSol: number
): Promise<PositionOpenResult> {
  if (sizeSol <= 0 || sizeSol > 1) {
    throw new Error('Position size must be between 0 and 1 SOL (devnet safety limit)');
  }

  const driftClient = await getDriftClient();
  const env = (process.env.GLOSSO_NETWORK as 'devnet' | 'mainnet-beta') || 'devnet';

  // Find SOL-PERP market
  const solPerp = PerpMarkets[env].find(
    (m) => m.baseAssetSymbol === 'SOL'
  );
  if (!solPerp) throw new Error('SOL-PERP market not found on ' + env);

  const baseAmount = new BN(Math.round(sizeSol * 1e9)); // BASE_PRECISION = 1e9

  const orderParams = getMarketOrderParams({
    baseAssetAmount: baseAmount,
    direction:
      direction === 'long' ? PositionDirection.LONG : PositionDirection.SHORT,
    marketIndex: solPerp.marketIndex,
  });

  const sig = await driftClient.placePerpOrder(orderParams);
  const sigStr = String(sig);

  const cluster = process.env.GLOSSO_NETWORK || 'devnet';

  return {
    direction,
    sizeSol,
    marketIndex: solPerp.marketIndex,
    signature: sigStr,
    explorer: `https://explorer.solana.com/tx/${sigStr}?cluster=${cluster}`,
  };
}

// ── Tool 5: Close Perp Position ───────────────────────────

export interface CloseResult {
  closedMarketIndex: number;
  signature: string;
  explorer: string;
}

export async function close_perp_position(): Promise<CloseResult> {
  const driftClient = await getDriftClient();
  const env = (process.env.GLOSSO_NETWORK as 'devnet' | 'mainnet-beta') || 'devnet';

  const solPerp = PerpMarkets[env].find(
    (m) => m.baseAssetSymbol === 'SOL'
  );
  if (!solPerp) throw new Error('SOL-PERP market not found');

  const sig = await driftClient.closePosition(solPerp.marketIndex);
  const sigStr = String(sig);

  const cluster = process.env.GLOSSO_NETWORK || 'devnet';

  return {
    closedMarketIndex: solPerp.marketIndex,
    signature: sigStr,
    explorer: `https://explorer.solana.com/tx/${sigStr}?cluster=${cluster}`,
  };
}

// ── Tool 6: Get Current Position ──────────────────────────

export interface PositionInfo {
  hasPosition: boolean;
  direction: string | null;
  baseSize: number;
  quoteEntry: number;
  unrealizedPnl: number;
  marketIndex: number;
}

export async function get_position(): Promise<PositionInfo> {
  const driftClient = await getDriftClient();
  const env = (process.env.GLOSSO_NETWORK as 'devnet' | 'mainnet-beta') || 'devnet';

  const solPerp = PerpMarkets[env].find(
    (m) => m.baseAssetSymbol === 'SOL'
  );
  if (!solPerp) throw new Error('SOL-PERP market not found');

  const user = driftClient.getUser();

  try {
    const position = user.getPerpPosition(solPerp.marketIndex);

    if (!position || position.baseAssetAmount.isZero()) {
      return {
        hasPosition: false,
        direction: null,
        baseSize: 0,
        quoteEntry: 0,
        unrealizedPnl: 0,
        marketIndex: solPerp.marketIndex,
      };
    }

    const baseSize = convertToNumber(position.baseAssetAmount, BASE_PRECISION);
    const quoteEntry = convertToNumber(
      position.quoteEntryAmount,
      QUOTE_PRECISION
    );

    const unrealizedPnl = user.getUnrealizedPNL(true, solPerp.marketIndex);
    const pnlNumber = convertToNumber(unrealizedPnl, QUOTE_PRECISION);

    return {
      hasPosition: true,
      direction: baseSize > 0 ? 'long' : 'short',
      baseSize: Math.abs(baseSize),
      quoteEntry: Math.abs(quoteEntry),
      unrealizedPnl: pnlNumber,
      marketIndex: solPerp.marketIndex,
    };
  } catch {
    return {
      hasPosition: false,
      direction: null,
      baseSize: 0,
      quoteEntry: 0,
      unrealizedPnl: 0,
      marketIndex: solPerp.marketIndex,
    };
  }
}

// ── Tool Definitions for Grok (OpenAI-compatible) ─────────

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_sol_price',
      description:
        'Fetch the real-time SOL/USD price from the Pyth Network oracle. Returns price, confidence interval, and timestamp.',
      parameters: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_balance',
      description:
        'Check the SOL balance of the Glosso wallet on devnet. Returns wallet address and SOL balance.',
      parameters: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'deposit_collateral',
      description:
        'Deposit SOL from the Glosso wallet into Drift Protocol as trading collateral. Must deposit before opening perp positions. The transaction is signed autonomously by the Glosso wallet. This interacts with the real Drift program on Solana devnet.',
      parameters: {
        type: 'object' as const,
        properties: {
          amountSol: {
            type: 'number' as const,
            description: 'Amount of SOL to deposit as collateral (max 2 SOL for devnet)',
          },
        },
        required: ['amountSol'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_perp_position',
      description:
        'Open a SOL-PERP perpetual futures position on Drift Protocol devnet. The Glosso wallet autonomously signs the Drift program instruction. Requires collateral deposited first.',
      parameters: {
        type: 'object' as const,
        properties: {
          direction: {
            type: 'string' as const,
            enum: ['long', 'short'],
            description: '"long" to bet price goes up, "short" to bet price goes down',
          },
          sizeSol: {
            type: 'number' as const,
            description: 'Position size in SOL (max 1 SOL for devnet safety)',
          },
        },
        required: ['direction', 'sizeSol'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'close_perp_position',
      description:
        'Close the current SOL-PERP position on Drift Protocol. The Glosso wallet autonomously signs the close transaction.',
      parameters: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_position',
      description:
        'Check the current SOL-PERP position on Drift Protocol. Returns direction, size, entry value, and unrealized PnL.',
      parameters: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
  },
];

// ── Tool Dispatcher ───────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'get_sol_price':
      return get_sol_price();
    case 'get_balance':
      return get_balance();
    case 'deposit_collateral':
      return deposit_collateral(args.amountSol as number);
    case 'open_perp_position':
      return open_perp_position(
        args.direction as 'long' | 'short',
        args.sizeSol as number
      );
    case 'close_perp_position':
      return close_perp_position();
    case 'get_position':
      return get_position();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Standalone test ───────────────────────────────────────
if (require.main === module || process.argv[1]?.includes('tools')) {
  (async () => {
    console.log('Testing tools...\n');

    console.log('1. get_sol_price:');
    const price = await get_sol_price();
    console.log(JSON.stringify(price, null, 2));

    console.log('\n2. get_balance:');
    const balance = await get_balance();
    console.log(JSON.stringify(balance, null, 2));

    console.log('\nTools OK ✓');
  })().catch((e) => {
    console.error('Tool test failed:', e.message);
    process.exit(1);
  });
}
