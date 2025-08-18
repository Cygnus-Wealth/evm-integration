// Hooks - Public API (preserved for backward compatibility)
export * from './hooks/useEvmBalance';
export * from './hooks/useEvmBalanceRealTime';
export * from './hooks/useEvmTokenBalance';
export * from './hooks/useEvmTokenBalances';
export * from './hooks/useEvmTokenBalanceRealTime';
export * from './hooks/useEvmTransactionMonitor';
export * from './hooks/useEvmTransactions';
export * from './hooks/useEvmConnect';

// New DDD-based hooks
export { usePortfolio, usePortfolioRealTime } from './hooks/usePortfolio';

// Providers - Public API (preserved for backward compatibility)
export * from './providers/WebSocketProvider';
export { EnhancedWebSocketProvider, ConnectionState } from './providers/EnhancedWebSocketProvider';
export type { 
  EnhancedWebSocketProviderOptions, 
  ChainConfig as EnhancedChainConfig 
} from './providers/EnhancedWebSocketProvider';

// Services - Public API (preserved for backward compatibility)
export * from './services/ConnectionManager';

// Types - Re-export from data-models
export * from './types';

// Utils - Public API (preserved for backward compatibility)
export { 
  mapChainIdToChain, 
  mapChainToChainId,
  mapEvmBalanceToBalance,
  mapTokenToAsset,
  mapEvmTransaction
} from './utils/mappers';

// Domain layer exports (new DDD architecture)
export { WalletAddress, InvalidAddressError } from './domain/blockchain/Address';
export { EvmChain, UnsupportedChainError } from './domain/blockchain/Chain';
export { Balance } from './domain/portfolio/Balance';
export { Portfolio, type PortfolioSnapshot } from './domain/portfolio/Portfolio';
export type { IEvmRepository } from './domain/IEvmRepository';
export { RepositoryError, RpcUnavailableError, InsufficientDataError } from './domain/IEvmRepository';

// Application layer exports
export { PortfolioService } from './application/services/PortfolioService';

// Infrastructure layer exports
export { EvmRepository } from './infrastructure/blockchain/EvmRepository';
export { ConfigurationService } from './infrastructure/config/ConfigurationService';
export type { 
  EvmIntegrationConfig, 
  ChainConfig, 
  RpcConfig 
} from './infrastructure/config/ConfigurationService';

// Branded types for improved type safety
export {
  type Brand,
  type ChainId,
  type BlockNumber,
  type TransactionHash,
  type Wei,
  type Timestamp,
  type TokenAddress,
  type AssetId,
  toChainId,
  toBlockNumber,
  toTransactionHash,
  toWei,
  toTimestamp,
  toTokenAddress,
  toAssetId,
  isChainId,
  isBlockNumber,
  isTransactionHash,
  isWei,
  isTimestamp,
  isTokenAddress,
  isAssetId
} from './domain/types/BrandedTypes';