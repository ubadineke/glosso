# Glosso

> *From Glossokomon (γλωσσόκομον) — the ancient Greek word for a keeper of precious things.*

**Agentic wallet infrastructure for Solana.** Glosso gives any AI agent an autonomous, production-grade Solana wallet it fully controls — no human approval loop, no key exposure, no framework lock-in.

---

![Glosso Comparison](/glosso-comparison.png)

## The Problem

AI agents on Solana can analyze markets, generate trade signals, and construct transactions — but when it comes to actually signing and sending them, most architectures require a human to click approve. The key lives in a `.env` file the agent can read, which means the private key sits in the agent's context. One prompt injection, one dependency compromise, and the wallet is gone.

The missing primitive is not just "a wallet the agent can use." It is **wallet infrastructure designed from the ground up for autonomous operation** — where key material never appears in the agent's context, where the signing method can be swapped without rewriting a single tool, and where the agent's capabilities are declared in a machine-readable file it can read and reason over.

That is what Glosso is.

---

## What Glosso Does

An agent built on Glosso follows a clean two-phase lifecycle:

**Phase 1 — Provision (one time, by the operator):**
```bash
npx glosso provision --mode sovereign
```
The CLI generates a wallet, encrypts the keys, writes minimal config to `.env`, and drops a `GLOSSO.md` capability manifest into the agent's working directory. The raw private key is never printed. The operator sees only the public address.

**Phase 2 — Runtime (fully autonomous):**
The agent reads `GLOSSO.md` to discover what it can do, then calls wallet operations through the Glosso SDK. It signs transactions, sends SOL, opens Drift perpetual positions, and queries prices from Pyth — all without human input.

```
Agent reads GLOSSO.md → discovers capabilities
       ↓
Agent calls glosso.sign(tx)
       ↓
Glosso routes to the configured adapter (sovereign / privy / turnkey)
       ↓
Adapter signs in an isolated context → key material discarded
       ↓
Signed transaction broadcast to Solana
```

---

## Wallet Modes

Glosso has three signing backends, selectable at provision time and hot-swappable at runtime. The agent's code doesn't change between them — only the `.env` config does.

### Sovereign
The fully self-custodial mode. A BIP39 mnemonic is generated locally, encrypted with AES-256-GCM, and stored in `.env`. Every sign call goes through a **decrypt → derive → sign → discard** cycle. The private key exists only for the duration of a single function call, then goes out of scope.

Best for: development, trusted server environments, operators who want zero external dependencies.

### Privy
Keys are held in Privy's Trusted Execution Environments. Signing happens via Privy's REST API — the agent sends an unsigned transaction, Privy signs it inside the enclave and returns the signed bytes. The private key never exists outside the TEE.

Best for: production agents, cloud deployments, teams that want enterprise key management without running their own HSM.

### Turnkey
HSM-backed signing through Turnkey's stamped API. Sub-100ms signing latency, policy-gated operations, full audit trail. The agent authenticates with an API key pair; Turnkey's HSMs handle the actual ed25519 signing.

Best for: production at scale, compliance requirements, agents that need policy controls (spending limits, allowlists).

### Switching Modes
```bash
npx glosso switch --mode turnkey
# Your active wallet is now EzwNi5jN2xTjaZRqAigXzKp4KyzcN8bXkwA1PHfckGo5
```

The switch command updates `GLOSSO_MODE` in `.env` and logs the new wallet address. All subsequent operations route to the new adapter.

---

## The Signing Abstraction

Every adapter implements the same `WalletAdapter` interface:

```typescript
interface WalletAdapter {
  getAddress(index?: number): Promise<string>;
  getBalance(index?: number): Promise<number>;
  sign(tx: Transaction, index?: number): Promise<Transaction>;
  signVersioned(tx: VersionedTransaction, index?: number): Promise<VersionedTransaction>;
  send(to: string, lamports: number, index?: number): Promise<string>;
}
```

