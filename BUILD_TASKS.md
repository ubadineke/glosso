# Glosso — Build Tasks & Testing Checklist

> Step-by-step breakdown from zero to complete submission.
> Each task has a concrete test to verify it works before moving on.
> Corrections from the project plan review are already incorporated.

---

## Key Corrections Applied

| Original Plan | Corrected |
|---|---|
| `@solana/web3.js v2` | `@solana/kit` (v6.x) — the 2.x line was renamed |
| `@pythnetwork/client` | `@pythnetwork/hermes-client` — legacy package deprecated |
| Jupiter V6 API on devnet | Jupiter is **mainnet only** — use mainnet with tiny amounts or mock swaps on devnet |
| `ed25519-hd-key` (unmaintained) | Evaluate `@scure/bip32` as alternative, or audit and pin `ed25519-hd-key` |

---

## Phase 1 — Monorepo & Devnet Connection

### Task 1.1: Initialize Monorepo

**What to do:**
- Run `pnpm init` at root
- Create `pnpm-workspace.yaml` pointing to `packages/*` and `demo/*`
- Create root `tsconfig.json` (strict mode, ES2022 target, NodeNext module)
- Create root `.gitignore` (node_modules, dist, .env)
- Create `.env.example` with all Glosso config placeholders
- Create empty package shells: `packages/core`, `packages/cli`, `packages/sdk`
- Each package gets its own `package.json` and `tsconfig.json` extending root

**Test:**
```bash
pnpm install          # succeeds with no errors
pnpm -r exec tsc --version   # TypeScript resolves in every package
```

---

### Task 1.2: Verify Solana Devnet Connection

**What to do:**
- In `packages/core`, install `@solana/kit`
- Write a script `packages/core/src/test-connection.ts` that:
  - Creates an RPC client with `createSolanaRpc(devnet('https://api.devnet.solana.com'))`
  - Calls `getSlot()` and prints the current slot
  - Generates a keypair with `generateKeyPair()`
  - Gets the address with `getAddressFromPublicKey()`
  - Requests an airdrop of 1 SOL
  - Checks balance after airdrop

**Test:**
```
✅ Slot number prints (proves RPC connection works)
✅ Airdrop succeeds (proves devnet access)
✅ Balance shows 1 SOL (proves account state reads work)
```

---

### Task 1.3: HD Key Derivation (BIP39 + SLIP-0010)

**What to do:**
- Install `bip39` and `ed25519-hd-key`
- Write `packages/core/src/utils/derive.ts`:
  - `generateMnemonic()` — returns a 12-word BIP39 mnemonic
  - `deriveKeypair(mnemonic, index)` — derives Ed25519 keypair at path `m/44'/501'/{index}'/0'`
  - Returns a `CryptoKeyPair` compatible with `@solana/kit`
- Write `packages/core/src/utils/derive.test.ts`:
  - Same mnemonic + same index → same address every time (deterministic)
  - Different index → different address
  - Invalid mnemonic → throws error

**Test:**
```
✅ Deterministic: same mnemonic produces same address on repeated calls
✅ Sub-wallets: index 0, 1, 2 produce three different addresses
✅ Derived keypair can sign a message using @solana/kit's signBytes()
```

---

## Phase 2 — Sovereign Adapter & First Transaction

### Task 2.1: AES-256-GCM Encryption Helpers

**What to do:**
- Write `packages/core/src/utils/encrypt.ts`:
  - `encrypt(plaintext: string, passphrase: string): string` — AES-256-GCM, returns base64 blob (iv + authTag + ciphertext)
  - `decrypt(blob: string, passphrase: string): string` — reverses encryption
- Zero external dependencies — use Node.js `crypto` module only

**Test:**
```
✅ encrypt then decrypt returns original plaintext
✅ Wrong passphrase throws / returns garbage
✅ Output is a single base64 string (storable in .env)
```

---

### Task 2.2: Sovereign Wallet Adapter

**What to do:**
- Define `packages/core/src/adapters/interface.ts`:
  ```typescript
  interface WalletAdapter {
    getAddress(index?: number): Promise<string>
    getBalance(index?: number): Promise<number>
    sign(transaction: TransactionMessage, index?: number): Promise<SignedTransaction>
    send(to: string, lamports: bigint, index?: number): Promise<string> // returns tx signature
  }
  ```
