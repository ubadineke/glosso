# SKILLS.md — Glosso Agentic Wallet Infrastructure

> Summary of all skills available in the Glosso ecosystem.
> Install any skill to give your AI agent autonomous on-chain capabilities.

---

## Overview

Glosso provides modular **skills** that give AI agents autonomous control over Solana wallets and DeFi operations. Each skill is a self-contained package with executable scripts, machine-readable capability manifests (`SKILL.md`), and one-command installation (`setup.sh`).

Skills are designed to work together but can be installed independently.

---

## Available Skills

### 1. glosso-wallet — Wallet Operations

**Package:** `packages/skills/glosso-wallet`

Provides core wallet operations: check balances (SOL + SPL tokens), send SOL transfers, and query transaction history.

| Function          | Description                        | Script                 |
|-------------------|------------------------------------|------------------------|
| `glosso_balance`  | Check SOL and token balances       | `scripts/balance.ts`   |
| `glosso_send`     | Send SOL to any address            | `scripts/send.ts`      |
| `glosso_history`  | Fetch recent transactions          | `scripts/history.ts`   |

**Requires:** Provisioned wallet (sovereign, privy, or turnkey mode)

**Install:**
```bash
cd packages/skills/glosso-wallet && bash scripts/setup.sh
```

---

### 2. glosso-pyth — Price Feeds

**Package:** `packages/skills/glosso-pyth`

Fetches real-time crypto price data from Pyth Network's Hermes API. No API key needed.

| Function                 | Description                     | Script              |
|--------------------------|---------------------------------|----------------------|
| `glosso_price`           | Get current price for assets    | `scripts/price.ts`  |
| `glosso_supported_feeds` | List supported trading pairs    | `scripts/price.ts`  |

**Supported Pairs:** SOL/USD, BTC/USD, ETH/USD, USDC/USD, USDT/USD, JUP/USD, BONK/USD, WIF/USD, PYTH/USD, RAY/USD

**Requires:** Nothing — read-only, no wallet needed

**Install:**
```bash
cd packages/skills/glosso-pyth && pnpm install
```

---

### 3. glosso-jupiter — Token Swaps

**Package:** `packages/skills/glosso-jupiter`

Quote and execute token swaps via Jupiter Aggregator. On devnet, swaps are simulated with approximate prices while proving the full signing pipeline works. On mainnet, real Jupiter V6 API routes are used.

| Function                   | Description                | Script              |
|----------------------------|----------------------------|----------------------|
| `glosso_quote`             | Get swap quote             | `scripts/swap.ts`   |
| `glosso_swap`              | Execute a token swap       | `scripts/swap.ts`   |
| `glosso_supported_tokens`  | List swappable tokens      | `scripts/swap.ts`   |

**Supported Tokens:** SOL, USDC, USDT, JUP, BONK, WIF, RAY

**Requires:** Provisioned wallet (for swap execution)

**Install:**
```bash
cd packages/skills/glosso-wallet && bash scripts/setup.sh
```

---

## Skill Composition

Skills can be combined for complex agent workflows:

```
1. glosso_price("SOL/USD")        → Know current SOL price
2. glosso_balance(0)              → Check how much SOL you have
3. glosso_quote("SOL", "USDC", 1) → Get a swap quote
4. glosso_swap("SOL", "USDC", 1)  → Execute the swap
5. glosso_history(0, 1)           → Verify the transaction
```

---

## Architecture

All skills are built on top of the **Glosso Core SDK** (`@glosso/core`), which provides:

- **Multi-mode wallets:** Sovereign (self-custody), Privy (managed TEE), Turnkey (HSM)
- **HD key derivation:** BIP44 path `m/44'/501'/{index}'/0'` for sub-wallets
- **AES-256-GCM encryption:** Keys encrypted at rest, derived on-demand, garbage collected immediately
- **Unified interface:** Same API regardless of wallet backend

See [SOVEREIGN_ARCHITECTURE.md](../../SOVEREIGN_ARCHITECTURE.md) for deep-dive on wallet security.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/<your-org>/glosso.git
cd glosso && pnpm install

# 2. Provision a wallet
pnpm glosso provision

# 3. Use skills
tsx packages/skills/glosso-wallet/scripts/balance.ts
tsx packages/skills/glosso-pyth/scripts/price.ts SOL/USD
tsx packages/skills/glosso-jupiter/scripts/swap.ts quote SOL USDC 0.1
```
