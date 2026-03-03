# Sovereign Adapter — Architecture & How It Works

## Overview

The Sovereign Adapter is Glosso's **fully self-custodial** wallet backend. No third-party key custodian is involved — all cryptographic material stays on your machine and is encrypted at rest. It is the default mode for development and for agents running on trusted infrastructure.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        .env File                            │
│                                                             │
│  GLOSSO_MODE=sovereign                                      │
│  GLOSSO_MASTER_SEED_ENCRYPTED=base64(salt+iv+tag+cipher)    │
│  GLOSSO_ENCRYPTION_PASSPHRASE=your-strong-passphrase        │
│  GLOSSO_NETWORK=devnet                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     GlossoWallet                            │
│                                                             │
│  • Reads GLOSSO_MODE                                        │
│  • Routes to SovereignAdapter (or Privy/Turnkey in future)  │
│  • Exposes a unified API: getAddress, getBalance, sign, send│
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   SovereignAdapter                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  getKeypair(index)                     │  │
│  │                                                       │  │
│  │  1. Read encrypted seed from config                   │  │
│  │  2. Decrypt with AES-256-GCM (PBKDF2-derived key)    │  │
│  │  3. Derive keypair at m/44'/501'/{index}'/0'          │  │
│  │  4. Return Keypair — mnemonic goes out of scope       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  getAddress(index)  → calls getKeypair → returns pubkey     │
│  getBalance(index)  → calls getKeypair → queries RPC        │
│  sign(tx, index)    → calls getKeypair → signs → returns tx │
│  send(to, amt, idx) → calls getKeypair → build+sign+send   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                    Solana Devnet RPC
```

---

## Key Lifecycle

Every wallet operation follows the same **decrypt → derive → act → discard** pattern.

### Step 1: Passphrase → AES Key

```
Passphrase (from .env)
       │
       ▼
PBKDF2 (SHA-256, 100,000 iterations, 32-byte salt)
       │
       ▼
AES-256 Symmetric Key (32 bytes)
```

PBKDF2 intentionally slows down key derivation to make brute-force attacks against the passphrase computationally expensive.

### Step 2: Decrypt the Mnemonic

```
AES-256 Key + IV (16 bytes) + Auth Tag (16 bytes)
       │
       ▼
AES-256-GCM Decrypt
       │
       ▼
BIP39 Mnemonic (12 words, exists only in function scope)
```

The encrypted blob stored in `.env` has the layout:
```
base64( salt[32] | iv[16] | authTag[16] | ciphertext[variable] )
```

AES-GCM provides both **confidentiality** (encryption) and **integrity** (auth tag detects tampering).

### Step 3: HD Key Derivation

```
BIP39 Mnemonic
       │
       ▼
mnemonicToSeedSync() → 64-byte seed
       │
       ▼
SLIP-0010 (ed25519-hd-key) derivation
Path: m/44'/501'/{index}'/0'
       │
       ▼
Ed25519 Keypair (Solana-compatible)
```

The derivation path follows **BIP44** convention:
- `44'` — BIP44 purpose
- `501'` — Solana coin type (SLIP-0044 registry)
- `{index}'` — account index (0 = primary, 1 = trading, 2 = vault, etc.)
- `0'` — hardened change index

**Deterministic:** Same mnemonic + same index always produces the same keypair.

### Step 4: Use & Discard

The keypair is used to sign the transaction. When the function (`getKeypair`) returns:
- The mnemonic string goes out of scope → eligible for garbage collection
- The keypair is used by the caller and then also goes out of scope
- No key material is stored, cached, logged, or returned to the agent

```
getKeypair(index) called
    ├── mnemonic decrypted (local variable)
    ├── keypair derived (local variable)
    ├── mnemonic goes out of scope ← GC eligible
    └── keypair returned to caller
             │
             ▼
        sign/send uses keypair
             │
             ▼
        keypair goes out of scope ← GC eligible
```

---

## Multi-Wallet Architecture

A single mnemonic can derive an unlimited number of independent wallets by varying the `index` parameter:

```
              ┌─── m/44'/501'/0'/0' ──► Primary Wallet
              │                         (main balance)
              │
Mnemonic ─────┼─── m/44'/501'/1'/0' ──► Trading Wallet
              │                         (DeFi operations)
              │
              ├─── m/44'/501'/2'/0' ──► Vault Wallet
              │                         (long-term storage)
              │
              └─── m/44'/501'/N'/0' ──► Purpose-N Wallet
```

Each sub-wallet has:
- Its own Ed25519 keypair
- Its own Solana address
- Its own SOL balance
- Full isolation from other indices

Knowing one sub-wallet's private key does **not** reveal the private key of any other sub-wallet or the mnemonic itself. The only way to derive all wallets is to possess the mnemonic.

