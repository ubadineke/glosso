# Glosso Security Model

> How Glosso protects private keys and prevents unauthorized access.

---

## Threat Model

Glosso is designed to protect against:

| Threat                           | Mitigation                                          |
|----------------------------------|-----------------------------------------------------|
| Key theft from disk              | Keys are never stored on disk in any form           |
| Key theft from memory            | Derive-and-discard pattern — keys exist only during signing |
| Encrypted seed brute force       | AES-256-GCM with PBKDF2 100K iterations             |
| Man-in-the-middle (RPC)          | HTTPS-only connections to all endpoints              |
| Malicious agent/plugin           | Sub-wallet isolation — burner wallets for risky ops  |
| Single point of compromise       | Multi-mode architecture (sovereign/privy/turnkey)    |
| Replay attacks                   | Solana's recent blockhash prevents transaction replay|

---

## Key Management by Mode

### Sovereign

**Stored:** Encrypted mnemonic (AES-256-GCM) in `GLOSSO_MASTER_SEED_ENCRYPTED` env var.

**Never stored:** Private keys, raw mnemonic (after provisioning).

**Signing flow:**
1. Read encrypted blob from environment
2. Decrypt with PBKDF2-derived key (100K iterations, SHA-512)
3. Derive keypair at specific BIP44 path
4. Sign the transaction
5. Keypair falls out of function scope → garbage collected
6. Encrypted blob remains unchanged

**Window of exposure:** Private key exists in memory only during the `sign()` or `send()` function call (~10ms).

### Privy (Managed)

**Stored:** `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_WALLET_ID` in env vars.

**Never stored:** Private key — it exists only inside Privy's TEE.

**Signing flow:**
1. Construct unsigned transaction
2. Serialize to base64
3. POST to Privy API (`/api/v1/wallets/{id}/rpc`)
4. Privy signs inside TEE, returns signature
5. Attach signature to transaction, submit to Solana

**Window of exposure:** Zero — key material never leaves Privy infrastructure.

### Turnkey (HSM)

**Stored:** `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY`, `TURNKEY_ORGANIZATION_ID` in env vars.

**Never stored:** Solana private key — it exists only inside Turnkey's HSM.

**Signing flow:**
1. Initialize TurnkeySigner with API credentials
2. Add Solana wallet as signer
3. Sign transaction via Turnkey SDK (API call to HSM)
4. HSM signs, returns result
5. Submit signed transaction to Solana

**Window of exposure:** Zero — key material never leaves HSM hardware.

---

## Encryption Specification

```
Algorithm:   AES-256-GCM (authenticated encryption)
KDF:         PBKDF2
Hash:        SHA-512
Iterations:  100,000
Salt:        32 bytes (cryptographically random, unique per encryption)
IV/Nonce:    16 bytes (cryptographically random, unique per encryption)
Auth Tag:    16 bytes (integrity verification)

Output:      base64( salt[32] || iv[16] || authTag[16] || ciphertext )
```

### Why AES-256-GCM?

- **Authenticated:** The auth tag ensures ciphertext hasn't been tampered with. Decrypting modified ciphertext fails rather than producing garbage.
- **Standard:** NIST approved, widely audited, hardware-accelerated on modern CPUs (AES-NI).
- **100K PBKDF2 iterations:** Makes brute-force password cracking computationally expensive (~1 second per guess).

---

## Sub-Wallet Isolation

Each sub-wallet is a distinct Solana address with its own balance:

```
[Primary 0] ──── Agent's public identity, receives payments
      ↕ transfer
[Trading 1] ──── DeFi operations, bounded risk budget
      ↕ transfer
[Vault 2]   ──── Long-term savings, rarely touched
      
[Burner 3]  ──── Disposable, for risky interactions
```

**Risk containment:** If a trading strategy goes wrong, only the trading sub-wallet is affected. Vault and primary funds remain safe. A compromised interaction with a malicious contract only drains the burner wallet.

---

## Environment Variable Security

**Recommended practices:**

1. **Never commit `.env` to git** — `.gitignore` includes `.env` by default
2. **Use secrets management in production** — AWS Secrets Manager, Vault, etc.
3. **Rotate encryption passwords** — Re-encrypt with `glosso provision` using a new password
4. **Separate environments** — Different `.env` for dev/staging/production
5. **File permissions** — `chmod 600 .env` (owner read/write only)

---

## What Glosso Does NOT Protect Against

- **Compromised host machine** — If the attacker has root access to the machine running the agent, they can read environment variables, intercept memory, etc. Use managed modes (Privy/Turnkey) for higher security.
- **Compromised agent logic** — If the agent's decision-making is manipulated (prompt injection), Glosso will faithfully execute malicious transactions. This is an agent-framework concern, not a wallet concern.
- **Network-level attacks on Solana** — Glosso relies on Solana's security guarantees for on-chain finality.

---

## Audit Status

Glosso is a submission for the Superteam Nigeria DeFi Developer Challenge. It has NOT been professionally audited. The cryptographic primitives used (AES-256-GCM, PBKDF2, BIP39, Ed25519) are all well-established standards with extensive audit history.

**Do not use in production with real funds without a security review.**
