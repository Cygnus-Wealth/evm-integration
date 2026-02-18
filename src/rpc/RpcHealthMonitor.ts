/**
 * RPC Health Monitor
 *
 * Background ping per provider per chain (60s interval default).
 * Uses eth_blockNumber for EVM health checks.
 *
 * @module rpc/RpcHealthMonitor
 */

import { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager.js';
import { ProviderMetrics } from './ProviderMetrics.js';
import {
  RpcEndpoint,
  ProviderHealthResult,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
} from './types.js';

/**
 * Function that performs a health check against an endpoint URL.
 * For EVM, this should call eth_blockNumber and return the block number.
 */
export type RpcHealthCheckFn = (endpointUrl: string) => Promise<bigint>;

export interface RpcHealthMonitorConfig {
  healthCheckIntervalMs?: number;
  healthCheckFn: RpcHealthCheckFn;
}

interface RegisteredEndpoint {
  chainId: number;
  endpoint: RpcEndpoint;
}

export class RpcHealthMonitor {
  private cbManager: RpcCircuitBreakerManager;
  private metrics: ProviderMetrics;
  private intervalMs: number;
  private healthCheckFn: RpcHealthCheckFn;
  private registered: Map<string, RegisteredEndpoint> = new Map();
  private results: Map<string, ProviderHealthResult> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    cbManager: RpcCircuitBreakerManager,
    metrics: ProviderMetrics,
    config: RpcHealthMonitorConfig,
  ) {
    this.cbManager = cbManager;
    this.metrics = metrics;
    this.intervalMs = config.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;
    this.healthCheckFn = config.healthCheckFn;
  }

  registerEndpoint(chainId: number, endpoint: RpcEndpoint): void {
    const key = this.makeKey(chainId, endpoint.provider);
    this.registered.set(key, { chainId, endpoint });
    this.results.set(key, {
      chainId,
      provider: endpoint.provider,
      endpoint: endpoint.url,
      status: 'unknown',
      latencyMs: 0,
      lastChecked: new Date(),
    });
  }

  unregisterEndpoint(chainId: number, provider: string): void {
    const key = this.makeKey(chainId, provider);
    this.registered.delete(key);
    this.results.delete(key);
  }

  async runCheck(chainId: number, provider: string): Promise<void> {
    const key = this.makeKey(chainId, provider);
    const reg = this.registered.get(key);
    if (!reg) return;

    const startMs = performance.now();
    try {
      const blockNumber = await this.healthCheckFn(reg.endpoint.url);
      const latencyMs = performance.now() - startMs;

      this.metrics.recordSuccess(chainId, provider, latencyMs);

      this.results.set(key, {
        chainId,
        provider,
        endpoint: reg.endpoint.url,
        status: 'healthy',
        latencyMs,
        blockNumber,
        lastChecked: new Date(),
      });
    } catch (err) {
      const latencyMs = performance.now() - startMs;
      this.metrics.recordError(chainId, provider, latencyMs);

      this.results.set(key, {
        chainId,
        provider,
        endpoint: reg.endpoint.url,
        status: 'unhealthy',
        latencyMs,
        lastChecked: new Date(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async runAllChecks(): Promise<void> {
    const checks = Array.from(this.registered.entries()).map(([_, reg]) =>
      this.runCheck(reg.chainId, reg.endpoint.provider)
    );
    await Promise.all(checks);
  }

  start(): void {
    if (this.intervalId) return;

    // Run initial checks
    this.runAllChecks();

    this.intervalId = setInterval(() => {
      this.runAllChecks();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getStatus(chainId: number, provider: string): ProviderHealthResult | undefined {
    return this.results.get(this.makeKey(chainId, provider));
  }

  getAllStatuses(): ProviderHealthResult[] {
    return Array.from(this.results.values());
  }

  private makeKey(chainId: number, provider: string): string {
    return `${chainId}:${provider}`;
  }
}
