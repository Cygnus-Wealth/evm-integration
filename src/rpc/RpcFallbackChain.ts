/**
 * RPC Fallback Chain
 *
 * Ordered endpoint traversal with circuit breaker + rate limiter integration,
 * cache fallback, and total timeout enforcement (30s default).
 * Retry: maxAttempts=2, exponential backoff, skip on 403/401.
 *
 * @module rpc/RpcFallbackChain
 */

import { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager.js';
import { RpcRateLimiter } from './RpcRateLimiter.js';
import { ProviderMetrics } from './ProviderMetrics.js';
import {
  RpcProviderConfig,
  RpcEndpoint,
  RpcCallResult,
  NON_RETRIABLE_STATUS_CODES,
  DEFAULT_TOTAL_TIMEOUT_MS,
  DEFAULT_MAX_RETRY_ATTEMPTS,
} from './types.js';

export type RpcCallFn<T> = (endpointUrl: string) => Promise<T>;

export class RpcFallbackChain<T = unknown> {
  private config: RpcProviderConfig;
  private cbManager: RpcCircuitBreakerManager;
  private rateLimiter: RpcRateLimiter;
  private metrics: ProviderMetrics;
  private cache: Map<string, T> = new Map();
  private sortedEndpoints: RpcEndpoint[];

  constructor(
    config: RpcProviderConfig,
    cbManager: RpcCircuitBreakerManager,
    rateLimiter: RpcRateLimiter,
    metrics: ProviderMetrics,
  ) {
    this.config = config;
    this.cbManager = cbManager;
    this.rateLimiter = rateLimiter;
    this.metrics = metrics;
    this.sortedEndpoints = [...config.endpoints].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute an RPC call through the fallback chain.
   * Tries endpoints in priority order, applies circuit breaker + rate limiting,
   * retries with exponential backoff, enforces total timeout.
   */
  async execute(fn: RpcCallFn<T>): Promise<RpcCallResult<T>> {
    const totalTimeout = this.config.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
    const maxRetries = this.config.maxRetryAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS;
    const deadline = Date.now() + totalTimeout;
    const errors: Error[] = [];

    for (const endpoint of this.sortedEndpoints) {
      if (Date.now() >= deadline) break;

      // Skip if circuit breaker is open
      if (this.cbManager.isOpen(this.config.chainId, endpoint.provider)) {
        continue;
      }

      const breaker = this.cbManager.getBreaker(this.config.chainId, endpoint.provider);
      const rl = this.rateLimiter.getLimiter(endpoint.url, endpoint.rateLimitRps);

      // Retry loop for this endpoint
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (Date.now() >= deadline) break;

        const startMs = Date.now();
        try {
          // Rate limit
          await rl.acquire();

          // Execute through circuit breaker
          const value = await this.executeWithTimeout(
            () => breaker.execute(() => fn(endpoint.url)),
            deadline - Date.now()
          );

          const latencyMs = Date.now() - startMs;
          this.metrics.recordSuccess(this.config.chainId, endpoint.provider, latencyMs);

          return {
            value,
            endpoint: endpoint.url,
            provider: endpoint.provider,
            latencyMs,
            attempts: attempt + 1,
            fromCache: false,
          };
        } catch (err) {
          const latencyMs = Date.now() - startMs;
          const error = err as Error;
          errors.push(error);
          this.metrics.recordError(this.config.chainId, endpoint.provider, latencyMs);

          // Don't retry on auth failures
          if (this.isNonRetriable(error)) break;

          // Exponential backoff between retries (skip on last attempt)
          if (attempt < maxRetries) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), deadline - Date.now());
            if (backoffMs > 0) {
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
          }
        }
      }
    }

    throw new Error(
      `All RPC endpoints failed for chain ${this.config.chainId}. ` +
      `Errors: ${errors.map(e => e.message).join('; ')}`
    );
  }

  /**
   * Execute with cache fallback — returns cached value if all endpoints fail.
   */
  async executeWithCache(cacheKey: string, fn: RpcCallFn<T>): Promise<RpcCallResult<T>> {
    try {
      const result = await this.execute(fn);
      // Update cache on success
      this.cache.set(cacheKey, result.value);
      return result;
    } catch (err) {
      // Try cache fallback
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        return {
          value: cached,
          endpoint: 'cache',
          provider: 'cache',
          latencyMs: 0,
          attempts: 0,
          fromCache: true,
        };
      }
      throw err;
    }
  }

  /**
   * Manually set a cached value (e.g. for pre-population)
   */
  setCachedValue(key: string, value: T): void {
    this.cache.set(key, value);
  }

  private async executeWithTimeout<R>(fn: () => Promise<R>, remainingMs: number): Promise<R> {
    if (remainingMs <= 0) throw new Error('RPC fallback chain total timeout exceeded');

    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RPC fallback chain total timeout exceeded')), remainingMs)
      ),
    ]);
  }

  private isNonRetriable(error: Error): boolean {
    const status = (error as any).status;
    if (typeof status === 'number') {
      return (NON_RETRIABLE_STATUS_CODES as readonly number[]).includes(status);
    }
    return false;
  }
}
