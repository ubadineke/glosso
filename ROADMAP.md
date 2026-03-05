# Glosso — Roadmap

## Shipped
- Sovereign / Turnkey / Privy wallet adapters with unified `GlossoWallet` interface
- Drift SDK compatibility (`toDriftWallet()`, VersionedTransaction signing)
- CLI provisioning with section-based `.env` persistence
- `glosso switch` — hot-swap wallet mode at runtime
- Dynamic explorer links on all transactions
- Activity logger (JSON Lines at `~/.glosso/activity.log`)
- `glosso logs` — color-coded CLI log viewer with `--follow`, `--session`, `--tail`
- `glosso monitor` — Ink TUI dashboard with price sparkline, TX stats, live feed

---

## Near-term

### Secrets: Remote env fetching
Currently `.env` files are local only. Add `--from-gist <id>` and `--from-doppler` flags to `glosso provision` so keys can be pulled from a remote store on fresh VMs (OpenClaw, CI, etc.).

- **GitHub Gist + PAT** — `glosso provision --from-gist <gist_id> --token <PAT>` fetches the encrypted `.env` blob and writes it locally
- **Doppler** — `glosso provision --from-doppler --project glosso --config devnet` pulls secrets directly via the Doppler CLI/API
- **Infisical** — same pattern with Infisical's REST API as an alternative

### Push to OpenClaw (`npx clawhub`)
Package and publish Glosso skills to the ClawHub registry so any OpenClaw deployment can install them with a single command:

```bash
npx clawhub publish glosso-jupiter
npx clawhub publish glosso-wallet
npx clawhub install glosso-jupiter  # from any agent
```

Requires: skill manifest schema, ClawHub auth token, semver tagging per skill.

### Skill versioning
Add `version` and `changelog` fields to each `SKILL.md` and `package.json`. Pin agent skill deps by version so upgrades are explicit.

---

## Medium-term

### Web dashboard
Browser-based equivalent of the TUI. Local Express server tails `activity.log` and serves a React app over SSE. No cloud dependency — just `glosso dashboard` to open it.

- SOL/USD price chart (recharts)
- Live activity feed
- Per-session PnL tracking
- Transaction table with explorer links

### Multi-agent support
Run multiple `demo/src/agent.ts` instances simultaneously (e.g. one per market), each with its own session ID and wallet. The monitor/dashboard aggregates all sessions into a single view with per-agent lanes.

### Position risk controls
Add guardrails the agent respects at the tool level — not just in the prompt:
- Max collateral per session
- Max open position size
- Daily loss limit (auto-pause if exceeded)
- Configurable in `.env` as `GLOSSO_MAX_COLLATERAL_SOL`, etc.

---

## Long-term / Exploratory

### `dashboard.glosso.xyz`
Hosted multi-tenant dashboard. Agents push structured events to a lightweight relay (WebSocket or HTTP); the hosted dashboard renders them. Useful for showing live agent activity publicly without exposing the machine.

### Additional skills
- `glosso-jupiter` — token swaps via Jupiter aggregator (in progress)
- `glosso-marginfi` — lending / borrowing on MarginFi
- `glosso-orca` — LP position management on Orca Whirlpools
- `glosso-tensor` — NFT floor sweeping / listing

### Agent memory
Persist trade history, session summaries, and decisions to a lightweight store (SQLite or a flat JSON file). Let the agent reference past sessions — "last time SOL hit $150 I closed too early" — for better decision-making.