- Implement `packages/core/src/adapters/sovereign.ts`:
  - Constructor reads `GLOSSO_MASTER_SEED_ENCRYPTED` and `GLOSSO_ENCRYPTION_PASSPHRASE` from env
  - Decrypts mnemonic on demand
  - Derives keypair for the requested index
  - Signs using Kit's `signTransaction()`
  - Key material is discarded after signing (not stored as class property)

**Test:**
```
✅ adapter.getAddress() returns a valid Solana address string
✅ adapter.getBalance() returns a number ≥ 0
✅ adapter.send(recipientAddress, 100000n) succeeds on devnet
✅ Transaction signature is verifiable on Solana Explorer
```

**Gate: You have a real, verified transaction on Solana Explorer before proceeding.**

---

### Task 2.3: GlossoWallet Class (Adapter Router)

**What to do:**
- Write `packages/core/src/glosso.ts`:
  - Constructor reads `GLOSSO_MODE` from env
  - Routes to the correct adapter (`sovereign` for now, others stubbed)
  - Exposes unified public API: `getAddress()`, `getBalance()`, `sign()`, `send()`
- Stub Privy and Turnkey adapters (throw "not implemented yet")

**Test:**
```
✅ GLOSSO_MODE=sovereign → GlossoWallet.send() executes a real devnet transaction
✅ GLOSSO_MODE=privy → GlossoWallet.send() throws "Privy adapter not yet implemented"
✅ GLOSSO_MODE=turnkey → same
✅ GLOSSO_MODE=invalid → throws clear error message
```

---

## Phase 3 — CLI Provisioner

### Task 3.1: CLI Skeleton

**What to do:**
- Set up `packages/cli` with a CLI framework (Commander.js or similar)
- Entry point: `packages/cli/src/index.ts`
- Register `provision` command with options: `--mode`, `--agent`, `--civic`
- Add `bin` field in `package.json` so `npx glosso` works

**Test:**
```
✅ npx glosso --help prints usage info
✅ npx glosso provision --help prints provision-specific options
```

---

### Task 3.2: Provision Command (Sovereign Mode)

**What to do:**
- Implement `packages/cli/src/commands/provision.ts`:
  1. Generate BIP39 mnemonic
  2. Prompt for encryption passphrase (or generate one)
  3. Encrypt mnemonic with AES-256-GCM
  4. Write to `.env` file in the agent's directory:
     - `GLOSSO_MODE=sovereign`
     - `GLOSSO_MASTER_SEED_ENCRYPTED=<blob>`
     - `GLOSSO_ENCRYPTION_PASSPHRASE=<passphrase>`
     - `GLOSSO_NETWORK=devnet`
  5. Derive primary address and print it (public key only — never print private key)
  6. Request devnet airdrop to the new address
  7. Generate `GLOSSO.md` capability file

**Test:**
```
✅ Running `npx glosso provision --mode sovereign --agent test-agent` creates a .env file
✅ .env contains GLOSSO_MODE=sovereign and encrypted seed
✅ .env does NOT contain any raw mnemonic or private key
✅ Public address is printed to console
✅ Airdrop succeeds — wallet has SOL on devnet
✅ GLOSSO.md file is generated with correct address and available capabilities
```

---

### Task 3.3: GLOSSO.md Generator

**What to do:**
- Write `packages/cli/src/generate-md.ts`:
  - Takes wallet address, network, mode, and installed skills as input
  - Outputs a structured markdown file listing:
    - Wallet address
    - Network
    - Mode
    - Available capabilities (from installed skill modules)
    - Unavailable capabilities (known but not installed)

**Test:**
```
✅ Generated GLOSSO.md contains the correct wallet address
✅ Skills listed under "Available" match what's installed
✅ File is valid markdown (can be parsed by any markdown parser)
```

---

## Phase 4 — SDK Package

### Task 4.1: SDK Package Setup

**What to do:**
- Set up `packages/sdk` as a publishable npm package
- Re-exports `GlossoWallet` from `packages/core`
- Clean public API:
  ```typescript
  import { GlossoWallet } from '@glosso/sdk'
  const wallet = new GlossoWallet()
  ```
- Add `README.md` with usage examples
- Configure `package.json` with proper `main`, `types`, `exports` fields

**Test:**
```
✅ A separate test project can `npm install ../packages/sdk` and use GlossoWallet
✅ TypeScript types resolve correctly
✅ wallet.send() works end-to-end from the external test project
```

---

## Phase 5 — Privy & Turnkey Adapters

### Task 5.1: Privy Adapter

