/**
 * @cygnus-wealth/evm-integration
 * 
 * A TypeScript library for standardized read-only access to EVM-compatible blockchains.
 * Returns all data in @cygnus-wealth/data-models format.
 * 
 * This is a framework-agnostic data access layer.
 */

// ============================================================================
// CORE PUBLIC API
// ============================================================================

// Chain Registry - Primary API for multi-chain support
export { ChainRegistry, defaultRegistry } from './registry/ChainRegistry';
export type { NetworkEnvironment } from './registry/ChainRegistry';

// Chain Adapter - Direct adapter usage
export { EvmChainAdapter } from './adapters/EvmChainAdapter';

// Type Definitions
export type { 
  IChainAdapter, 
  ChainInfo, 
  TokenConfig, 
  TransactionOptions, 
  Unsubscribe 
} from './types/IChainAdapter';
export type { ChainConfig } from './types/ChainConfig';

// Utility Exports
export { 
  mapChainIdToChain, 
  mapChainToChainId,
  mapEvmBalanceToBalance,
  mapTokenToAsset,
  mapEvmTransaction
} from './utils/mappers';

// Chain Configurations (for convenience)
import ethereumConfig from './registry/configs/ethereum.json';
import polygonConfig from './registry/configs/polygon.json';
import arbitrumConfig from './registry/configs/arbitrum.json';
import optimismConfig from './registry/configs/optimism.json';
import baseConfig from './registry/configs/base.json';
import sepoliaConfig from './registry/configs/sepolia.json';

export const chains = {
  ethereum: ethereumConfig,
  polygon: polygonConfig,
  arbitrum: arbitrumConfig,
  optimism: optimismConfig,
  base: baseConfig,
  sepolia: sepoliaConfig,
};

// ============================================================================
// PROVIDERS (Advanced Usage)
// ============================================================================

// WebSocket providers for real-time connections
export * from './providers/WebSocketProvider';
export { 
  EnhancedWebSocketProvider, 
  ConnectionState 
} from './providers/EnhancedWebSocketProvider';
export type { 
  EnhancedWebSocketProviderOptions, 
  ChainConfig as EnhancedChainConfig 
} from './providers/EnhancedWebSocketProvider';

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

// Re-export types from the types directory
export * from './types';