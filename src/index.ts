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
export { ChainRegistry, defaultRegistry } from './registry/ChainRegistry.js';
export type { NetworkEnvironment } from './registry/ChainRegistry.js';

// Chain Adapter - Direct adapter usage
export { EvmChainAdapter } from './adapters/EvmChainAdapter.js';

// Type Definitions
export type { 
  IChainAdapter, 
  ChainInfo, 
  TokenConfig, 
  TransactionOptions, 
  Unsubscribe 
} from './types/IChainAdapter.js';
export type { ChainConfig } from './types/ChainConfig.js';

// Utility Exports
export { 
  mapChainIdToChain, 
  mapChainToChainId,
  mapEvmBalanceToBalance,
  mapTokenToAsset,
  mapEvmTransaction
} from './utils/mappers.js';

// Chain Configurations (for convenience)
import ethereumConfig from './registry/configs/ethereum.json' with { type: 'json' };
import polygonConfig from './registry/configs/polygon.json' with { type: 'json' };
import arbitrumConfig from './registry/configs/arbitrum.json' with { type: 'json' };
import optimismConfig from './registry/configs/optimism.json' with { type: 'json' };
import baseConfig from './registry/configs/base.json' with { type: 'json' };
import sepoliaConfig from './registry/configs/sepolia.json' with { type: 'json' };

export const chains = {
  ethereum: ethereumConfig,
  polygon: polygonConfig,
  arbitrum: arbitrumConfig,
  optimism: optimismConfig,
  base: baseConfig,
  sepolia: sepoliaConfig,
};

// ============================================================================
// SERVICES
// ============================================================================

// Balance Service - High-level balance operations with caching and resilience
export { BalanceService } from './services/BalanceService.js';
export type {
  BalanceQueryOptions,
  MultiChainBalanceOptions,
  MultiChainBalance,
  MultiChainAllBalances,
  BalanceSubscriptionOptions,
  BalanceServiceConfig,
  BalanceServiceStats,
} from './services/BalanceService.js';

// DeFi Service - Read DeFi protocol positions (Beefy, Aave, etc.)
export { DeFiService } from './defi/DeFiService.js';
export type {
  DeFiQueryOptions,
  DeFiServiceStats,
} from './defi/DeFiService.js';
export type {
  IDeFiProtocol,
  DeFiPositions,
  MultiChainDeFiPositions,
  DeFiServiceConfig,
} from './defi/types.js';
export { BeefyAdapter } from './defi/protocols/BeefyAdapter.js';
export type { BeefyAdapterOptions } from './defi/protocols/BeefyAdapter.js';
export { AaveAdapter, AAVE_V3_DEPLOYMENTS } from './defi/protocols/AaveAdapter.js';
export type { AaveAdapterOptions } from './defi/protocols/AaveAdapter.js';

// ============================================================================
// PROVIDERS (Advanced Usage)
// ============================================================================

// WebSocket providers for real-time connections
export * from './providers/WebSocketProvider.js';
export { 
  EnhancedWebSocketProvider, 
  ConnectionState 
} from './providers/EnhancedWebSocketProvider.js';
export type {
  EnhancedWebSocketProviderOptions,
  ChainConfig as EnhancedChainConfig
} from './providers/EnhancedWebSocketProvider.js';

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

// Re-export types from the types directory
export * from './types/index.js';