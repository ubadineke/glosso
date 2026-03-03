---
name: glosso-pyth
description: Real-time crypto price feeds via Pyth Network Hermes API (free, no key). Pairs - SOL/USD, BTC/USD, ETH/USD, USDC/USD, USDT/USD, JUP/USD, BONK/USD, WIF/USD, PYTH/USD, RAY/USD. Run tsx {baseDir}/scripts/price.ts SOL/USD to get price. Read {baseDir}/SKILL.md for full docs.
metadata: {"openclaw": {"emoji": "📊", "requires": {"bins": ["node"]}}}
---

# SKILL.md — glosso-pyth

> Machine-readable capability manifest for AI agents.
> Read this file to understand how to fetch real-time crypto price data.

---

## Skill Identity

| Field       | Value                                              |
|-------------|---------------------------------------------------|
| Name        | glosso-pyth                                       |
| Version     | 0.1.0                                              |
| Description | Real-time crypto price feeds via Pyth Network      |
| Author      | Glosso                                              |
| License     | MIT                                                 |
| Runtime     | Node.js ≥ 18 + tsx                                  |
| API         | Pyth Hermes (free, no API key required)             |

---

## Prerequisites

No environment variables required. Pyth Hermes is a free public API.

---

## Available Functions

### 1. `glosso_price(...symbols)`

**Script:** `tsx scripts/price.ts <symbol> [<symbol2> ...]`

**Purpose:** Fetch the latest real-time price for one or more crypto assets.

**Parameters:**
| Name      | Type     | Description                        |
|-----------|----------|------------------------------------|
| `symbols` | string[] | One or more trading pair symbols   |

**Supported Symbols:**
`SOL/USD`, `BTC/USD`, `ETH/USD`, `USDC/USD`, `USDT/USD`, `JUP/USD`, `BONK/USD`, `WIF/USD`, `PYTH/USD`, `RAY/USD`

**Returns:**
```json
[
  {
    "symbol": "SOL/USD",
    "price": 140.25,
    "confidence": 0.08,
    "timestamp": "2025-01-15T10:30:00.000Z",
    "feedId": "0xef0d8b..."
  }
]
```

**Examples:**
```bash
tsx scripts/price.ts SOL/USD                    # Single price
tsx scripts/price.ts BTC/USD ETH/USD SOL/USD    # Multiple prices
```

**When to use:**
- Before executing a swap to check current price
- To make informed trading decisions
- To monitor price movements across assets
- To calculate portfolio value

---

### 2. `glosso_supported_feeds()`

**Script:** `tsx scripts/price.ts` (no arguments)

**Purpose:** List all supported price feed symbols.

**Returns:** Array of supported symbol strings.

---

## Constraints

- Prices are from Pyth Network oracle — highly reliable, sub-second updates
- Confidence interval tells you the price uncertainty (lower = more reliable)
- Prices are USD-denominated
- No API key or authentication needed
- Rate limits: Hermes is generous, but avoid > 100 requests/second
- Not all Solana tokens are supported — only major pairs listed above

---

## Error Handling

- `"At least one symbol is required"` — no symbols provided
- `"Unsupported symbol: XYZ/USD"` — symbol not in supported list
- Network errors — Hermes endpoint unreachable, retry after a moment

---

## Installation

```bash
pnpm install    # from the glosso-pyth directory
```

No provisioning needed — this skill is read-only (no wallet required).
