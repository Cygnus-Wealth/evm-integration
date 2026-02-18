/**
 * RPC Infrastructure
 *
 * Shared RPC provider fallback chain components.
 * All classes are exported for sol-integration to import or duplicate.
 *
 * @module rpc
 */

// Types
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
} from './types.js';

export {
  DEFAULT_RPC_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_TOTAL_TIMEOUT_MS,
  DEFAULT_MAX_RETRY_ATTEMPTS,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  METRICS_ROLLING_WINDOW_MS,
  NON_RETRIABLE_STATUS_CODES,
} from './types.js';

// Circuit Breaker Manager
export { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager.js';

// Rate Limiter
export { RpcRateLimiter } from './RpcRateLimiter.js';

// Fallback Chain
export { RpcFallbackChain } from './RpcFallbackChain.js';
export type { RpcCallFn } from './RpcFallbackChain.js';

// Health Monitor
export { RpcHealthMonitor } from './RpcHealthMonitor.js';
export type { RpcHealthCheckFn, RpcHealthMonitorConfig } from './RpcHealthMonitor.js';

// Provider Metrics
export { ProviderMetrics } from './ProviderMetrics.js';