On top of this, `GlossoWallet` exposes `signAny()` and `toDriftWallet()` — the latter producing a fully Drift SDK-compatible `IWallet` object, allowing Glosso-managed wallets to be passed directly into Drift's transaction handler without any adapter code in the agent.

The type detection is automatic:

```typescript
signAny(tx: AnyTransaction) {
  return isVersionedTx(tx)
    ? this.adapter.signVersioned(tx)
    : this.adapter.sign(tx);
}
```

---

## Sovereign Security Model

Since the sovereign adapter handles cryptography entirely in software, it is worth understanding exactly what it protects against and where the limits are.

### Key Derivation Path

```
Passphrase (from .env)
    ↓
PBKDF2-SHA256  (100,000 iterations, 32-byte random salt)
    ↓
AES-256 key (32 bytes)
    ↓  decrypt
Encrypted blob in .env: base64( salt[32] | iv[16] | authTag[16] | ciphertext )
    ↓
BIP39 mnemonic (lives in function scope only)
    ↓
mnemonicToSeedSync() → 64-byte seed
    ↓
SLIP-0010 derivation  m/44'/501'/{index}'/0'
    ↓
Ed25519 keypair → sign → keypair goes out of scope
```

AES-256-GCM provides both confidentiality and integrity. The auth tag means that any modification to the encrypted blob — a single flipped bit — causes decryption to throw rather than produce a corrupted key. PBKDF2 at 100K iterations adds ~100ms per decrypt, which is negligible for agent operations but makes brute-forcing the passphrase computationally expensive.

### HD Wallet Structure

One mnemonic derives unlimited independent wallets:

```
Mnemonic ──┬── m/44'/501'/0'/0'  →  Primary wallet
           ├── m/44'/501'/1'/0'  →  Trading wallet
           ├── m/44'/501'/2'/0'  →  Vault wallet
           └── m/44'/501'/N'/0'  →  Any purpose
```

Each index produces a fully independent Ed25519 keypair. Knowing one sub-wallet's private key reveals nothing about any other index or the root mnemonic. Derivation is hardened at every level.

### What It Protects Against

| Threat | Protection |
|---|---|
| `.env` file read without passphrase | AES-256-GCM encryption — ciphertext is useless without the key |
| Ciphertext tampering | GCM auth tag — modified blobs fail to decrypt |
| Passphrase brute-force | PBKDF2 with 100K iterations — ~$1M+ compute to crack a strong passphrase |
| Key appearing in logs or API responses | Key is never returned from any function — only signatures are |
| One sub-wallet revealing another | Hardened SLIP-0010 derivation — mathematically isolated |

### Honest Limits

The sovereign adapter is software. If the Node.js process is compromised (malicious dependency, attached debugger, memory dump), key material could be read from the heap during a sign call. For agents handling significant value, use Privy or Turnkey mode — both push signing into hardened environments that are isolated from the application process.

If you store `GLOSSO_ENCRYPTION_PASSPHRASE` and `GLOSSO_MASTER_SEED_ENCRYPTED` in the same `.env` file on the same machine, they should both be exfiltrated for a full compromise. Separate them — put the passphrase in a secrets manager and only the encrypted seed in `.env`.

---

## The Skill System

Glosso's capabilities are modular and agent-discoverable. Each skill is a self-contained package with a `SKILL.md` manifest that an LLM can read directly to understand what tools are available and how to use them.

### Available Skills

**glosso-wallet** — Core wallet operations
- Check SOL and SPL token balances
- Send SOL transfers to any address
- Query transaction history

**glosso-pyth** — Real-time price feeds via Pyth Network's Hermes API
- Fetches prices for SOL, BTC, ETH, USDC, JUP, BONK, WIF, and more
- No API key required — read-only, Pyth is public infrastructure

**glosso-jupiter** — Token swaps via Jupiter aggregator
- Get swap quotes across all Jupiter-supported routes
- Execute swaps with configured slippage tolerance

