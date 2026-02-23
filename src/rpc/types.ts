/**
 * RPC infrastructure types
 *
 * Re-exports configuration types from @cygnus-wealth/rpc-infrastructure
 * and defines local runtime types (health results, metrics snapshots).
 *
 * @module rpc/types
 */

// Re-export all types from the canonical package
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

// ── Local runtime types (not in the package) ──

/**
 * Provider health status
 */
export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Health check result for a single provider
 */
export interface ProviderHealthResult {
  chainId: number;
  provider: string;
  endpoint: string;
  status: ProviderHealthStatus;
  latencyMs: number;
  blockNumber?: bigint;
  lastChecked: Date;
  error?: string;
}

/**
 * Latency percentile snapshot
 */
export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Provider metrics snapshot
 */
export interface ProviderMetricsSnapshot {
  chainId: number;
  provider: string;
  latency: LatencyPercentiles;
  errorRate: number;
  totalRequests: number;
  totalErrors: number;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Rolling metrics window duration (5 minutes)
 */
export const METRICS_ROLLING_WINDOW_MS = 5 * 60 * 1000;

/**
 * Default health check interval
 */
export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 60_000;
