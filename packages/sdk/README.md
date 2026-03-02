# @glosso/sdk

> Wallet infrastructure for AI agents on Solana.

## Installation

```bash
npm install @glosso/sdk
# or
pnpm add @glosso/sdk
```

## Quick Start

```typescript
import { GlossoWallet } from '@glosso/sdk';

// Reads GLOSSO_MODE, GLOSSO_MASTER_SEED_ENCRYPTED, etc. from process.env
const wallet = new GlossoWallet();

// Get wallet address
const address = await wallet.getAddress();      // primary wallet
const trading = await wallet.getAddress(1);     // trading sub-wallet

// Check balance
const balance = await wallet.getBalance();      // in SOL

// Send SOL
const sig = await wallet.send(recipientAddress, 100_000);  // lamports
console.log(`Transaction: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

// Sign without broadcasting
const signedTx = await wallet.sign(transaction);
```

## Environment Variables

Set these in your `.env` file (or use `glosso provision` to auto-generate):

```env
GLOSSO_MODE=sovereign
GLOSSO_NETWORK=devnet
GLOSSO_MASTER_SEED_ENCRYPTED=<encrypted-blob>
GLOSSO_ENCRYPTION_PASSPHRASE=<passphrase>
```

## Wallet Modes

| Mode | Description | Key Custody |
|---|---|---|
| `sovereign` | Self-custodial, keys encrypted on disk | You |
| `privy` | Privy embedded wallets | Privy enclaves |
| `turnkey` | Turnkey infrastructure wallets | Turnkey HSMs |

## Multi-Wallet Support

Each wallet supports multiple sub-wallets derived from a single master seed:

```typescript
wallet.getAddress(0)  // Primary wallet
wallet.getAddress(1)  // Trading wallet
wallet.getAddress(2)  // Vault wallet
wallet.send(to, amount, 1)  // Send from trading wallet
```

## API Reference

### `GlossoWallet`

- `getAddress(index?: number): Promise<string>` — Get wallet public address
- `getBalance(index?: number): Promise<number>` — Get SOL balance
- `sign(transaction: Transaction, index?: number): Promise<Transaction>` — Sign a transaction
- `send(to: string, lamports: number, index?: number): Promise<string>` — Send SOL, returns tx signature

### `SovereignAdapter`

Direct access to the sovereign wallet backend, implements `WalletAdapter`.

### Utilities

- `generateMnemonic(): string`
- `deriveKeypair(mnemonic, index): Keypair`
- `deriveAddress(mnemonic, index): string`
- `encrypt(plaintext, passphrase): string`
- `decrypt(blob, passphrase): string`

## License

MIT
