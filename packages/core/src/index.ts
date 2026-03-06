// @glosso/core — public API exports
export { GlossoWallet, ScopedGlossoWallet } from './glosso';
export type { GlossoDriftWallet } from './glosso';
export { SovereignAdapter } from './adapters/sovereign';
export { PrivyAdapter } from './adapters/privy';
export { TurnkeyAdapter } from './adapters/turnkey';
export type { WalletAdapter, AnyTransaction } from './adapters/interface';
export { isVersionedTx } from './adapters/interface';
export { generateMnemonic, deriveKeypair, deriveAddress, validateMnemonic } from './utils/derive';
export { encrypt, decrypt } from './utils/encrypt';
export { requestAirdrop } from './utils/airdrop';

// Activity logger
export {
  logEvent,
  logAgentStart,
  logAgentRound,
  logAgentThinking,
  logAgentEnd,
  logToolCall,
  logToolSuccess,
  logToolError,
  logPriceCheck,
  logBalanceCheck,
  readLogEntries,
  listSessions,
  getLogPath,
  setLogPath,
  getSessionId,
  setSessionId,
} from './utils/logger';
export type { ActivityEvent, ActivityEventType, LogEntry } from './utils/logger';

// Policy Engine
export { PolicyEngine } from './policy/engine';
export { PolicyStateManager } from './policy/state';
export {
  PolicyViolationError,
  type PolicyConfig,
  type PolicyPersistenceOptions,
  type PolicyState,
  type TxRecord,
  type ActiveHours,
} from './policy/types';
export {
  extractProgramIds,
  extractSolAmount,
  countInstructions,
  hasMemoInstruction,
} from './policy/parser';
