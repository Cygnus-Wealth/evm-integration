/**
 * RPC infrastructure types
 *
 * Defines configuration and state types for the RPC provider fallback chain.
 * These types should eventually align with @cygnus-wealth/data-models RpcProviderConfig.
 *
 * @module rpc/types
 */

/**
 * Single RPC endpoint configuration
 */
export interface RpcEndpoint {
  /** Full URL (HTTP or WebSocket) */
  url: string;
  /** Provider name (e.g. 'alchemy', 'drpc', 'public') */
  provider: string;
  /** Max requests per second for this endpoint */
  rateLimitRps: number;
  /** Endpoint priority (lower = higher priority) */
  priority: number;
  /** Whether this is a WebSocket endpoint */
  isWebSocket?: boolean;
  /** Optional API key (injected via env vars, not hardcoded) */
  apiKey?: string;
}

/**
 * RPC provider configuration per chain
 */
export interface RpcProviderConfig {
  /** Chain ID */
  chainId: number;
  /** Chain name for display/logging */
  chainName: string;
  /** Ordered list of RPC endpoints (highest priority first) */
  endpoints: RpcEndpoint[];
  /** Total timeout for the fallback chain in ms @default 30000 */
  totalTimeoutMs?: number;
  /** Max retry attempts per endpoint @default 2 */
  maxRetryAttempts?: number;
  /** Health check interval in ms @default 60000 */
  healthCheckIntervalMs?: number;
}

/**
 * Circuit breaker key for per-(chainId, provider) tracking
 */
export interface CircuitBreakerKey {
  chainId: number;
  provider: string;
}

/**
 * Circuit breaker configuration specific to RPC
 */
export interface RpcCircuitBreakerConfig {
  /** Failures within rolling window to trigger OPEN @default 5 */
  failureThreshold: number;
  /** Rolling window for failure counting (ms) @default 60000 */
  rollingWindowMs: number;
  /** Time in OPEN before transitioning to HALF_OPEN (ms) @default 30000 */
  openTimeoutMs: number;
  /** Successes in HALF_OPEN to close @default 3 */
  successThreshold: number;
}

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
 * RPC call result with metadata
 */
export interface RpcCallResult<T> {
  value: T;
  endpoint: string;
  provider: string;
  latencyMs: number;
  attempts: number;
  fromCache: boolean;
}

/**
 * Default RPC circuit breaker configuration per directive
 */
export const DEFAULT_RPC_CIRCUIT_BREAKER_CONFIG: RpcCircuitBreakerConfig = {
  failureThreshold: 5,
  rollingWindowMs: 60_000,
  openTimeoutMs: 30_000,
  successThreshold: 3,
};

/**
 * Default total timeout for fallback chain
 */
export const DEFAULT_TOTAL_TIMEOUT_MS = 30_000;

/**
 * Default max retry attempts per endpoint
 */
export const DEFAULT_MAX_RETRY_ATTEMPTS = 2;

/**
 * Default health check interval
 */
export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 60_000;

/**
 * Rolling metrics window duration (5 minutes)
 */
export const METRICS_ROLLING_WINDOW_MS = 5 * 60 * 1000;

/**
 * HTTP status codes that should NOT be retried
 */
export const NON_RETRIABLE_STATUS_CODES = [401, 403] as const;
