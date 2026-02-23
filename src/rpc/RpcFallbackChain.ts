/**
 * RPC Fallback Chain
 *
 * Tier-based endpoint traversal with circuit breaker + rate limiter integration,
 * within-tier rotation, cache fallback, and total timeout enforcement.
 *
 * Uses types from @cygnus-wealth/rpc-infrastructure.
 *
 * @module rpc/RpcFallbackChain
 */

import { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager.js';
import { RpcRateLimiter } from './RpcRateLimiter.js';
import { ProviderMetrics } from './ProviderMetrics.js';
import { TierRotator } from './TierRotator.js';
import type {
  ChainRpcConfig,
  RpcEndpointConfig,
  RetryConfig,
  PrivacyConfig,
} from '@cygnus-wealth/rpc-infrastructure';

const NON_RETRIABLE_STATUS_CODES = [401, 403] as const;

export interface RpcCallResult<T> {
  value: T;
  endpoint: string;
  provider: string;
  latencyMs: number;
  attempts: number;
  fromCache: boolean;
}

export type RpcCallFn<T> = (endpointUrl: string) => Promise<T>;

export class RpcFallbackChain<T = unknown> {
  private chainConfig: ChainRpcConfig;
  private cbManager: RpcCircuitBreakerManager;
  private rateLimiter: RpcRateLimiter;
  private metrics: ProviderMetrics;
  private retry: RetryConfig;
  private privacy: PrivacyConfig;
  private rotator: TierRotator;
  private cache: Map<string, T> = new Map();

  constructor(
    chainConfig: ChainRpcConfig,
    cbManager: RpcCircuitBreakerManager,
    rateLimiter: RpcRateLimiter,
    metrics: ProviderMetrics,
    retry: RetryConfig,
    privacy: PrivacyConfig,
  ) {
    this.chainConfig = chainConfig;
    this.cbManager = cbManager;
    this.rateLimiter = rateLimiter;
    this.metrics = metrics;
    this.retry = retry;
    this.privacy = privacy;
    this.rotator = new TierRotator(chainConfig.endpoints);

    // Register URL→(chainId, provider) mappings for circuit breaker lookups
    for (const ep of chainConfig.endpoints) {
      cbManager.registerEndpointUrl(chainConfig.chainId, ep.provider, ep.url);
    }
  }

  /**
   * Execute an RPC call through the tiered fallback chain.
   *
   * Traverses tiers in order (PRIMARY → SECONDARY → TERTIARY → EMERGENCY).
   * Within each tier, tries endpoints with optional rotation and retry.
   */
  async execute(fn: RpcCallFn<T>): Promise<RpcCallResult<T>> {
    const deadline = Date.now() + this.chainConfig.totalOperationTimeoutMs;
    const errors: Error[] = [];
    const tiers = this.rotator.getTierOrder();

    for (const tier of tiers) {
      if (Date.now() >= deadline) break;

      const tierResult = await this.executeTier(tier, fn, deadline, errors);
      if (tierResult) return tierResult;
    }

    throw new Error(
      `All RPC endpoints failed for chain ${this.chainConfig.chainId}. ` +
      `Errors: ${errors.map(e => e.message).join('; ')}`
    );
  }

  /**
   * Execute with cache fallback — returns cached value if all endpoints fail.
   */
  async executeWithCache(cacheKey: string, fn: RpcCallFn<T>): Promise<RpcCallResult<T>> {
    try {
      const result = await this.execute(fn);
      this.cache.set(cacheKey, result.value);
      return result;
    } catch (err) {
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

  /**
   * Try all endpoints in a single tier, with optional rotation.
   */
  private async executeTier(
    tier: ReturnType<TierRotator['getTierOrder']>[number],
    fn: RpcCallFn<T>,
    deadline: number,
    errors: Error[],
  ): Promise<RpcCallResult<T> | null> {
    const triedUrls = new Set<string>();
    const tierEndpoints = this.rotator.getEndpointsForTier(tier);
    const maxTierAttempts = tierEndpoints.length;

    for (let i = 0; i < maxTierAttempts; i++) {
      if (Date.now() >= deadline) break;

      // Build exclusion set: already tried + circuit-broken
      const excluded = new Set<string>(triedUrls);
      for (const ep of tierEndpoints) {
        if (this.cbManager.isOpen(this.chainConfig.chainId, ep.provider)) {
          excluded.add(ep.url);
        }
      }

      const endpoint = this.rotator.selectNext(
        tier,
        this.privacy.rotateWithinTier,
        excluded,
      );

      if (!endpoint) break;
      triedUrls.add(endpoint.url);

      const result = await this.executeEndpoint(endpoint, fn, deadline, errors);
      if (result) return result;
    }

    return null;
  }

  /**
   * Try a single endpoint with retries.
   */
  private async executeEndpoint(
    endpoint: RpcEndpointConfig,
    fn: RpcCallFn<T>,
    deadline: number,
    errors: Error[],
  ): Promise<RpcCallResult<T> | null> {
    const maxAttempts = this.retry.maxAttempts;
    const breaker = this.cbManager.getBreaker(this.chainConfig.chainId, endpoint.provider);
    const rl = this.rateLimiter.getLimiter(endpoint.url, endpoint.rateLimitRps);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() >= deadline) break;

      const startMs = Date.now();
      try {
        await rl.acquire();

        const value = await this.executeWithTimeout(
          () => breaker.execute(() => fn(endpoint.url)),
          deadline - Date.now(),
        );

        const latencyMs = Date.now() - startMs;
        this.metrics.recordSuccess(this.chainConfig.chainId, endpoint.provider, latencyMs);

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
        this.metrics.recordError(this.chainConfig.chainId, endpoint.provider, latencyMs);

        if (this.isNonRetriable(error)) break;

        // Exponential backoff between retries (skip on last attempt)
        if (attempt < maxAttempts - 1) {
          const delay = Math.min(
            this.retry.baseDelayMs * Math.pow(2, attempt),
            this.retry.maxDelayMs,
          );
          const waitMs = Math.min(delay, deadline - Date.now());
          if (waitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
          }
        }
      }
    }

    return null;
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
