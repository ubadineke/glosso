---
name: glosso-jupiter
description: Token swap quotes and execution on Solana via Jupiter Aggregator. Tokens - SOL, USDC, USDT, JUP, BONK, WIF, RAY. Requires provisioned glosso-wallet. Run tsx {baseDir}/scripts/swap.ts quote SOL USDC 0.1 for quote, tsx {baseDir}/scripts/swap.ts swap SOL USDC 0.1 to execute. Read {baseDir}/SKILL.md for full docs.
metadata: {"openclaw": {"emoji": "🔄", "requires": {"bins": ["node"]}}}
---

# SKILL.md — glosso-jupiter

> Machine-readable capability manifest for AI agents.
> Read this file to understand how to quote and execute token swaps on Solana.

---

## Skill Identity

| Field       | Value                                                  |
|-------------|-------------------------------------------------------|
| Name        | glosso-jupiter                                        |
| Version     | 0.1.0                                                  |
| Description | Token swap quotes and execution via Jupiter Aggregator |
| Author      | Glosso                                                  |
| License     | MIT                                                     |
| Runtime     | Node.js ≥ 18 + tsx                                      |
| Network     | Devnet (simulated) / Mainnet (real Jupiter V6 API)     |

---

## Prerequisites

Requires a provisioned Glosso wallet for swap execution (not for quotes).

| Variable                       | Required       | Description                         |
|--------------------------------|---------------|-------------------------------------|
| `GLOSSO_MODE`                  | For swaps     | `sovereign`, `privy`, or `turnkey`  |
| `GLOSSO_MASTER_SEED_ENCRYPTED` | If sovereign  | AES-256-GCM encrypted mnemonic     |
| `GLOSSO_ENCRYPTION_PASSWORD`   | If sovereign  | Password to decrypt master seed     |
| `GLOSSO_NETWORK`               | No            | `devnet` (default) or `mainnet-beta`|

---

## Available Functions

### 1. `glosso_quote(inputToken, outputToken, amount, slippage?)`

**Script:** `tsx scripts/swap.ts quote <from> <to> <amount> [--slippage 1.0]`

**Purpose:** Get a swap quote — estimated output amount, price impact, route.

**Parameters:**
| Name          | Type   | Default | Description                        |
|---------------|--------|---------|------------------------------------|
| `inputToken`  | string | —       | Input token symbol (e.g. `SOL`)    |
| `outputToken` | string | —       | Output token symbol (e.g. `USDC`)  |
| `amount`      | number | —       | Amount of input token to swap      |
| `slippage`    | number | `1.0`   | Slippage tolerance in percent      |

**Returns:**
```json
{
  "inputToken": "SOL",
  "outputToken": "USDC",
  "inputAmount": 0.1,
  "outputAmount": 14.025,
  "priceImpact": 0.1,
  "slippage": 1.0,
  "route": "SOL → USDC (devnet simulated)",
  "network": "devnet"
}
```

**When to use:** Before executing a swap, to check the expected output and price impact. Always quote before swapping.

---

### 2. `glosso_swap(inputToken, outputToken, amount, slippage?, index?)`

**Script:** `tsx scripts/swap.ts swap <from> <to> <amount> [--slippage 1.0] [--index 0]`

**Purpose:** Execute a token swap.

**Parameters:**
| Name          | Type   | Default | Description                        |
|---------------|--------|---------|------------------------------------|
| `inputToken`  | string | —       | Input token symbol (e.g. `SOL`)    |
| `outputToken` | string | —       | Output token symbol (e.g. `USDC`)  |
| `amount`      | number | —       | Amount of input token to swap      |
| `slippage`    | number | `1.0`   | Slippage tolerance in percent      |
| `index`       | number | `0`     | Sub-wallet derivation index        |

**Returns:**
```json
{
  "inputToken": "SOL",
  "outputToken": "USDC",
  "inputAmount": 0.1,
  "outputAmount": 14.025,
  "priceImpact": 0.1,
  "slippage": 1.0,
  "route": "SOL → USDC (devnet simulated)",
  "network": "devnet",
  "signature": "5xKp...",
  "explorer": "https://explorer.solana.com/tx/5xKp...?cluster=devnet"
}
```

**When to use:** To execute a token swap after checking the quote.

**Caution:** This executes a real transaction. Always get a quote first and verify the output amount is acceptable.

---

### 3. `glosso_supported_tokens()`

**Script:** `tsx scripts/swap.ts` (no arguments)

**Purpose:** List all supported input/output tokens.

**Supported Tokens:**
`SOL`, `USDC`, `USDT`, `JUP`, `BONK`, `WIF`, `RAY`

---

## Network Behavior

| Network        | Behavior                                              |
|---------------|-------------------------------------------------------|
| `devnet`      | Simulated swap — quote uses approximate prices, swap executes a self-transfer to prove signing pipeline works |
| `mainnet-beta`| Real swap — uses Jupiter V6 Aggregator API for best-route execution |

On devnet, the quote is calculated using approximate market prices. The swap transaction is a real on-chain self-transfer (proves the full sign→send flow works) but does not actually exchange tokens.

---

## Constraints

- Jupiter Aggregator is mainnet-only — devnet uses simulation
- Slippage is in percent (1.0 = 1%)
- Price impact > 5% is risky — consider smaller amounts
- Only tokens with Jupiter liquidity are swappable on mainnet
- Raw mint addresses can be used instead of symbols
- Network fees apply (~0.000005 SOL)

---

## Error Handling

- `"Unknown token"` — symbol not recognized, use raw mint address
- `"No devnet price for"` — token not in devnet simulation table
- `"Jupiter quote error"` — mainnet API issue
- `"Insufficient balance"` — not enough tokens to swap

---

## Installation

```bash
bash scripts/setup.sh    # in the glosso-wallet skill directory
```

This skill requires the glosso-wallet skill to be provisioned first.
