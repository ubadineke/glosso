# Glosso — Agentic Wallet Infrastructure for Solana
### Project Plan, Architecture & Technical Specification
> *From Glossokomon (γλωσσόκομον) — the ancient Greek word for a keeper of precious things*
> Superteam Nigeria DeFi Developer Challenge — Agentic Wallets for AI Agents

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [What Glosso Is](#2-what-glosso-is)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Core Components](#4-core-components)
5. [Wallet Modes](#5-wallet-modes)
6. [The Signing Abstraction Layer](#6-the-signing-abstraction-layer)
7. [The Skill & Capability System](#7-the-skill--capability-system)
8. [The DeFi Skill Modules](#8-the-defi-skill-modules)
9. [The Demo Economy — Three Autonomous Agents](#9-the-demo-economy--three-autonomous-agents)
10. [The Dashboards](#10-the-dashboards)
11. [Security Model](#11-security-model)
12. [Repository Structure](#12-repository-structure)
13. [Build Phases & Timeline](#13-build-phases--timeline)
14. [Tech Stack](#14-tech-stack)
15. [Quality Gates](#15-quality-gates)

---

## 1. The Problem

AI agents on Solana are becoming autonomous participants in the ecosystem. But today, every agent hits the same wall:

> *An agent can recommend a trade — but can't execute it. It can identify an API it needs — but can't pay for it. It's stuck waiting for human approval at every financial decision point.*

The missing primitive is not just a wallet. It is **wallet infrastructure designed from the ground up for autonomous agents** — infrastructure that handles key management, transaction signing, DeFi interactions, and multi-agent coordination without a human ever clicking approve.

Glosso is that primitive.

---

## 2. What Glosso Is

Glosso is a **universal wallet provisioning SDK and OpenClaw skill** that gives any AI agent — running on any platform, any LLM framework — an autonomous Solana wallet it fully controls.

**One sentence:** Any agent, anywhere, calls Glosso once and becomes an economic actor on Solana. No human approval. Ever.

**What makes it different from everything else:**

| What Others Build | What Glosso Builds |
|---|---|
| A wallet an agent can use | Wallet infrastructure any agent can plug into |
| One wallet per agent | Primary wallet + unlimited purpose-indexed sub-wallets |
| Keys in `.env` files | Zero-Key-In-Context signing architecture |
| One signing method | Unified abstraction over Sovereign, Privy, and Turnkey |
| Manual DeFi integration | Modular skill system — install capabilities like apps |
| No identity for agents | Civic attestation layer for verifiable agent identity |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ANY AI AGENT                             │
│         (OpenClaw, elizaOS, custom Python/TS bot)           │
└───────────────────────┬─────────────────────────────────────┘
                        │  calls glosso.sign() / glosso.send()
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   GLOSSO CORE                               │
│                                                             │
│   Unified Wallet Interface                                  │
│   glosso.provision() | glosso.sign() | glosso.getBalance() │
│   glosso.send() | glosso.getAddress() | glosso.history()   │
│                                                             │
│   ┌──────────────┬──────────────┬──────────────┐           │
│   │  SOVEREIGN   │    PRIVY     │   TURNKEY    │           │
│   │  ADAPTER     │   ADAPTER    │   ADAPTER    │           │
│   │              │              │              │           │
│   │ HD Derivation│ Privy TEE    │ Stamped API  │           │
│   │ BIP39/ED25519│ Server-side  │ Sub-100ms    │           │
│   │ Zero persist │ Key sharding │ Policy-gated │           │
│   └──────────────┴──────────────┴──────────────┘           │
│                        +                                    │
│            ┌───────────────────────┐                        │
│            │   CIVIC IDENTITY      │                        │
│            │   (optional add-on)   │                        │
│            │   Verifiable agent    │                        │
│            │   attestation on-chain│                        │
│            └───────────────────────┘                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              GLOSSO SKILL MODULES                           │
│                                                             │
│  glosso-core │ glosso-pyth │ glosso-jupiter │ glosso-kamino│
│  (base)      │ (prices)    │ (swaps)        │ (lending)    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  SOLANA DEVNET                              │
│         Transactions | Programs | RPC Nodes                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Core Components

### 4.1 Wallet Provisioning Engine (`packages/core`)

The heart of Glosso. Responsible for:

- Accepting a provisioning request from an agent or CLI
- Determining the configured wallet mode
- Routing to the correct adapter
- Returning wallet info (public address, network, mode)
- Generating the `GLOSSO.md` capability file for the agent
- Writing the minimal required config to `.env`

**Key design principle:** The provisioning engine never stores a private key. It either derives one on demand (Sovereign) or delegates key custody to a third-party TEE provider (Privy/Turnkey).

---

### 4.2 The Glosso CLI (`packages/cli`)

A command-line tool for the one-time wallet genesis moment — before an agent is deployed.

```bash
# Provision a sovereign wallet for an agent
npx glosso provision --mode sovereign --agent my-trading-agent

# Provision a Privy-backed wallet
npx glosso provision --mode privy --agent my-trading-agent

# Provision a Turnkey-backed wallet
npx glosso provision --mode turnkey --agent my-trading-agent

# Provision with Civic identity attestation
npx glosso provision --mode turnkey --agent my-trading-agent --civic
```

**What the CLI does on execution:**

1. Calls the provisioning engine with the specified mode
2. For Sovereign: generates BIP39 mnemonic, encrypts it, writes to agent's `.env`
3. For Privy/Turnkey: calls provider API, receives `wallet_id`, writes to agent's `.env`
4. Requests a devnet SOL airdrop to fund the new wallet
5. Generates `GLOSSO.md` and places it in the agent's working directory
6. Prints the public wallet address — the only thing shown to the operator

The raw private key (in Sovereign mode) is **never printed**. It goes directly from generation into encrypted storage. The operator never sees it.

---

### 4.3 The Glosso SDK (`packages/sdk`)

An npm package that developers install in any project:

```typescript
import { GlossoWallet } from '@glosso/sdk'

// The agent's entire wallet interaction is these calls:
const wallet = new GlossoWallet()                    // reads .env config
const address = await wallet.getAddress()            // get public key
const balance = await wallet.getBalance()            // SOL balance
const tx = await wallet.send(recipient, amount)      // send SOL
const signed = await wallet.sign(transaction)        // sign any transaction
```

The SDK reads `GLOSSO_MODE` from `.env` and internally routes to the correct adapter. The calling code is always identical regardless of wallet mode underneath.

---

### 4.4 The OpenClaw Skill (`packages/skills/glosso-wallet`)

A properly structured OpenClaw/ClawHub compatible skill that any OpenClaw user can install:

```
glosso-wallet/
├── SKILL.md            ← LLM reads this to understand capabilities
├── SKILLS.md           ← Bounty requirement — summary for agents
├── references/
│   ├── architecture.md ← Deep dive on wallet design
│   └── security.md     ← Security model and key management
└── scripts/
    ├── setup.sh        ← One-command installation
    ├── provision.ts    ← Wallet provisioning
    ├── balance.ts      ← Balance checks
    ├── send.ts         ← SOL/SPL transfers
    └── swap.ts         ← Jupiter swaps (requires glosso-jupiter)
```

The `SKILL.md` is written as a machine-parseable capability manifest — structured so an LLM reads it once at startup and knows exactly what it can and cannot do with its wallet.

---

## 5. Wallet Modes

Glosso supports three wallet backends. The agent's code never changes between them — only the `.env` configuration differs.

### Mode 1: SOVEREIGN (Non-Custodial)

**How keys are managed:**

Keys are never stored anywhere in raw form. A BIP39 mnemonic (master seed) is generated once at provisioning time, encrypted with AES-256, and written to the agent's `.env`. When a transaction needs signing:

1. Master seed is read from `.env`
2. Private key is derived using the BIP44 path `m/44'/501'/{index}'/0'` (501 = Solana's coin type)
3. Transaction is signed in memory
4. Private key is garbage collected immediately — it never persists beyond the function scope

**Sub-wallet derivation:**

```
Master Seed
    │
    ├── m/44'/501'/0'/0'  →  Primary wallet (agent's public identity)
    ├── m/44'/501'/1'/0'  →  Trading sub-wallet
    ├── m/44'/501'/2'/0'  →  Vault sub-wallet
    └── m/44'/501'/3'/0'  →  Burner wallet (disposable)
```

Same seed always produces the same wallet addresses. Deterministic, reproducible, no randomness after genesis.

**Environment config:**
```
GLOSSO_MODE=sovereign
GLOSSO_MASTER_SEED_ENCRYPTED=<AES-256 encrypted mnemonic>
GLOSSO_NETWORK=devnet
```

**Best for:** Developers who want full self-custody. No third-party dependency after provisioning.

**Limitation:** Requires a one-time human action at genesis (running the CLI before deploying the agent). After genesis — fully autonomous forever.

---

### Mode 2: MANAGED (Privy-backed)

**How it works:**

Privy manages key custody inside a Trusted Execution Environment (TEE) with distributed key sharding — the private key is never whole in one place. Glosso calls Privy's API to sign transactions; the key never leaves Privy's infrastructure.

**Provisioning flow:**
1. Glosso calls Privy API → creates embedded wallet → receives `wallet_id`
2. Glosso writes `wallet_id` + Privy credentials to `.env`
3. Every future signing request sends transaction bytes to Privy → Privy signs in TEE → returns signature

**Environment config:**
```
GLOSSO_MODE=privy
GLOSSO_PRIVY_APP_ID=<your-app-id>
GLOSSO_PRIVY_APP_SECRET=<your-app-secret>
GLOSSO_PRIVY_WALLET_ID=<assigned-at-provisioning>
GLOSSO_NETWORK=devnet
```

**Autonomous provisioning:** Unlike Sovereign mode, Privy provisioning is just API calls. An agent can provision its own Privy wallet mid-session with zero human involvement.

**Best for:** Teams that want enterprise-grade key security without managing their own infrastructure.

---

### Mode 3: PERFORMANCE (Turnkey-backed)

**How it works:**

Turnkey provides sub-100ms transaction signing via stamped API requests. Every signing request is authenticated with a separate API keypair — the wallet's private key never leaves Turnkey's secure enclave. Agents receive scoped API credentials tied to specific wallets and permitted action types.

**The stamp mechanism:** Every request to Turnkey is signed with the operator's API key before being sent. Turnkey verifies the stamp, confirms the request is within the wallet's policy, and executes the signing. Even if API credentials are stolen, the attacker can only request signatures permitted by the wallet policy.

**Environment config:**
```
GLOSSO_MODE=turnkey
GLOSSO_TURNKEY_API_PUBLIC_KEY=<api-public-key>
GLOSSO_TURNKEY_API_PRIVATE_KEY=<api-private-key>
GLOSSO_TURNKEY_ORGANIZATION_ID=<org-id>
GLOSSO_TURNKEY_WALLET_ID=<assigned-at-provisioning>
GLOSSO_NETWORK=devnet
```

**Best for:** High-frequency trading agents, any agent requiring fast autonomous signing at scale.

---

### Identity Add-on: CIVIC Attestation

Civic is not a wallet backend — it is a **verifiable identity layer** that wraps any of the three wallet modes. When enabled, the agent's wallet address receives a Civic Pass — a non-transferable on-chain token proving the agent has a verified, unique identity on Solana.

This answers the ecosystem's most pressing unanswered question: *when an agent executes a $10K trade, how do you know who or what is acting?*

Enable with `--civic` flag at provisioning. Works with any wallet mode.

---

## 6. The Signing Abstraction Layer

This is Glosso's core architectural contribution. One function, always the same, regardless of what is underneath.

```typescript
// The agent calls this. Always. Regardless of mode.
const signedTx = await glosso.sign(transaction)
```

Internally:

```typescript
class GlossoWallet {
  private adapter: WalletAdapter

  constructor() {
    switch(process.env.GLOSSO_MODE) {
      case 'sovereign': this.adapter = new SovereignAdapter(); break
      case 'privy':     this.adapter = new PrivyAdapter();     break
      case 'turnkey':   this.adapter = new TurnkeyAdapter();   break
    }
  }

  // Universal interface — agent code never changes
  async sign(tx: Transaction)          { return this.adapter.sign(tx) }
  async getBalance()                   { return this.adapter.getBalance() }
  async getAddress()                   { return this.adapter.getAddress() }
  async send(to: string, amt: number)  { return this.adapter.send(to, amt) }
}
```

Each adapter implements the same `WalletAdapter` interface but speaks its provider's native language internally.

**Why this matters:** A team can start with Sovereign mode for development, switch to Turnkey for production high-frequency operation, and the agent's codebase changes zero lines. Glosso absorbs the complexity.

---

## 7. The Skill & Capability System

### How GLOSSO.md Works

When Glosso provisions a wallet, it generates a `GLOSSO.md` file and injects it into the agent's context or working directory. The agent's LLM reads this file at startup and immediately knows:

- That it has a wallet
- Its public address
- What it can do with the wallet (installed skills)
- What it cannot do (uninstalled skills)
- Exactly how to invoke each capability

```markdown
# GLOSSO WALLET CONTEXT

Public Address: 7xKp...3mNq
Network: Devnet
Mode: Performance (Turnkey)

## Available Capabilities

### glosso-core (installed)
- Check balance:        call glosso_balance()
- Send SOL:             call glosso_send(recipient, amount)
- Transaction history:  call glosso_history(limit)

### glosso-pyth (installed)
- Get token price:      call glosso_price(symbol)
- e.g. glosso_price("SOL/USD") → 185.42

### glosso-jupiter (installed)
- Swap tokens:          call glosso_swap(fromToken, toToken, amount)
- Get quote first:      call glosso_quote(fromToken, toToken, amount)

## Not Available — Install to Unlock
- glosso-kamino   → lending and borrowing
- glosso-marinade → SOL liquid staking
- glosso-x402     → autonomous API payments
```

### How Skills Transform Into Agent Behavior

The LLM reads `GLOSSO.md` the same way a human reads a manual. When a relevant situation arises, it knows exactly which tool to invoke. The flow:

```
User: "What's the current SOL price?"
          ↓
Agent reads GLOSSO.md → sees glosso_price() is available
          ↓
Agent calls glosso_price("SOL/USD")
          ↓
glosso-pyth script queries Pyth devnet oracle
          ↓
Returns: 185.42
          ↓
Agent responds: "SOL is currently trading at $185.42"
```

The LLM makes the decision. The script does the work. The private key is never in the LLM's context at any point.

### Capability Boundaries Are Explicit

An agent without `glosso-jupiter` installed attempting a swap:

```
Agent reads GLOSSO.md → glosso-jupiter not listed under Available
                      → listed under "Not Available — Install to Unlock"
Agent responds: "I have a wallet but token swaps require the
                glosso-jupiter skill. Ask your operator to install it."
```

No hallucinated transactions. No guessing. The agent knows its own boundaries.

---

## 8. The DeFi Skill Modules

Each module ships as a standalone package with its own `SKILL.md` and executable scripts.

### glosso-core
Base wallet operations. Always installed.

| Function | What It Does |
|---|---|
| `glosso_balance()` | Returns SOL + SPL token balances |
| `glosso_send(to, amount)` | Sends SOL to an address |
| `glosso_send_token(mint, to, amount)` | Sends SPL tokens |
| `glosso_history(limit)` | Returns recent transaction list |
| `glosso_address()` | Returns wallet public key |

---

### glosso-pyth
Real-time price feeds from Pyth Network devnet oracles.

| Function | What It Does |
|---|---|
| `glosso_price(symbol)` | Gets current price e.g. "SOL/USD" |
| `glosso_price_history(symbol, intervals)` | Gets OHLC data |

---

### glosso-jupiter
Token swaps via Jupiter aggregator on devnet.

| Function | What It Does |
|---|---|
| `glosso_quote(from, to, amount)` | Gets best swap route and expected output |
| `glosso_swap(from, to, amount, slippage)` | Executes swap, signs and broadcasts |

**How a swap works end-to-end:**
1. Agent calls `glosso_quote("SOL", "USDC", 1.0)`
2. Jupiter returns best route + expected USDC output
3. Agent decides to proceed based on its own logic
4. Agent calls `glosso_swap("SOL", "USDC", 1.0, 0.5)`
5. Glosso builds the Jupiter transaction
6. Glosso routes to the configured adapter → transaction signed
7. Transaction broadcast to devnet
8. Confirmation + transaction signature returned to agent

---

### glosso-x402 *(planned)*
Autonomous API payments via HTTP 402 protocol. Agents pay for data, compute, and services with their own earned SOL — the foundation of agent-to-agent commerce.

---

## 9. The Demo Economy — Three Autonomous Agents

The demo runs three simultaneous agents on Solana devnet. Each has its own Glosso wallet. They interact with each other autonomously — no human in the loop at any point.

### Agent SCOUT
**Job:** Monitor Pyth price feeds. Detect significant price movements.

**Wallet:** Sovereign mode, primary wallet only.

**Behavior loop (every 30 seconds):**
1. Call `glosso_price("SOL/USD")`
2. If price crosses configured threshold → emit a trade signal
3. Receive 0.001 SOL payment from TRADER per signal consumed

**Earns:** Micro-payments from TRADER for price signal data.

---

### Agent TRADER
**Job:** Buy price signals from SCOUT. Execute swap decisions on Jupiter devnet.

**Wallet:** Turnkey mode (sub-100ms signing for speed). Primary + trading sub-wallet.

**Behavior loop (event-driven on SCOUT signals):**
1. Pay SCOUT 0.001 SOL for the signal
2. Evaluate signal against own strategy logic
3. If decision: call `glosso_quote()` → evaluate expected output
4. If quote acceptable: call `glosso_swap()`
5. Send 10% of any realized profit to VAULT

**Earns:** Simulated trading profits on devnet. Pays for inputs. Distributes a portion.

---

### Agent VAULT
**Job:** Receive and hold earnings from TRADER. Track cumulative agent economy metrics.

**Wallet:** Privy mode (maximum security for the savings layer).

**Behavior loop (passive receipt):**
1. Receive incoming SOL from TRADER
2. Log receipt with timestamp and sender
3. Update running total of economy-wide earnings
4. Report balance and metrics on request

---

### The Economy Flow

```
SCOUT                    TRADER                   VAULT
  │                        │                        │
  │  Emit price signal      │                        │
  │ ─────────────────────► │                        │
  │                        │                        │
  │  Receive 0.001 SOL     │                        │
  │ ◄───────────────────── │                        │
  │                        │                        │
  │                        │  Execute Jupiter swap  │
  │                        │ ──────────────────────► Solana devnet
  │                        │                        │
  │                        │  Send 10% profit       │
  │                        │ ──────────────────────►│
  │                        │                        │
  │                        │                        │ Hold + record

TOTAL HUMAN APPROVALS REQUIRED: 0
```

---

## 10. The Dashboards

### Dashboard 1: Glosso Infrastructure Dashboard
**Who sees it:** The Glosso operator. Public-facing system health view.

**Metrics displayed:**
- Total wallets provisioned (by mode: Sovereign / Managed / Performance)
- Active agents (transacted in last 24h)
- Total transaction volume across all agent wallets
- Signing requests per minute
- Provider health indicators (Privy API status, Turnkey latency)
- Live transaction feed across all provisioned wallets

**The headline metric — always visible at top:**
```
AUTONOMOUS TRANSACTIONS: 4,721    |    HUMAN APPROVALS: 0
```

---

### Dashboard 2: Agent Owner Dashboard
**Who sees it:** The individual human who deployed their agent. Private, per-agent.

**Per-agent view shows:**
- All wallet balances (primary + all sub-wallets) in SOL and USD
- Transaction history with **interpreted context** ("Agent paid 0.002 SOL for Pyth price data" — not raw blockchain data)
- Net P&L since deployment
- Autonomy score (% of decisions made without human involvement)
- Live activity feed showing the agent's decision-and-action stream
- Spending forecast ("at current burn rate: X days of runway remaining")

**Philosophical note:** There are no approve/reject buttons. This dashboard is a window, not a steering wheel. Humans observe. Agents act. The only intervention available is a full pause — which stops the agent entirely and requires a manual restart.

---

## 11. Security Model

### Zero-Key-In-Context

The private key never appears in:
- Any LLM prompt or context window
- Any API response body
- Any log file
- Any environment variable in raw form (Sovereign mode encrypts it)
- Any shell history

The key exists only in memory, only during the signing operation, only inside the Glosso adapter's isolated function scope. The moment the function returns, the key is gone.

### Blast Radius Containment

If an agent is compromised via prompt injection or social engineering, the attacker can at most trick that agent into signing a transaction from that agent's own wallet. They cannot:
- Access other agents' wallets (each is independently derived or provisioned)
- Access the master seed directly (it's encrypted in `.env`)
- Escalate to the Glosso infrastructure itself

One agent compromised = one wallet at risk. The rest of the ecosystem is untouched.

### The Sovereign Encryption Scheme

```
Master Seed (BIP39 mnemonic)
    ↓
AES-256-GCM encryption
    ↓
Encrypted blob stored in .env as GLOSSO_MASTER_SEED_ENCRYPTED
    ↓
Decryption passphrase stored separately (operator's responsibility)
    ↓
At signing time: decrypt → derive key → sign → discard
```

### Production Path (Beyond This Demo)

For mainnet production, the recommended upgrade path is:
- **TEE-backed key derivation** via Marlin Oyster or Phala Network
- **Formal verification** of the signing abstraction layer
- **Multi-signature threshold** for high-value transactions
- **Hardware Security Module (HSM)** for enterprise deployments

---

## 12. Repository Structure

```
glosso/
│
├── packages/
│   ├── core/                     # Wallet provisioning engine
│   │   ├── src/
│   │   │   ├── glosso.ts         # Main GlossoWallet class
│   │   │   ├── adapters/
│   │   │   │   ├── interface.ts  # WalletAdapter interface
│   │   │   │   ├── sovereign.ts  # HD derivation adapter
│   │   │   │   ├── privy.ts      # Privy TEE adapter
│   │   │   │   └── turnkey.ts    # Turnkey adapter
│   │   │   └── utils/
│   │   │       ├── encrypt.ts    # AES-256 encryption helpers
│   │   │       └── airdrop.ts    # Devnet faucet helper
│   │   └── package.json
│   │
│   ├── cli/                      # npx glosso provision
│   │   ├── src/
│   │   │   ├── index.ts          # CLI entry point
│   │   │   ├── provision.ts      # Provisioning command
│   │   │   └── generate-md.ts    # GLOSSO.md generator
│   │   └── package.json
│   │
│   ├── skills/
│   │   ├── glosso-wallet/        # OpenClaw skill (ClawHub publishable)
│   │   │   ├── SKILL.md
│   │   │   ├── SKILLS.md
│   │   │   ├── references/
│   │   │   │   ├── architecture.md
│   │   │   │   └── security.md
│   │   │   └── scripts/
│   │   │       ├── setup.sh
│   │   │       ├── provision.ts
│   │   │       ├── balance.ts
│   │   │       └── send.ts
│   │   │
│   │   ├── glosso-pyth/          # Price feed skill
│   │   │   ├── SKILL.md
│   │   │   └── scripts/price.ts
│   │   │
│   │   └── glosso-jupiter/       # Swap skill
│   │       ├── SKILL.md
│   │       └── scripts/swap.ts
│   │
│   └── dashboard/                # Both dashboards
│       ├── src/
│       │   ├── app/
│       │   │   ├── infrastructure/ # Glosso ops dashboard
│       │   │   └── agent/          # Agent owner dashboard
│       │   └── components/
│       └── package.json
│
├── demo/
│   ├── agents/
│   │   ├── scout.ts              # Price monitor agent
│   │   ├── trader.ts             # Swap execution agent
│   │   └── vault.ts              # Earnings accumulation agent
│   └── scripts/
│       ├── setup.sh              # Provision all three agents
│       └── run-demo.sh           # Start all three simultaneously
│
├── docs/
│   └── deep-dive.md              # Bounty required deep dive
│
├── .env.example                  # Template — shows all config options
├── README.md                     # Setup and run instructions
└── package.json                  # pnpm workspaces root
```

---

## 13. Build Phases & Timeline

### Phase 1 — Foundation (Day 1)
- Monorepo setup with pnpm workspaces
- TypeScript config, linting, shared types
- Solana devnet connection verified

### Phase 2 — Sovereign Adapter (Day 2)
- BIP39 mnemonic generation
- ED25519-HD key derivation at `m/44'/501'/{n}'/0'`
- AES-256 encryption of master seed
- First devnet transaction signed and confirmed on Explorer
- **Gate:** Real transaction on devnet before proceeding

### Phase 3 — Core Signing Abstraction (Day 3)
- `WalletAdapter` interface defined
- `GlossoWallet` class with adapter routing
- Sovereign wired into unified interface
- SDK package structure

### Phase 4 — CLI Provisioner (Day 4)
- `npx glosso provision` command
- `.env` writer — never prints raw key
- `GLOSSO.md` generator
- Devnet airdrop on provisioning

### Phase 5 — Privy + Turnkey Adapters (Days 5–6)
- Privy adapter: provision + sign via Privy API
- Turnkey adapter: provision + stamped signing
- Both tested against devnet
- **Gate:** Same `glosso.sign()` call works for all three modes

### Phase 6 — DeFi Skill Modules (Days 7–8)
- `glosso-pyth`: Pyth devnet price feeds
- `glosso-jupiter`: Jupiter devnet quote + swap
- Skill folder structure + `SKILL.md` for each
- **Gate:** Real swap executed on devnet via Jupiter

### Phase 7 — Demo Agents (Days 9–10)
- SCOUT, TRADER, VAULT agents built
- Inter-agent payment flow working
- All three running simultaneously
- **Gate:** Complete earn → spend loop running autonomously

### Phase 8 — Dashboards (Days 11–12)
- Infrastructure dashboard with live Helius webhook feed
- Agent owner dashboard with interpreted transaction history
- Autonomous transaction counter live

### Phase 9 — OpenClaw Skill Package (Day 13)
- Final `SKILL.md` and `SKILLS.md` written
- One-command install via `setup.sh`
- ClawHub-compatible folder structure

### Phase 10 — Documentation & Polish (Day 14)
- Deep dive written
- Demo video recorded
- README verified from a fresh clone
- All quality gates checked

---

## 14. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Type safety for financial infrastructure |
| Solana SDK | `@solana/web3.js` v2 | Latest version, shows currency |
| Key Derivation | `bip39` + `ed25519-hd-key` | BIP44 standard, Solana coin type 501 |
| Encryption | Node.js `crypto` (AES-256-GCM) | No external dependency needed |
| Privy | `@privy-io/server-auth` | Official server SDK |
| Turnkey | `@turnkey/sdk-server` | Official server SDK |
| Civic | `@civic/solana-gateway-ts` | Attestation on Solana |
| Price Feeds | `@pythnetwork/client` | Pyth devnet oracles |
| Swaps | Jupiter V6 API | Best liquidity aggregator on Solana |
| Real-time | Helius webhooks | Best transaction streaming on Solana |
| Dashboard | Next.js + TailwindCSS | Fast to build, looks professional |
| Charts | Recharts | Simple, clean financial charts |
| Monorepo | pnpm workspaces | Fast, efficient, single install |
| Node version | 20+ | Required by Solana web3.js v2 |

---

## 15. Quality Gates

Before submission, every item must be verified:

```
Infrastructure
□ All three wallet modes sign a real devnet transaction
□ Same glosso.sign() call works for all three modes
□ CLI provisioner writes correct .env without printing raw key
□ GLOSSO.md generated correctly reflects installed skills
□ Devnet airdrop works on fresh wallet provisioning

DeFi Skills
□ glosso_price() returns live Pyth devnet data
□ glosso_quote() returns valid Jupiter route
□ glosso_swap() executes a real swap — verifiable on Explorer

Demo Economy
□ All three agents provision and fund successfully
□ SCOUT → TRADER payment flow works
□ TRADER → VAULT payment flow works
□ Full loop runs for 10+ minutes without human input

Dashboards
□ Infrastructure dashboard shows real transaction data
□ Autonomous transactions counter increments in real time
□ Agent owner dashboard shows correct balances and history

OpenClaw Skill
□ Skill installs in one command via setup.sh
□ SKILL.md correctly describes all available capabilities
□ Agent using skill can check balance and send SOL

Documentation
□ README works from a fresh clone — zero extra steps
□ Every transaction in the demo is verifiable on Solana Explorer
□ Deep dive covers all required sections
```

---

## The Single Metric That Proves Everything

At the end of the demo, one number is shown on screen:

```
┌────────────────────────────────────────────────────┐
│                                                    │
│   AUTONOMOUS TRANSACTIONS:  4,721                  │
│   HUMAN APPROVALS REQUIRED: 0                      │
│                                                    │
└────────────────────────────────────────────────────┘
```

That is Glosso. That is the bounty.

---

*Glosso — from Glossokomon (γλωσσόκομον), the ancient Greek keeper of precious things*
*Built for the Superteam Nigeria DeFi Developer Challenge 2026*
*Open source. Non-custodial option. Universal. Autonomous.*
