# Glosso

> *From Glossokomon (γλωσσόκομον) — the ancient Greek word for a keeper of precious things.*

**Agentic wallet infrastructure for Solana.** Glosso gives any AI agent an autonomous, production-grade Solana wallet it fully controls — no human approval loop, no key exposure, no framework lock-in.

---

<!-- diagram: problem-vs-solution -->
![Glosso — Autonomous vs Human-Gated](/assets/glosso-comparison.png)

---

## How It Works

Glosso's lifecycle is two phases. Operators run phase one once. Agents run phase two forever.

<!-- diagram: two-phase lifecycle (docs/glosso-lifecycle.png) -->

**Phase 1 — Provision (operator, one time)**

```bash
glosso provision --mode sovereign
```

Generates a wallet, encrypts keys, writes config to `.env`, and drops a `GLOSSO.md` capability manifest into the working directory. The raw private key is never printed.

**Phase 2 — Runtime (agent, autonomous)**

The agent reads `GLOSSO.md`, discovers its tools, and operates — sign, send, trade — without human input. Changing the signing backend (sovereign → privy → turnkey) requires only a config change, never a code change.


---

## Wallet Modes

Three signing backends. Pick at provision time, switch any time. Agent code never changes.

<!-- diagram: key storage side-by-side (docs/glosso-modes.png) -->

| Mode | Key Storage | Best For |
|---|---|---|
| **Sovereign** | Encrypted locally (AES-256-GCM) | Dev, trusted servers, zero external deps |
| **Privy** | Privy TEE (Trusted Execution Environment) | Production cloud, enterprise key management |
| **Turnkey** | HSM via Turnkey API | Scale, compliance, policy controls (spend limits, allowlists) |

```bash
glosso switch --mode privy
# Active wallet: EzwNi5jN2xTjaZRqAigXzKp4KyzcN8bXkwA1PHfckGo5
```

> For the full sovereign security model — key derivation, AES-256-GCM details, threat analysis — see [SECURITY.md](SECURITY.md).

---

## Skills

Glosso's capabilities are modular. Each skill ships a `SKILL.md` manifest the agent reads at startup to discover exactly what it can do.

<!-- diagram: SKILL.md → agent → tool calls → Solana (docs/glosso-skills.png) -->

| Skill | What it does |
|---|---|
| **glosso-wallet** | SOL balance, send transfers, transaction history |
| **glosso-pyth** | Real-time price feeds — SOL, BTC, ETH, USDC, JUP, BONK and more |
| **glosso-jupiter** | Token swap quotes and execution via Jupiter aggregator |

When a wallet is provisioned, a `GLOSSO.md` is written to the working directory listing every installed skill and its functions. The agent reads this once at startup — no hardcoded capability lists in prompts.

---

## Setup with OpenClaw

