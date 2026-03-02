---
name: glosso-wallet
description: Autonomous Solana wallet — check balance, send SOL, and view transaction history on Solana
metadata: {"openclaw": {"emoji": "💳", "requires": {"bins": ["node"]}}}
---

# SKILL.md — glosso-wallet

> Machine-readable capability manifest for AI agents.
> Read this file once at startup to understand what you can do with your Solana wallet.

---

## Skill Identity

| Field       | Value                                                   |
|-------------|---------------------------------------------------------|
| Name        | glosso-wallet                                           |
| Version     | 0.1.0                                                   |
| Description | Autonomous Solana wallet — balance, send, and history   |
| Author      | Glosso                                                  |
| License     | MIT                                                     |
| Runtime     | Node.js ≥ 18 + tsx                                      |
| Network     | Solana devnet (default) / mainnet-beta                  |

---

## Prerequisites

The following environment variables MUST be set before calling any script:

| Variable                       | Required | Description                           |
|--------------------------------|----------|---------------------------------------|
| `GLOSSO_MODE`                  | Yes      | `sovereign`, `privy`, or `turnkey`    |
| `GLOSSO_MASTER_SEED_ENCRYPTED` | If sovereign | AES-256-GCM encrypted mnemonic   |
| `GLOSSO_ENCRYPTION_PASSWORD`   | If sovereign | Password to decrypt master seed  |
| `GLOSSO_NETWORK`               | No       | `devnet` (default) or `mainnet-beta`  |

Run `setup.sh` to provision automatically.

---

## Available Functions

### 1. `glosso_balance(index?, includeTokens?)`

**Script:** `tsx scripts/balance.ts [--index 0] [--tokens]`

**Purpose:** Check the SOL and SPL token balances of any sub-wallet.

**Parameters:**
| Name          | Type    | Default | Description                      |
|---------------|---------|---------|----------------------------------|
| `index`       | number  | `0`     | Sub-wallet derivation index      |
| `includeTokens` | boolean | `false` | Also fetch SPL token balances   |

**Returns:**
```json
{
  "address": "Bf8PxxWt7...",
  "index": 0,
  "sol": 1.5,
  "tokens": [
    { "mint": "EPjFWdd5...", "amount": 100.0, "decimals": 6 }
  ]
}
```

**When to use:** Before sending funds, to verify available balance. Before any DeFi operation.

---

### 2. `glosso_send(to, amountSol, index?)`

**Script:** `tsx scripts/send.ts <recipient> <amount_sol> [--index 0]`

**Purpose:** Send SOL from your wallet to any Solana address.

**Parameters:**
| Name       | Type   | Default | Description                        |
|------------|--------|---------|------------------------------------|
| `to`       | string | —       | Recipient Solana address (base58)  |
| `amountSol`| number | —       | Amount in SOL (e.g. 0.01)          |
| `index`    | number | `0`     | Sub-wallet derivation index        |

**Returns:**
```json
{
  "from": "Bf8PxxWt7...",
  "to": "7nYfs5E...",
  "amountSol": 0.01,
  "amountLamports": 10000000,
  "signature": "5xKp...",
  "explorer": "https://explorer.solana.com/tx/5xKp...?cluster=devnet"
}
```

**When to use:** To transfer SOL to another wallet. To pay for services. To fund sub-wallets.

**Caution:** This sends real funds. Always verify the amount and recipient before calling.

---

### 3. `glosso_history(index?, limit?)`

**Script:** `tsx scripts/history.ts [--index 0] [--limit 10]`

**Purpose:** Fetch recent transaction history for a wallet.

**Parameters:**
| Name    | Type   | Default | Description                          |
|---------|--------|---------|--------------------------------------|
| `index` | number | `0`     | Sub-wallet derivation index          |
| `limit` | number | `10`    | Max transactions to return           |

**Returns:**
```json
{
  "address": "Bf8PxxWt7...",
  "index": 0,
  "count": 3,
  "transactions": [
    {
      "signature": "5xKp...",
      "timestamp": "2025-01-15T10:30:00Z",
      "type": "transfer",
      "amountSol": 0.01,
      "from": "Bf8Pxx...",
      "to": "7nYfs5...",
      "status": "success",
      "explorer": "https://explorer.solana.com/tx/..."
    }
  ]
}
```

**When to use:** To audit recent activity. To verify a transaction went through. To monitor wallet activity.

---

## Sub-Wallet Indexes

Your wallet derives multiple addresses from a single seed:

| Index | Purpose         | Description                     |
|-------|----------------|---------------------------------|
| `0`   | Primary        | Main identity, receives funds   |
| `1`   | Trading        | DeFi operations, swaps          |
| `2`   | Vault          | Long-term storage               |
| `3`   | Burner         | Disposable, risky operations    |

Use the `index` parameter across all functions to operate on different sub-wallets.

---

## Constraints

- All amounts are in SOL (not lamports) for the public API
- Maximum 10 sub-wallets (index 0–9) recommended
- Network fees (~0.000005 SOL per transaction) apply
- SPL token transfers are NOT supported by `glosso_send` — use direct Solana instructions
- Rate limits: Devnet RPC limits apply (~100 req/10s)

---

## Error Handling

All functions throw on failure. Common errors:
- `"Invalid recipient address"` — address format is wrong
- `"Amount must be greater than 0"` — non-positive amount
- `"Insufficient balance"` — not enough SOL
- `"Failed to send transaction"` — network issue, retry

---

## Installation

```bash
bash {baseDir}/scripts/setup.sh
```

This installs dependencies and, if no wallet exists, runs the provisioning wizard.

## Agent: How to Provision a Wallet

If the user asks to **create a Solana wallet**, **set up a wallet**, or **choose a wallet type**:

1. Ask the user which mode they want: `sovereign` (self-custody), `privy` (TEE-based), or `turnkey` (HSM-based)
2. Run the provisioner with their chosen mode:
   ```bash
   npx tsx {baseDir}/../../../cli/src/index.ts provision --mode sovereign --dir ~/.glosso
   ```
   Replace `sovereign` with `privy` or `turnkey` based on their choice.
3. The provisioner writes credentials to `~/.glosso/.env` — all skill scripts load this automatically.
4. Wallet is ready. You can immediately call `glosso_balance()` to confirm.