**glosso-drift** — Perpetual futures trading on Drift Protocol
- Deposit and withdraw collateral
- Open and close SOL-PERP positions (long/short)
- Query open positions and unrealized PnL

### How Skills Wire Into Agents

When the CLI provisions a wallet, it writes a `GLOSSO.md` file into the agent's working directory. This file lists all installed skills and their available functions. The agent's system prompt instructs it to read this file at startup, so it always knows exactly what it can and can't do — without hardcoding capability lists in prompts.

```markdown
## Available Skills
- **glosso-drift** — Drift perpetual futures: deposit_collateral, open_perp_position,
  get_position, close_perp_position
- **glosso-pyth** — Price feeds: get_sol_price
```

The agent model reads this and generates tool calls accordingly. Adding a new skill is as simple as running its setup script — the capability file is regenerated and the agent picks it up on next start.

---

## CLI Reference

```bash
# Provision a new wallet
npx glosso provision --mode sovereign|privy|turnkey [--network devnet|mainnet-beta]

# Check current wallet status
npx glosso status

# Switch active wallet mode
npx glosso switch --mode <mode>

# View activity logs
npx glosso logs                          # all events
npx glosso logs --tail 50               # last 50 events
npx glosso logs --follow                 # live tail (like tail -f)
npx glosso logs --sessions               # list all sessions
npx glosso logs --session <id>          # filter to one session

# Launch TUI dashboard
npx glosso monitor
```

---

## Activity Monitoring

Every agent operation — tool calls, results, thinking steps, transaction signatures — is written to `~/.glosso/activity.log` as append-only JSON Lines. Two observability layers read from this file:

### CLI Log Viewer (`glosso logs`)

Color-coded, human-readable log tail. Good for quick inspection after a session or piping into grep.

```
16:37:44 [demo-sv01]  START  sovereign • 9w56ob…5sPT • devnet
16:37:44 [demo-sv01]  ROUND 1/5
16:37:44 [demo-sv01] 🔧 get_sol_price({})
16:37:44 [demo-sv01]   ✅  SOL = $142.87
16:37:44 [demo-sv01] 🔧 open_perp_position({"direction":"long","sizeSol":0.3})
16:37:44 [demo-sv01]   ✅  long 0.3 SOL  2hTnBm…z0aB  ↗ explorer
16:37:44 [demo-sv01]   ✖ close_perp_position  SendTransactionError: not confirmed in 30.28s
16:37:44 [demo-sv01]   ✅  closed market #0  7pFnLm…aC3d  ↗ explorer
```

### TUI Dashboard (`glosso monitor`)

A full-terminal Ink/React dashboard with live file watching. Panels:

- **Header** — mode (color-coded), short address, network, live spinner, clock
- **Wallet Panel** — current SOL balance, open position (direction/size/PnL), agent round counter
- **Activity Feed** — scrolling event feed with icons, tool results, agent reasoning, explorer links
- **Price Chart** — SOL/USD sparkline + bar chart from price feed calls. Shows high/low, % change direction, and a TX success/failure rate bar
- **Status Bar** — animated pulse, TX count, error count, last tool result

```bash
# Run the dashboard (requires a real terminal TTY, not redirected output)
npx tsx packages/monitor/src/index.tsx

# Live demo with events dripping in real time
npx tsx scripts/test-logger.ts --clean --live   # second terminal
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Install

```bash
git clone https://github.com/ubadineke/glosso
cd glosso
pnpm install
```

### Provision a wallet

```bash
# Sovereign mode (self-custodial, good for dev)
npx tsx packages/cli/src/index.ts provision --mode sovereign