**What to do:**
- Install Privy server SDK (verify current package name from Privy docs)
- Implement `packages/core/src/adapters/privy.ts`:
  - `provision()` — calls Privy API to create an embedded wallet, returns wallet ID
  - `getAddress()` — returns the Privy wallet's Solana address
  - `sign()` — sends transaction bytes to Privy for signing
  - `send()` — builds transaction, signs via Privy, broadcasts

**Test:**
```
✅ Privy wallet provisions successfully (wallet ID returned)
✅ getAddress() returns a valid Solana address
✅ send() executes a real devnet transaction signed by Privy
✅ Transaction verifiable on Explorer
```

---

### Task 5.2: Turnkey Adapter

**What to do:**
- Install `@turnkey/sdk-server`
- Implement `packages/core/src/adapters/turnkey.ts`:
  - `provision()` — creates HD wallet + Solana account via Turnkey API
  - `getAddress()` — returns the Turnkey wallet's Solana address
  - `sign()` — sends transaction via stamped API request
  - `send()` — builds, signs, broadcasts

**Test:**
```
✅ Turnkey wallet provisions successfully
✅ Signing works via stamped API
✅ Real devnet transaction succeeds
✅ Same GlossoWallet.send() call works identically for all three modes
```

**Gate: `glosso.sign()` produces a valid signed transaction for Sovereign, Privy, AND Turnkey.**

---

### Task 5.3: CLI Provision for All Modes

**What to do:**
- Extend the `provision` command to support `--mode privy` and `--mode turnkey`
- Each mode writes the correct env vars to `.env`

**Test:**
```
✅ `npx glosso provision --mode privy` creates wallet via Privy
✅ `npx glosso provision --mode turnkey` creates wallet via Turnkey
✅ Each mode's .env has the correct provider-specific variables
```

---

## Phase 6 — DeFi Skill Modules

### Task 6.1: glosso-core Skill (Base Wallet Operations)

**What to do:**
- Create `packages/skills/glosso-wallet/`
- Implement scripts:
  - `balance.ts` — reads wallet balance (SOL + SPL tokens)
  - `send.ts` — sends SOL to an address
  - `history.ts` — fetches recent transactions via RPC
- Write `SKILL.md` describing capabilities in LLM-readable format
- Write `setup.sh` for one-command installation

**Test:**
```
✅ balance.ts returns SOL balance as a number
✅ send.ts executes a transfer and returns tx signature
✅ history.ts returns an array of recent transactions
✅ SKILL.md is parseable and accurately describes available functions
✅ setup.sh installs all dependencies successfully from a clean state
```

---

### Task 6.2: glosso-pyth Skill (Price Feeds)

**What to do:**
- Create `packages/skills/glosso-pyth/`
- Install `@pythnetwork/hermes-client` (NOT the deprecated `@pythnetwork/client`)
- Implement `scripts/price.ts`:
  - `glosso_price(symbol)` — fetches latest price from Hermes API
  - Supports "SOL/USD", "BTC/USD", "ETH/USD" at minimum
  - Maps human-readable symbols to Pyth feed IDs internally
- Write `SKILL.md`

**Test:**
```
✅ glosso_price("SOL/USD") returns a number > 0
✅ glosso_price("BTC/USD") returns a number > 0
✅ glosso_price("INVALID") throws a clear error
✅ Price roughly matches current market price (sanity check)
```

---

### Task 6.3: glosso-jupiter Skill (Swaps)

**What to do:**
- Create `packages/skills/glosso-jupiter/`
- **Decision required:** Jupiter is mainnet-only. Options:
  - **Option A (recommended):** Use Jupiter Ultra/Metis API on mainnet with tiny amounts (0.001 SOL swaps)
  - **Option B:** Build a mock swap on devnet that simulates the Jupiter flow
  - **Option C:** Use Raydium/Orca if devnet support exists
- Implement `scripts/swap.ts`:
  - `glosso_quote(from, to, amount)` — gets best quote
  - `glosso_swap(from, to, amount, slippage)` — executes swap
- Write `SKILL.md`

**Test (if mainnet):**
```
✅ glosso_quote("SOL", "USDC", 0.001) returns a valid quote with expected output
✅ glosso_swap("SOL", "USDC", 0.001, 1.0) executes a real swap
✅ Transaction verifiable on Solana Explorer (mainnet)
✅ Wallet token balances reflect the swap
```

**Test (if mock devnet):**
```
✅ Mock swap simulates the full flow (quote → sign → broadcast)
✅ Agent code is identical to what would work with real Jupiter
```