---

## Encryption Details

### Algorithm: AES-256-GCM

| Parameter | Value |
|---|---|
| Algorithm | AES-256-GCM |
| Key length | 256 bits (32 bytes) |
| IV length | 128 bits (16 bytes, random per encryption) |
| Auth tag length | 128 bits (16 bytes) |
| Key derivation | PBKDF2-SHA256 |
| KDF iterations | 100,000 |
| Salt length | 256 bits (32 bytes, random per encryption) |

### Why AES-256-GCM?

- **Authenticated encryption** — the auth tag ensures data integrity. If a single bit of the ciphertext or salt or IV is altered, decryption fails. This detects tampering.
- **No padding oracle attacks** — GCM is a streaming mode, unlike CBC which requires padding and is vulnerable to padding oracle attacks.
- **Standard library** — uses Node.js built-in `crypto` module. Zero external dependencies for encryption.

### Why PBKDF2?

- Intentionally slow — 100,000 iterations adds ~100ms per decrypt call, which is negligible for wallet operations but makes brute-force attacks on the passphrase extremely expensive.
- Random salt per encryption means identical passphrases produce different AES keys, preventing rainbow table attacks.

---

## Security Properties

| Property | Mechanism |
|---|---|
| **Keys encrypted at rest** | AES-256-GCM encrypts the mnemonic in `.env` |
| **No raw key on disk** | Only the encrypted blob is persisted |
| **Short key lifetime** | Private key exists only during one sign/send call |
| **Tamper detection** | GCM auth tag rejects modified ciphertext |
| **Brute-force resistance** | PBKDF2 with 100K iterations slows passphrase guessing |
| **Replay resistance** | Random salt + IV per encryption — never the same ciphertext twice |
| **Sub-wallet isolation** | Hardened derivation — one key can't reveal another |
| **No network exposure** | Keys never sent over the network — only signed transactions are broadcast |

---

## Known Limitations & Threat Model

### What it protects against

- ✅ Reading the `.env` file without knowing the passphrase
- ✅ Tampering with the encrypted blob (auth tag verification fails)
- ✅ Brute-forcing weak passphrases (PBKDF2 slows attacks)
- ✅ Log/API leakage (private keys never appear in return values or logs)

### What it does NOT protect against

- ❌ **Compromised process** — if the Node.js process is compromised (e.g. malicious npm dependency, debugger attached, memory dump), an attacker could read the decrypted key during a sign call
- ❌ **Stolen .env** — if both `GLOSSO_MASTER_SEED_ENCRYPTED` and `GLOSSO_ENCRYPTION_PASSPHRASE` are exfiltrated together, the attacker can decrypt the mnemonic. Use a strong passphrase and protect the `.env` file
- ❌ **No hardware isolation** — unlike HSMs (Turnkey) or secure enclaves (Privy), all key material is in software memory. This is the fundamental tradeoff of any software wallet
- ❌ **Garbage collection timing** — JavaScript does not guarantee when garbage collection runs. The mnemonic bytes may persist in heap memory beyond function scope until the GC reclaims them

### Mitigations for production

1. **Use Privy or Turnkey mode** for production agents handling significant value — they push signing into hardened environments
2. **Separate passphrase from seed** — store `GLOSSO_ENCRYPTION_PASSPHRASE` in a secrets manager (e.g. AWS Secrets Manager, Vault) rather than in `.env`
3. **Restrict file permissions** — `chmod 600 .env` so only the owner can read it
4. **Audit npm dependencies** — use `npm audit` and lock files to prevent supply-chain attacks

---

## File Map

```
packages/core/src/
├── utils/
│   ├── derive.ts       ← BIP39 mnemonic + SLIP-0010 HD derivation
│   ├── encrypt.ts      ← AES-256-GCM encrypt/decrypt
│   └── airdrop.ts      ← Devnet airdrop utility
├── adapters/
│   ├── interface.ts    ← WalletAdapter interface (shared by all modes)
│   └── sovereign.ts    ← SovereignAdapter implementation
├── glosso.ts           ← GlossoWallet router (reads GLOSSO_MODE)
└── index.ts            ← Public API exports
```

---

## API Quick Reference

```typescript
import { GlossoWallet } from '@glosso/core';

// Wallet auto-configures from .env
const wallet = new GlossoWallet();

// Get addresses
const primary = await wallet.getAddress(0);   // primary wallet
const trading = await wallet.getAddress(1);   // trading sub-wallet

// Check balance
const balance = await wallet.getBalance(0);   // in SOL

// Send a transaction
const sig = await wallet.send(recipient, 100_000, 0);  // lamports from primary

// Sign without broadcasting
const signedTx = await wallet.sign(transaction, 0);
```
