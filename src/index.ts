// Hooks
export * from './hooks/useEvmBalance';
export * from './hooks/useEvmBalanceRealTime';
export * from './hooks/useEvmTransactionMonitor';
export * from './hooks/useEvmTransactions';
export * from './hooks/useEvmConnect';

// Providers
export * from './providers/WebSocketProvider';
export { EnhancedWebSocketProvider, ConnectionState } from './providers/EnhancedWebSocketProvider';
export type { 
  EnhancedWebSocketProviderOptions, 
  ChainConfig as EnhancedChainConfig 
} from './providers/EnhancedWebSocketProvider';

// Services
export * from './services/ConnectionManager';

// Types - Re-export from data-models
export * from './types';

// Utils
export { 
  mapChainIdToChain, 
  mapChainToChainId,
  mapEvmBalanceToBalance,
  mapTokenToAsset,
  mapEvmTransaction
} from './utils/mappers';