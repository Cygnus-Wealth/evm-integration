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

// Token Discovery Service - Dynamic ERC20 token discovery via Alchemy API
export { TokenDiscoveryService } from './services/TokenDiscoveryService.js';
export type {
  DiscoveredToken,
  TokenDiscoveryError,
  TokenDiscoveryResult,
  MultiChainTokenDiscoveryResult,
} from './types/TokenDiscovery.js';

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
export { CurveAdapter } from './defi/protocols/CurveAdapter.js';
export type { CurveAdapterOptions } from './defi/protocols/CurveAdapter.js';

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
// RPC INFRASTRUCTURE (Shared — importable by sol-integration)
// ============================================================================

export {
  RpcCircuitBreakerManager,
  RpcRateLimiter,
  RpcFallbackChain,
  RpcHealthMonitor,
  ProviderMetrics,
  DEFAULT_RPC_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_TOTAL_TIMEOUT_MS,
  DEFAULT_MAX_RETRY_ATTEMPTS,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  METRICS_ROLLING_WINDOW_MS,
  NON_RETRIABLE_STATUS_CODES,
} from './rpc/index.js';

export type {
  RpcEndpoint,
  RpcProviderConfig,
  CircuitBreakerKey,
  RpcCircuitBreakerConfig,
  ProviderHealthStatus,
  ProviderHealthResult,
  LatencyPercentiles,
  ProviderMetricsSnapshot,
  RpcCallResult,
  RpcCallFn,
  RpcHealthCheckFn,
  RpcHealthMonitorConfig,
} from './rpc/index.js';

// ============================================================================
// SUBSCRIPTION INFRASTRUCTURE
// ============================================================================

// Subscription Service - Real-time WebSocket subscriptions with polling fallback
export {
  SubscriptionService,
  WebSocketConnectionManager,
  NewHeadsSubscription,
  TransferLogsSubscription,
  PollManager,
  EventBus,
  DEFAULT_CHAIN_ENDPOINTS,
  SubscriptionEventType,
  ERC20_TRANSFER_TOPIC,
  DEFAULT_WS_CONNECTION_CONFIG,
  DEFAULT_POLL_CONFIG,
  DEFAULT_SUBSCRIPTION_CONFIG,
} from './subscriptions/index.js';

export type {
  ISubscriptionService,
  SubscriptionHandle,
  SubscriptionInfo,
  SubscriptionType,
  SubscriptionStatus,
  SubscriptionServiceConfig,
  WebSocketConnectionConfig,
  PollManagerConfig,
  ConnectionInfo,
  ConnectionStatus,
  TransportType,
  LiveBalanceUpdate,
  LiveTransferEvent,
  LiveBlock,
  LivePendingTransaction,
  LiveContractEvent,
  SubscriptionEvent,
  EventListener as SubscriptionEventListener,
  ChainWsEndpoint,
} from './subscriptions/index.js';

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

// Re-export types from the types directory
export * from './types/index.js';