The fastest path to a Glosso wallet is through [OpenClaw](https://openclaw.dev). Run one command on your OpenClaw VM to install all three skills:

```bash
git clone https://github.com/ubadineke/glosso.git && cd glosso && bash install.sh
```

This installs `glosso-wallet`, `glosso-pyth`, and `glosso-jupiter` into `~/.openclaw/skills/`, then restart your OpenClaw gateway.

Then in the agent chat:

> "I need a Solana wallet."

The agent reads `SKILL.md`, asks which mode (sovereign/privy/turnkey), runs the provision script, and reports your wallet address. No config editing, no key management.

<!-- diagram: install.sh → SKILL.md → agent provisions → GLOSSO.md written (docs/glosso-openclaw.png) -->

---

## Demo — Autonomous Trading Agent

`demo/src/agent.ts` is a fully autonomous Drift trading agent. It reads `GLOSSO.md`, discovers its tools, then executes a complete trading cycle without prompting.

<!-- diagram: agent loop — GLOSSO.md → price check → deposit → open → close → log (docs/glosso-agent-loop.png) -->

**What the agent does in one session:**
1. Fetches live SOL price from Pyth
2. Deposits collateral into Drift
3. Opens a SOL-PERP long or short based on signal
4. Monitors position PnL
5. Closes the position
6. Logs every step to `~/.glosso/activity.log`

**Run it:**

```bash
# Terminal 1 — provision and run the agent
npm install -g glosso
glosso provision --mode sovereign

# Clone just for the demo agent source
git clone https://github.com/ubadineke/glosso
cd glosso/demo && cp .env.example .env   # add your XAI_API_KEY
npm install
npx tsx src/agent.ts

# Terminal 2 — watch it live
glosso monitor
```

---

## Quick Start

**Prerequisites:** Node.js 18+

```bash
# Install the CLI
npm install -g glosso

# Provision a wallet
glosso provision --mode sovereign

# Verify
glosso status
```

---

## CLI Reference

```bash
# Provision a wallet
glosso provision --mode sovereign|privy|turnkey [--network devnet|mainnet-beta]

# Check active wallet
glosso status

# Switch signing mode
glosso switch --mode <mode>

# View activity logs
glosso logs                   # all events
glosso logs --tail 50         # last 50
glosso logs --follow          # live tail
glosso logs --sessions        # list sessions
glosso logs --session <id>    # filter to one session

# TUI dashboard
glosso monitor
```

---

## Monitoring

Every tool call, transaction signature, thinking step, and error is written to `~/.glosso/activity.log` as append-only JSON Lines.

**`glosso logs`** — color-coded terminal tail:

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

**`glosso monitor`** — full-terminal Ink/React dashboard with live file watching:

<!-- - **Header** — mode, short address, network, clock
- **Wallet Panel** — SOL balance, open position, agent round
- **Activity Feed** — scrolling events with icons, results, explorer links
- **Price Chart** — SOL/USD sparkline, high/low, TX success rate
- **Status Bar** — TX count, error count, last result -->

![TUI Sample Image](/assets/glosso-monitor.png)
---

## Environment Variables

Section-based `.env` — only the active mode's block is read at runtime.

```bash
GLOSSO_MODE=sovereign            # sovereign | privy | turnkey
GLOSSO_NETWORK=devnet            # devnet | mainnet-beta

# ── Sovereign ──────────────────────────────────────────
GLOSSO_MASTER_SEED_ENCRYPTED=<base64 encrypted blob>
GLOSSO_ENCRYPTION_PASSPHRASE=<strong passphrase>
SOVEREIGN_WALLET_ADDRESS=<derived public key>

# ── Privy ──────────────────────────────────────────────
PRIVY_APP_ID=<app id>
PRIVY_APP_SECRET=<app secret>
PRIVY_WALLET_ID=<wallet id>
PRIVY_WALLET_ADDRESS=<wallet address>

# ── Turnkey ────────────────────────────────────────────
TURNKEY_API_PUBLIC_KEY=<key>
TURNKEY_API_PRIVATE_KEY=<key>
TURNKEY_ORGANIZATION_ID=<org id>
TURNKEY_WALLET_ADDRESS=<address>

# ── Agent / LLM ────────────────────────────────────────
XAI_API_KEY=<grok key>           # or OPENAI_API_KEY, ANTHROPIC_API_KEY
```

> Production tip: store `GLOSSO_ENCRYPTION_PASSPHRASE` in a secrets manager (Doppler, AWS Secrets Manager, Vault) and inject at runtime — keep it out of the `.env` file.

---

## Security

The sovereign adapter uses AES-256-GCM + PBKDF2 (100K iterations). The private key exists only in function scope during a sign call — it is never returned, logged, or persisted.

| Threat | Protection |
|---|---|
| `.env` read without passphrase | AES-256-GCM — ciphertext is useless without the key |
| Ciphertext tampering | GCM auth tag — modified blobs fail to decrypt |
| Passphrase brute-force | PBKDF2 100K iterations |
| Key appearing in logs | Key is never returned — only signatures are |
| One sub-wallet revealing another | Hardened SLIP-0010 derivation |

For process-level compromise or high-value deployments, use Privy or Turnkey — signing happens in hardware-isolated environments outside the application process.

Full details: [SECURITY.md](SECURITY.md)

---

## Monorepo Structure

```
glosso/
├── packages/
│   ├── core/       @glosso/core  — wallet adapters, signing, crypto, logger
│   ├── cli/        @glosso/cli   — provision, status, switch, logs, monitor
│   ├── monitor/    @glosso/monitor — Ink TUI dashboard
│   └── skills/
│       ├── glosso-wallet/
│       ├── glosso-pyth/
│       ├── glosso-jupiter/
├── demo/           Reference agent — Drift trading, full cycle
└── scripts/        Dev utilities — test data generation
```
---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full plan.

- **Remote secrets** — `glosso provision --from-doppler` / `--from-gist`
- **ClawHub publishing** — push skills to the OpenClaw registry
- **Web dashboard** — browser-based equivalent of the TUI
- **Multi-agent view** — aggregate multiple sessions in one monitor pane
- **Position risk controls** — max collateral, daily loss limits in `.env`
- **Additional skills** — MarginFi (lending), Orca (LP), Tensor (NFTs)
