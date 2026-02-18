import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RpcFallbackChain } from './RpcFallbackChain';
import { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager';
import { RpcRateLimiter } from './RpcRateLimiter';
import { ProviderMetrics } from './ProviderMetrics';
import type { RpcProviderConfig, RpcEndpoint } from './types';

function makeConfig(endpoints: RpcEndpoint[]): RpcProviderConfig {
  return {
    chainId: 1,
    chainName: 'Ethereum',
    endpoints,
    totalTimeoutMs: 5000,
    maxRetryAttempts: 2,
  };
}

function makeEndpoint(provider: string, priority: number, rps = 25): RpcEndpoint {
  return {
    url: `https://${provider}.example.com`,
    provider,
    rateLimitRps: rps,
    priority,
  };
}

describe('RpcFallbackChain', () => {
  let cbManager: RpcCircuitBreakerManager;
  let rateLimiter: RpcRateLimiter;
  let metrics: ProviderMetrics;

  beforeEach(() => {
    cbManager = new RpcCircuitBreakerManager({
      failureThreshold: 3,
      rollingWindowMs: 60_000,
      openTimeoutMs: 30_000,
      successThreshold: 2,
    });
    rateLimiter = new RpcRateLimiter();
    metrics = new ProviderMetrics();
  });

  describe('successful execution', () => {
    it('should execute RPC call through first available endpoint', async () => {
      const config = makeConfig([
        makeEndpoint('alchemy', 0),
        makeEndpoint('drpc', 1),
      ]);

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);
      const result = await chain.execute(async (url) => `result from ${url}`);

      expect(result.value).toBe('result from https://alchemy.example.com');
      expect(result.provider).toBe('alchemy');
      expect(result.endpoint).toBe('https://alchemy.example.com');
      expect(result.fromCache).toBe(false);
      expect(result.attempts).toBeGreaterThanOrEqual(1);
    });

    it('should record success metrics', async () => {
      const config = makeConfig([makeEndpoint('alchemy', 0)]);
      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);

      await chain.execute(async () => 'ok');

      const snap = metrics.getSnapshot(1, 'alchemy');
      expect(snap).toBeDefined();
      expect(snap!.totalRequests).toBe(1);
      expect(snap!.totalErrors).toBe(0);
    });
  });

  describe('fallback behavior', () => {
    it('should fall back to second endpoint when first fails', async () => {
      const config = makeConfig([
        makeEndpoint('alchemy', 0),
        makeEndpoint('drpc', 1),
      ]);
      config.maxRetryAttempts = 0; // No retries to keep test fast

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);
      let callCount = 0;

      const result = await chain.execute(async (url) => {
        callCount++;
        if (url.includes('alchemy')) throw new Error('alchemy down');
        return `result from ${url}`;
      });

      expect(result.value).toBe('result from https://drpc.example.com');
      expect(result.provider).toBe('drpc');
    });

    it('should skip endpoints with open circuit breakers', async () => {
      const config = makeConfig([
        makeEndpoint('alchemy', 0),
        makeEndpoint('drpc', 1),
      ]);

      // Open the circuit breaker for alchemy
      const breaker = cbManager.getBreaker(1, 'alchemy');
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);
      const calls: string[] = [];

      const result = await chain.execute(async (url) => {
        calls.push(url);
        return 'ok';
      });

      // Should skip alchemy entirely and go straight to drpc
      expect(calls).toEqual(['https://drpc.example.com']);
      expect(result.provider).toBe('drpc');
    });

    it('should throw when all endpoints fail', async () => {
      const config = makeConfig([
        makeEndpoint('alchemy', 0),
        makeEndpoint('drpc', 1),
      ]);
      config.totalTimeoutMs = 200;
      config.maxRetryAttempts = 0; // No retries to keep test fast

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);

      await expect(
        chain.execute(async () => { throw new Error('all down'); })
      ).rejects.toThrow();
    });
  });

  describe('retry behavior', () => {
    it('should retry up to maxRetryAttempts per endpoint', async () => {
      const config = makeConfig([makeEndpoint('alchemy', 0)]);
      config.maxRetryAttempts = 2;

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);
      let attemptCount = 0;

      const result = await chain.execute(async () => {
        attemptCount++;
        if (attemptCount < 3) throw new Error('transient');
        return 'success';
      });

      expect(result.value).toBe('success');
      // 1 initial + 2 retries = 3 total
      expect(attemptCount).toBe(3);
    });

    it('should NOT retry on 403 errors', async () => {
      const config = makeConfig([
        makeEndpoint('alchemy', 0),
        makeEndpoint('drpc', 1),
      ]);
      config.maxRetryAttempts = 2;

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);
      let alchemyCalls = 0;

      const result = await chain.execute(async (url) => {
        if (url.includes('alchemy')) {
          alchemyCalls++;
          const err = new Error('Forbidden');
          (err as any).status = 403;
          throw err;
        }
        return 'drpc ok';
      });

      // Should NOT retry on 403 — just 1 call then move to next endpoint
      expect(alchemyCalls).toBe(1);
      expect(result.provider).toBe('drpc');
    });

    it('should NOT retry on 401 errors', async () => {
      const config = makeConfig([
        makeEndpoint('alchemy', 0),
        makeEndpoint('drpc', 1),
      ]);

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);
      let alchemyCalls = 0;

      const result = await chain.execute(async (url) => {
        if (url.includes('alchemy')) {
          alchemyCalls++;
          const err = new Error('Unauthorized');
          (err as any).status = 401;
          throw err;
        }
        return 'drpc ok';
      });

      expect(alchemyCalls).toBe(1);
      expect(result.provider).toBe('drpc');
    });
  });

  describe('cache fallback', () => {
    it('should return cached value when all endpoints fail', async () => {
      const config = makeConfig([makeEndpoint('alchemy', 0)]);
      config.maxRetryAttempts = 0;

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);

      // Set a cached value
      chain.setCachedValue('test-key', 'cached result');

      const result = await chain.executeWithCache(
        'test-key',
        async () => { throw new Error('all down'); }
      );

      expect(result.value).toBe('cached result');
      expect(result.fromCache).toBe(true);
    });

    it('should not use cache when endpoints succeed', async () => {
      const config = makeConfig([makeEndpoint('alchemy', 0)]);
      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);

      chain.setCachedValue('test-key', 'stale');

      const result = await chain.executeWithCache(
        'test-key',
        async () => 'fresh'
      );

      expect(result.value).toBe('fresh');
      expect(result.fromCache).toBe(false);
    });

    it('should throw when no cache available and all fail', async () => {
      const config = makeConfig([makeEndpoint('alchemy', 0)]);
      config.maxRetryAttempts = 0;
      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);

      await expect(
        chain.executeWithCache('no-cache', async () => { throw new Error('fail'); })
      ).rejects.toThrow();
    });
  });

  describe('total timeout', () => {
    it('should enforce total timeout across all endpoints', async () => {
      const config = makeConfig([
        makeEndpoint('alchemy', 0),
        makeEndpoint('drpc', 1),
      ]);
      config.totalTimeoutMs = 100;

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);

      await expect(
        chain.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'too slow';
        })
      ).rejects.toThrow(/timeout/i);
    });
  });

  describe('endpoint ordering', () => {
    it('should respect priority ordering', async () => {
      const config = makeConfig([
        makeEndpoint('drpc', 2),
        makeEndpoint('alchemy', 0),
        makeEndpoint('public', 1),
      ]);
      config.maxRetryAttempts = 0; // No retries — one attempt per endpoint

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);
      const callOrder: string[] = [];

      // First two endpoints fail, third succeeds
      await chain.execute(async (url) => {
        callOrder.push(url);
        if (url.includes('alchemy')) throw new Error('fail');
        if (url.includes('public')) throw new Error('fail');
        return 'ok';
      });

      // Should be ordered by priority: alchemy(0), public(1), drpc(2)
      expect(callOrder[0]).toContain('alchemy');
      expect(callOrder[1]).toContain('public');
      expect(callOrder[2]).toContain('drpc');
    });
  });

  describe('metrics recording', () => {
    it('should record error metrics for failed endpoints', async () => {
      const config = makeConfig([
        makeEndpoint('alchemy', 0),
        makeEndpoint('drpc', 1),
      ]);
      config.maxRetryAttempts = 0;

      const chain = new RpcFallbackChain(config, cbManager, rateLimiter, metrics);

      await chain.execute(async (url) => {
        if (url.includes('alchemy')) throw new Error('fail');
        return 'ok';
      });

      const alchemySnap = metrics.getSnapshot(1, 'alchemy');
      expect(alchemySnap).toBeDefined();
      expect(alchemySnap!.totalErrors).toBeGreaterThan(0);

      const drpcSnap = metrics.getSnapshot(1, 'drpc');
      expect(drpcSnap).toBeDefined();
      expect(drpcSnap!.totalErrors).toBe(0);
    });
  });
});