---

## Phase 7 — Demo Agents

### Task 7.1: Agent Communication Layer

**What to do:**
- Decide communication mechanism:
  - **Simple (recommended):** In-process `EventEmitter` — all agents in one Node process
  - Agents publish/subscribe to typed events: `PriceSignal`, `TradeExecution`, `ProfitDeposit`
- Create `demo/lib/events.ts`:
  - Define event types
  - Export a shared event bus

**Test:**
```
✅ Agent A emits event → Agent B receives it immediately
✅ Events are typed — TypeScript catches incorrect payloads
```

---

### Task 7.2: SCOUT Agent

**What to do:**
- Create `demo/agents/scout.ts`
- Provision a Sovereign wallet via Glosso
- Loop every 30 seconds:
  1. Call `glosso_price("SOL/USD")`
  2. Track price history in memory
  3. If price moves > configured threshold % since last check → emit `PriceSignal` event
- Log all activity (timestamp, price, signal emitted or not)

**Test:**
```
✅ SCOUT provisions its own wallet successfully
✅ Price is fetched every 30 seconds (check logs)
✅ Signals are emitted when threshold is crossed
✅ No signals emitted when price is stable (no false positives)
```

---

### Task 7.3: TRADER Agent

**What to do:**
- Create `demo/agents/trader.ts`
- Provision a Turnkey wallet (or Sovereign for simplicity) via Glosso
- Listen for `PriceSignal` events from SCOUT
- On signal:
  1. Pay SCOUT 0.001 SOL (via `glosso.send()`)
  2. Evaluate signal (simple strategy — e.g., buy if price dropped > 2%)
  3. If decision to trade: call `glosso_quote()` then `glosso_swap()`
  4. If profit realized: send 10% to VAULT
- Add a circuit breaker: pause if balance < 0.05 SOL

**Test:**
```
✅ TRADER receives signals from SCOUT
✅ Payment of 0.001 SOL to SCOUT succeeds (check both balances)
✅ Swap executes (or mock-executes) based on signal
✅ Profit share sent to VAULT address
✅ Circuit breaker stops trading when balance is low
```

---

### Task 7.4: VAULT Agent

**What to do:**
- Create `demo/agents/vault.ts`
- Provision a Privy wallet (or Sovereign) via Glosso
- Passive listener:
  1. Monitor incoming transactions (poll balance or subscribe via RPC)
  2. Log each receipt: timestamp, amount, sender
  3. Track cumulative totals
  4. Report metrics on request (or periodically to console)

**Test:**
```
✅ VAULT correctly detects incoming SOL transfers
✅ Running total matches actual wallet balance
✅ Logs show sender addresses and amounts
```

---

### Task 7.5: Full Demo Orchestrator

**What to do:**
- Create `demo/scripts/run-demo.sh` and `demo/scripts/setup.sh`
- `setup.sh`: provisions all three agents, airdrops devnet SOL to each
- `run-demo.sh`: starts all three agents in one process
- Add a ticker/dashboard to console: every 60 seconds, print:
  - Each agent's current balance
  - Total autonomous transactions
  - Total human approvals: 0

**Test:**
```
✅ setup.sh provisions 3 wallets and funds them
✅ run-demo.sh starts all agents — they begin interacting
✅ Economy runs for 10+ minutes without human intervention
✅ Console shows autonomous transaction count increasing
✅ All transactions verifiable on Solana Explorer
```

**Gate: The full earn → spend → save loop runs autonomously.**

---

## Phase 8 — Dashboards

### Task 8.1: Dashboard Project Setup

**What to do:**
- Create `packages/dashboard` as a Next.js app with TailwindCSS
- Set up routing: `/infrastructure` and `/agent/[id]`
- Install Recharts for charts
- Connect to Solana RPC for live data

**Test:**
```
✅ `pnpm dev` starts the dashboard on localhost
✅ Both routes render without errors
```

---

### Task 8.2: Infrastructure Dashboard

**What to do:**
- Build the `/infrastructure` page:
  - Total wallets provisioned (read from a JSON config or API)
  - Active agents (transacted in last 24h)
  - Total transaction volume
  - Live transaction feed (poll RPC or use Helius webhooks)
  - **Headline metric: "AUTONOMOUS TRANSACTIONS: X | HUMAN APPROVALS: 0"**

**Test:**
```
✅ Dashboard shows real wallet data from devnet
✅ Transaction count updates as demo agents run
✅ Human approvals counter stays at 0
```

