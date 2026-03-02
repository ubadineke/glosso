// @glosso/sdk — public API for AI agents

// Main wallet class — the only thing most agents need
export { GlossoWallet } from '@glosso/core';

// Adapter interface for custom adapter implementations
export type { WalletAdapter } from '@glosso/core';

// Adapters — for direct use without GlossoWallet router
export { SovereignAdapter } from '@glosso/core';
export { PrivyAdapter } from '@glosso/core';
export { TurnkeyAdapter } from '@glosso/core';

// Utilities — for advanced use cases
export {
  generateMnemonic,
  deriveKeypair,
  deriveAddress,
  validateMnemonic,
} from '@glosso/core';

export { encrypt, decrypt } from '@glosso/core';
export { requestAirdrop } from '@glosso/core';
