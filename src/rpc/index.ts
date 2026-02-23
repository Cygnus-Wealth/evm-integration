/**
 * RPC Infrastructure
 *
 * Shared RPC provider fallback chain components.
 * Configuration types are from @cygnus-wealth/rpc-infrastructure.
 *
 * @module rpc
 */

// Re-exported configuration types from package
export {
  RpcProviderRole,
  RpcProviderType,
} from '@cygnus-wealth/rpc-infrastructure';

export type {
  RpcEndpointConfig,
  ChainRpcConfig,
  RpcProviderConfig,
  CircuitBreakerConfig,
  RetryConfig,
  HealthCheckConfig,
  PrivacyConfig,
  UserRpcEndpoint,
  UserRpcConfig,
} from '@cygnus-wealth/rpc-infrastructure';

// Local runtime types
export type {
  ProviderHealthStatus,
  ProviderHealthResult,
  LatencyPercentiles,
  ProviderMetricsSnapshot,
} from './types.js';

export {
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  METRICS_ROLLING_WINDOW_MS,
} from './types.js';

// Circuit Breaker Manager
export { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager.js';

// Rate Limiter
export { RpcRateLimiter } from './RpcRateLimiter.js';

// Tier Rotator
export { TierRotator } from './TierRotator.js';

// Fallback Chain
export { RpcFallbackChain } from './RpcFallbackChain.js';
export type { RpcCallFn, RpcCallResult } from './RpcFallbackChain.js';

// Health Monitor
export { RpcHealthMonitor } from './RpcHealthMonitor.js';
export type { RpcHealthCheckFn, RpcHealthMonitorConfig } from './RpcHealthMonitor.js';

// Provider Metrics
export { ProviderMetrics } from './ProviderMetrics.js';