---

### Task 8.3: Agent Owner Dashboard

**What to do:**
- Build the `/agent/[id]` page:
  - Wallet balances (primary + sub-wallets)
  - Transaction history with interpreted context (not raw data)
  - Net P&L since deployment
  - Activity feed showing agent decisions
  - Spending forecast ("X days of runway remaining")

**Test:**
```
✅ Selecting an agent shows its correct wallet address and balance
✅ Transaction history displays human-readable descriptions
✅ Balance updates reflect real on-chain state
```

---

## Phase 9 — OpenClaw Skill Package

### Task 9.1: Skill Package Structure

**What to do:**
- Finalize `packages/skills/glosso-wallet/` structure:
  ```
  glosso-wallet/
  ├── SKILL.md
  ├── SKILLS.md
  ├── references/
  │   ├── architecture.md
  │   └── security.md
  └── scripts/
      ├── setup.sh
      ├── provision.ts
      ├── balance.ts
      ├── send.ts
      └── swap.ts
  ```
- `SKILL.md` — machine-readable capability manifest
- `SKILLS.md` — bounty-required summary
- `setup.sh` — installs Glosso SDK + provisions wallet in one command
- Test compatibility with `npx clawhub@latest install` format if possible

**Test:**
```
✅ Running setup.sh from a clean directory installs everything and provisions a wallet
✅ An LLM agent reading SKILL.md can correctly determine available capabilities
✅ All scripts execute successfully when called from the skill directory
```

---

## Phase 10 — Documentation & Polish

### Task 10.1: README.md

**What to do:**
- Write root `README.md`:
  - Project overview (2 paragraphs)
  - Quick start (clone → install → provision → run demo)
  - Architecture diagram (ASCII or mermaid)
  - Links to deep-dive docs
- **Verify from a fresh clone** — follow your own README on a clean machine

**Test:**
```
✅ A fresh `git clone` → `pnpm install` → `pnpm run demo:setup` → `pnpm run demo:start` works
✅ Zero undocumented steps required
```

---

### Task 10.2: Deep Dive Document

**What to do:**
- Write `docs/deep-dive.md` covering:
  - Architecture decisions and tradeoffs
  - Signing abstraction layer design
  - Security model (Zero-Key-In-Context explained)
  - How the demo economy works
  - What would change for mainnet production

**Test:**
```
✅ Document covers all bounty-required sections
✅ Technical claims match actual implementation
```

---

### Task 10.3: Final Quality Gates

**What to do:**
- Run through every quality gate from the project plan:

```
Infrastructure
□ Sovereign adapter signs a real devnet transaction
□ Privy adapter signs a real devnet transaction
□ Turnkey adapter signs a real devnet transaction
□ Same glosso.sign() call works for all three modes
□ CLI provisioner writes correct .env without printing raw key
□ GLOSSO.md generated correctly reflects installed skills
□ Devnet airdrop works on fresh wallet provisioning

DeFi Skills
□ glosso_price() returns live Pyth data via Hermes
□ glosso_quote() returns valid Jupiter route (mainnet) or mock route (devnet)
□ glosso_swap() executes a real swap — verifiable on Explorer

Demo Economy
□ All three agents provision and fund successfully
□ SCOUT → TRADER signal + payment flow works
□ TRADER → VAULT payment flow works
□ Full loop runs for 10+ minutes without human input
□ Circuit breaker triggers when balance is low

Dashboards
□ Infrastructure dashboard shows real transaction data
□ Autonomous transactions counter increments in real time
□ Agent owner dashboard shows correct balances and history

OpenClaw Skill
□ Skill installs in one command via setup.sh
□ SKILL.md correctly describes all available capabilities
□ Agent using skill can check balance and send SOL

Documentation
□ README works from fresh clone — zero extra steps
□ Every transaction in demo is verifiable on Solana Explorer
□ Deep dive covers all required sections
```

---

## Priority Order (If Time Is Short)

If you can't complete everything, this is what matters most for a competitive submission:

1. **Sovereign adapter + real devnet transaction** (proves the core works)
2. **CLI provisioner** (proves the developer UX)
3. **Pyth price skill** (proves DeFi integration)
4. **3-agent demo running autonomously** (proves the vision)
5. **Infrastructure dashboard with "AUTONOMOUS: X, HUMAN: 0"** (proves the metric)

Everything else (Privy, Turnkey, Jupiter, Agent dashboard, OpenClaw packaging) adds points but isn't required if the above five work flawlessly.