# Check what you provisioned
npx tsx packages/cli/src/index.ts status
```

This generates a `GLOSSO.md` in your working directory and writes the encrypted seed + config to `.env`.

### Run the demo agent

The demo in `demo/src/agent.ts` is a fully autonomous Drift trading agent. It reads from `GLOSSO.md`, discovers its capabilities, and executes a full trading cycle — price check → deposit collateral → open position → monitor → close.

```bash
cd demo
cp .env.example .env   # fill in your keys
npx tsx src/agent.ts
```

While it runs, watch the activity in real time:
```bash
npx tsx packages/cli/src/index.ts logs --follow
```

---

## Environment Variables

The `.env` is section-based — each wallet mode has its own block, and only the active mode's keys are read at runtime.

```bash
GLOSSO_MODE=sovereign            # active mode: sovereign | privy | turnkey
GLOSSO_NETWORK=devnet            # devnet | mainnet-beta

# ── Sovereign ──────────────────────────────────────────────
GLOSSO_MASTER_SEED_ENCRYPTED=<base64 encrypted blob>
GLOSSO_ENCRYPTION_PASSPHRASE=<strong passphrase>
SOVEREIGN_WALLET_ADDRESS=<derived public key>

# ── Privy ──────────────────────────────────────────────────
PRIVY_APP_ID=<app id>
PRIVY_APP_SECRET=<app secret>
PRIVY_WALLET_ID=<wallet id>
PRIVY_WALLET_ADDRESS=<wallet address>

# ── Turnkey ────────────────────────────────────────────────
TURNKEY_API_PUBLIC_KEY=<key>
TURNKEY_API_PRIVATE_KEY=<key>
TURNKEY_ORGANIZATION_ID=<org id>
TURNKEY_WALLET_ADDRESS=<address>

# ── Agent / LLM ────────────────────────────────────────────
XAI_API_KEY=<grok key>           # or OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
```

Production note: separate `GLOSSO_ENCRYPTION_PASSPHRASE` from the rest — store it in a secrets manager (AWS Secrets Manager, Doppler, Vault) and inject it at runtime rather than keeping it in the `.env` file.

---

## Monorepo Structure

```
glosso/
├── packages/
│   ├── core/          @glosso/core — wallet adapters, signing, cryptography, logger
│   ├── cli/           @glosso/cli  — provisioning and observability CLI
│   ├── monitor/       @glosso/monitor — Ink TUI dashboard
│   └── skills/
│       ├── glosso-wallet/    SOL transfers and balance queries
│       ├── glosso-pyth/      Pyth price feeds
│       ├── glosso-jupiter/   Jupiter swaps
│       └── glosso-drift/     Drift perpetuals (in demo/src/tools.ts)
├── demo/              Reference agent (Drift trading, full cycle)
└── scripts/           Dev utilities (test data generation, etc.)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24, TypeScript |
| Monorepo | pnpm workspaces |
| Solana SDK | `@solana/web3.js` v1 |
| Drift | `@drift-labs/sdk` v2 |
| Key derivation | `bip39`, `ed25519-hd-key` (SLIP-0010) |
| Encryption | Node.js built-in `crypto` (AES-256-GCM, PBKDF2) |
| Privy | Privy REST API (embedded wallets) |
| Turnkey | `@turnkey/sdk-server`, `@turnkey/solana` |
| Price feeds | Pyth Network Hermes API |
| CLI | `commander` |
| TUI | Ink v4 (React for terminals) |
| LLM | xAI Grok (configurable — any OpenAI-compatible endpoint) |

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full plan. Key upcoming items:

- **Remote secrets** — `glosso provision --from-doppler` / `--from-gist` for fresh VM deployments
- **ClawHub publishing** — `npx clawhub publish glosso-jupiter` to push skills to the OpenClaw registry
- **Web dashboard** — browser-based equivalent of the TUI, served locally
- **Multi-agent view** — aggregate multiple agent sessions in one monitor pane
- **Position risk controls** — max collateral, daily loss limits, configurable in `.env`
- **Additional skills** — MarginFi (lending), Orca (LP management), Tensor (NFTs)
