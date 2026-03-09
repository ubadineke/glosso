# Security Model

> How Glosso protects private keys across all three signing backends.

---

## Overview

Glosso never exposes a raw private key to agent code, logs, or the network. The key exists only in function scope during a `sign()` call and is discarded immediately after. What leaves the process is always a **signature**, never a key.

Each signing backend offers a different trust boundary:

| Backend | Key Location | Trust Boundary |
|---|---|---|
| **Sovereign** | Encrypted on disk (AES-256-GCM) | Application process |
| **Privy** | TEE (Trusted Execution Environment) | Privy's infrastructure |
| **Turnkey** | HSM (Hardware Security Module) | Turnkey's infrastructure |

---

## Sovereign Mode — Cryptographic Details

Sovereign mode is fully self-hosted. No external services are contacted during signing.

![Sovereign-Summary](/assets/sovereign-lifecycle.png)

### Key Derivation

1. A 12-word **BIP39 mnemonic** is generated using cryptographically secure randomness (`crypto.randomBytes`)
2. The mnemonic is converted to a 64-byte seed via `bip39.mnemonicToSeedSync`
3. Solana keypairs are derived using **SLIP-0010** (Ed25519) with the BIP44 path:
   ```
   m/44'/501'/{index}'/0'
   ```
   - `44'` — BIP44 purpose (hardened)
   - `501'` — Solana coin type per SLIP-0044 (hardened)
   - `{index}'` — account index, `0` = primary wallet (hardened)
   - `0'` — change index (hardened)
4. All path components are **hardened** — knowledge of a child public key cannot reveal the parent key or any sibling keys

### Encryption at Rest

The mnemonic is encrypted before being written to `~/.glosso/.env`:

| Parameter | Value |
|---|---|
| Algorithm | AES-256-GCM |
| Key derivation | PBKDF2 with SHA-256 |
| Iterations | 100,000 |
| Salt | 32 bytes, random per encryption |
| IV | 16 bytes, random per encryption |
| Auth tag | 16 bytes (GCM integrity check) |

The encrypted blob stored in `GLOSSO_MASTER_SEED_ENCRYPTED` is a single base64 string containing:

```
[ salt (32B) | iv (16B) | authTag (16B) | ciphertext (variable) ]
```

### Decryption Flow (during signing)

```
GLOSSO_ENCRYPTION_PASSPHRASE
        ↓
PBKDF2(passphrase, salt, 100K iterations, SHA-256) → AES key
        ↓
AES-256-GCM decrypt(ciphertext, key, iv, authTag) → mnemonic
        ↓
SLIP-0010 derive(mnemonic, path) → Keypair (in function scope only)
        ↓
Keypair.sign(transaction) → signature
        ↓
Keypair is garbage collected (never stored, returned, or logged)
```

### What Gets Persisted

| Data | Location | Readable Without Passphrase? |
|---|---|---|
| Encrypted mnemonic (base64) | `~/.glosso/.env` | No — AES-256-GCM ciphertext |
| Wallet public address | `~/.glosso/.env` | Yes — public by definition |
| Encryption passphrase | User-provided (env var) | N/A — never written to disk by Glosso |
| Raw mnemonic | Nowhere | Never persisted |
| Private key bytes | Nowhere | Never persisted |

---

## Privy Mode

In Privy mode, the private key is generated and stored inside a **Trusted Execution Environment (TEE)**. Glosso never sees the key — it sends unsigned transactions to the Privy API, which signs them inside the TEE and returns the signature.

**What Glosso stores:** `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_WALLET_ID`, `PRIVY_WALLET_ADDRESS`

**What Glosso never sees:** The private key. It exists only inside Privy's TEE infrastructure.

---

## Turnkey Mode

In Turnkey mode, the private key lives in a **Hardware Security Module (HSM)**. Signing requests are authenticated via API key pairs and executed inside the HSM. The key material is non-extractable.

**What Glosso stores:** `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY`, `TURNKEY_ORGANIZATION_ID`, `TURNKEY_WALLET_ADDRESS`

**What Glosso never sees:** The wallet's private key. The Turnkey API keys authenticate requests but cannot extract the signing key.

---

## Threat Model

| Threat | Sovereign | Privy | Turnkey |
|---|---|---|---|
| **Disk read** (attacker reads `.env`) | Protected — AES-256-GCM ciphertext without passphrase is useless | Protected — only API credentials, not key material | Protected — only API credentials, not key material |
| **Ciphertext tampering** | Detected — GCM auth tag fails verification | N/A | N/A |
| **Passphrase brute-force** | Mitigated — PBKDF2 100K iterations | N/A | N/A |
| **Process memory dump** | Key exists briefly in function scope during signing | Key never enters process | Key never enters process |
| **Log exfiltration** | Safe — private key is never logged; only signatures and public addresses appear in logs | Same | Same |
| **Sub-wallet isolation** | Strong — hardened SLIP-0010 paths prevent sibling key derivation | Separate wallet IDs | Separate HSM key slots |
| **Network MITM** | N/A — signing is local | TLS to Privy API | TLS to Turnkey API |
| **Full server compromise** | At risk — attacker with passphrase + ciphertext can derive keys | Safer — key is in remote TEE | Safest — key is in HSM |

### Recommendation

- **Development / trusted servers:** Sovereign mode is sufficient. The passphrase is the security boundary.
- **Production with cloud agents:** Privy mode. The key never leaves the TEE, even if the agent process is fully compromised.
- **High-value / compliance:** Turnkey mode. HSM-backed, audit-logged, with organizational policies.

---

## Policy Engine as Defense Layer

Regardless of signing backend, the **policy engine** adds a second defense layer by rejecting transactions that violate configured limits *before* they reach the signing adapter:

- Per-transaction SOL limits
- Daily / hourly rate limits
- Program allowlists (only sign for Drift, Jupiter, etc.)
- Time-of-day windows
- Emergency pause (kill switch)

A compromised or misbehaving agent is constrained even if it has signing access. See [POLICY.md](POLICY.md) for details.

---

## Responsible Disclosure

If you discover a security vulnerability, please email **security@glosso.dev** or open a private GitHub advisory. Do not file a public issue.
