# Glosso Architecture

> Technical deep-dive on wallet infrastructure design decisions.

---

## System Architecture

```
┌──────────────────────────────────────────────────┐
│                   AI Agent                        │
│  (OpenClaw, elizaOS, LangChain, custom bot)      │
└─────────────────────┬────────────────────────────┘
                      │ imports
┌─────────────────────▼────────────────────────────┐
│              Glosso SDK (@glosso/sdk)              │
│  ┌──────────────────────────────────────────────┐ │
│  │            GlossoWallet Router               │ │
│  │  Reads GLOSSO_MODE → dispatches to adapter   │ │
│  └──────┬──────────┬──────────────┬─────────────┘ │
│         │          │              │                │
│  ┌──────▼──┐ ┌─────▼─────┐ ┌─────▼──────┐        │
│  │Sovereign│ │   Privy   │ │  Turnkey   │        │
│  │ Adapter │ │  Adapter  │ │  Adapter   │        │
│  └─────────┘ └───────────┘ └────────────┘        │
└──────────────────────────────────────────────────┘
```

## Adapter Interface

All wallet backends implement the same interface:

```typescript
interface WalletAdapter {
  getAddress(index: number): Promise<string>;
  getBalance(index: number): Promise<number>;
  sign(message: Uint8Array, index: number): Promise<Uint8Array>;
  send(to: string, lamports: number, index: number): Promise<string>;
}
```

This ensures agent code NEVER changes between wallet modes. Only `.env` configuration differs.

---

## Sovereign Mode — Key Management

### Key Lifecycle

```
Provisioning (one-time):
  1. Generate BIP39 mnemonic (128-bit entropy → 12 words)
  2. Encrypt with AES-256-GCM (PBKDF2 100K iterations)
  3. Write encrypted blob to GLOSSO_MASTER_SEED_ENCRYPTED
  4. Password stored in GLOSSO_ENCRYPTION_PASSWORD
  5. Mnemonic displayed once → user stores backup → deleted from memory

Runtime (every transaction):
  1. Read encrypted seed from env
  2. Decrypt with password
  3. Derive private key at BIP44 path m/44'/501'/{index}'/0'
  4. Sign transaction in memory
  5. Private key garbage collected (goes out of scope)
```

### Why derive-discard?

Private keys are NEVER stored. They are derived on-demand from the encrypted seed, used for exactly one signing operation, and then fall out of scope for garbage collection. This means:

- No key file on disk
- No key in memory longer than necessary
- Compromising the running process reveals nothing (key already collected)
- Only the encrypted seed + password are persistent

### Sub-Wallet Derivation

```
Master Seed
    │
    ├── m/44'/501'/0'/0'  →  Primary   (agent identity, receives funds)
    ├── m/44'/501'/1'/0'  →  Trading   (DeFi ops, swaps, risk budgets)
    ├── m/44'/501'/2'/0'  →  Vault     (long-term storage, cold)
    └── m/44'/501'/3'/0'  →  Burner    (disposable, risky interactions)
```

Each sub-wallet is a completely independent Solana address. The same seed deterministically produces the same addresses every time.

---

## Privy Mode — Managed Custody

Privy manages keys inside a Trusted Execution Environment (TEE):
- Private key is sharded — never whole in any single location
- Signing happens inside the TEE; key never leaves Privy infrastructure
- Glosso sends unsigned transaction bytes → Privy returns signature
- No key material in the agent's environment at any point

---

## Turnkey Mode — HSM Custody

Turnkey stores keys in Hardware Security Modules (HSMs):
- Keys generated and stored in tamper-evident hardware
- Signing is an API call — key never exported
- Policy-based controls (spending limits, allowlists)
- Enterprise-grade audit logs

---

## Encryption Details

| Parameter       | Value                    |
|----------------|--------------------------|
| Algorithm      | AES-256-GCM              |
| Key derivation | PBKDF2                   |
| Iterations     | 100,000                  |
| Hash           | SHA-512                  |
| Salt           | 32 bytes (random)        |
| IV             | 16 bytes (random)        |
| Auth tag       | 16 bytes                 |

**Storage format:** `base64(salt[32] + iv[16] + authTag[16] + ciphertext)`

Each encryption produces a unique salt and IV, so the same plaintext never produces the same ciphertext.

---

## Network Architecture

```
Agent Process
    │
    ├── Solana RPC ───→ https://api.devnet.solana.com
    │                   (or mainnet-beta endpoint)
    │
    ├── Pyth Hermes ──→ https://hermes.pyth.network
    │                   (free, no API key)
    │
    ├── Jupiter V6 ───→ https://quote-api.jup.ag/v6
    │                   (mainnet only)
    │
    ├── Privy API ────→ https://auth.privy.io
    │                   (managed mode only)
    │
    └── Turnkey API ──→ https://api.turnkey.com
                        (HSM mode only)
```

All external calls are HTTPS. No WebSocket connections needed (reduces attack surface).
