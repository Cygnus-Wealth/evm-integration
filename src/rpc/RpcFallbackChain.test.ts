import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RpcFallbackChain } from './RpcFallbackChain';
import { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager';
import { RpcRateLimiter } from './RpcRateLimiter';
import { ProviderMetrics } from './ProviderMetrics';
import {
  RpcProviderRole,
  RpcProviderType,
} from '@cygnus-wealth/rpc-infrastructure';
import type {
  ChainRpcConfig,
  RpcEndpointConfig,
  CircuitBreakerConfig,
  RetryConfig,
  PrivacyConfig,
} from '@cygnus-wealth/rpc-infrastructure';

function makeEndpoint(
  provider: string,
  role: RpcProviderRole,
  opts?: Partial<RpcEndpointConfig>,
): RpcEndpointConfig {
  return {
    url: `https://${provider}.example.com`,
    provider,
    role,
    type: RpcProviderType.MANAGED,
    rateLimitRps: 50,
    timeoutMs: 5000,
    weight: 100,
    ...opts,
  };
}

function makeChainConfig(
  endpoints: RpcEndpointConfig[],
  overrides?: Partial<ChainRpcConfig>,
): ChainRpcConfig {
  return {
    chainId: 1,
    chainName: 'Ethereum',
    endpoints,
    totalOperationTimeoutMs: 5000,
    cacheStaleAcceptanceMs: 60_000,
    ...overrides,
  };
}

const defaultRetry: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000,
};

const defaultCB: CircuitBreakerConfig = {
  failureThreshold: 3,
  openDurationMs: 30_000,
  halfOpenMaxAttempts: 2,
  monitorWindowMs: 60_000,
};

const defaultPrivacy: PrivacyConfig = {
  rotateWithinTier: false,
  privacyMode: false,
  queryJitterMs: 0,
};

describe('RpcFallbackChain', () => {
  let cbManager: RpcCircuitBreakerManager;
  let rateLimiter: RpcRateLimiter;
  let metrics: ProviderMetrics;

  beforeEach(() => {
    cbManager = new RpcCircuitBreakerManager(defaultCB);
    rateLimiter = new RpcRateLimiter();
    metrics = new ProviderMetrics();
  });

  describe('successful execution', () => {
    it('should execute RPC call through first PRIMARY endpoint', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('drpc', RpcProviderRole.SECONDARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, defaultPrivacy,
      );

      const result = await chain.execute(async (url) => `result from ${url}`);
      expect(result.value).toBe('result from https://alchemy.example.com');
      expect(result.provider).toBe('alchemy');
      expect(result.fromCache).toBe(false);
      expect(result.attempts).toBeGreaterThanOrEqual(1);
    });

    it('should record success metrics', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, defaultPrivacy,
      );

      await chain.execute(async () => 'ok');

      const snap = metrics.getSnapshot(1, 'alchemy');
      expect(snap).toBeDefined();
      expect(snap!.totalRequests).toBe(1);
      expect(snap!.totalErrors).toBe(0);
    });
  });

  describe('tier-based fallback', () => {
    it('should fall back from PRIMARY to SECONDARY when PRIMARY fails', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('infura', RpcProviderRole.SECONDARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics,
        { ...defaultRetry, maxAttempts: 1 },
        defaultPrivacy,
      );

      const result = await chain.execute(async (url) => {
        if (url.includes('alchemy')) throw new Error('alchemy down');
        return `result from ${url}`;
      });

      expect(result.value).toBe('result from https://infura.example.com');
      expect(result.provider).toBe('infura');
    });

    it('should traverse tiers in order: PRIMARY → SECONDARY → TERTIARY → EMERGENCY', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('emergency-rpc', RpcProviderRole.EMERGENCY),
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('ankr', RpcProviderRole.TERTIARY),
        makeEndpoint('infura', RpcProviderRole.SECONDARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics,
        { ...defaultRetry, maxAttempts: 1 },
        defaultPrivacy,
      );

      const callOrder: string[] = [];
      const result = await chain.execute(async (url) => {
        callOrder.push(url);
        if (!url.includes('emergency-rpc')) throw new Error('fail');
        return 'ok';
      });

      expect(callOrder[0]).toContain('alchemy');
      expect(callOrder[1]).toContain('infura');
      expect(callOrder[2]).toContain('ankr');
      expect(callOrder[3]).toContain('emergency-rpc');
      expect(result.provider).toBe('emergency-rpc');
    });

    it('should skip endpoints with open circuit breakers', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('drpc', RpcProviderRole.SECONDARY),
      ]);

      // Open the circuit breaker for alchemy
      cbManager.registerEndpointUrl(1, 'alchemy', 'https://alchemy.example.com');
      const breaker = cbManager.getBreaker(1, 'alchemy');
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, defaultPrivacy,
      );

      const calls: string[] = [];
      const result = await chain.execute(async (url) => {
        calls.push(url);
        return 'ok';
      });

      expect(calls).toEqual(['https://drpc.example.com']);
      expect(result.provider).toBe('drpc');
    });

    it('should throw when all endpoints fail', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('drpc', RpcProviderRole.SECONDARY),
      ], { totalOperationTimeoutMs: 500 });

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics,
        { ...defaultRetry, maxAttempts: 1 },
        defaultPrivacy,
      );

      await expect(
        chain.execute(async () => { throw new Error('all down'); })
      ).rejects.toThrow();
    });
  });

  describe('rotateWithinTier', () => {
    it('should rotate among endpoints within the same tier when enabled', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY, { weight: 100 }),
        makeEndpoint('infura', RpcProviderRole.PRIMARY, { weight: 100 }),
      ]);

      const privacy: PrivacyConfig = {
        rotateWithinTier: true,
        privacyMode: false,
        queryJitterMs: 0,
      };

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, privacy,
      );

      const providers = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = await chain.execute(async (url) => `from ${url}`);
        providers.add(result.provider);
      }

      // With rotation enabled and equal weights, both should be hit
      expect(providers.has('alchemy')).toBe(true);
      expect(providers.has('infura')).toBe(true);
    });

    it('should NOT rotate when rotateWithinTier is disabled', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('infura', RpcProviderRole.PRIMARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, defaultPrivacy,
      );

      const providers = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const result = await chain.execute(async (url) => `from ${url}`);
        providers.add(result.provider);
      }

      // Without rotation, always picks first
      expect(providers.size).toBe(1);
    });

    it('should try remaining endpoints in tier when rotated pick fails', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY, { weight: 1 }),
        makeEndpoint('infura', RpcProviderRole.PRIMARY, { weight: 1000 }),
      ]);

      const privacy: PrivacyConfig = {
        rotateWithinTier: true,
        privacyMode: false,
        queryJitterMs: 0,
      };

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics,
        { ...defaultRetry, maxAttempts: 1 },
        privacy,
      );

      // infura will likely be selected first (high weight), but if it fails,
      // alchemy should still be tried within the same tier
      const result = await chain.execute(async (url) => {
        if (url.includes('infura')) throw new Error('infura down');
        return 'alchemy ok';
      });

      expect(result.value).toBe('alchemy ok');
      expect(result.provider).toBe('alchemy');
    });
  });

  describe('retry behavior', () => {
    it('should retry up to maxAttempts per endpoint', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ]);

      const retry: RetryConfig = {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 50,
      };

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, retry, defaultPrivacy,
      );

      let attemptCount = 0;
      const result = await chain.execute(async () => {
        attemptCount++;
        if (attemptCount < 3) throw new Error('transient');
        return 'success';
      });

      expect(result.value).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should NOT retry on 403 errors', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('drpc', RpcProviderRole.SECONDARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, defaultPrivacy,
      );

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

      expect(alchemyCalls).toBe(1);
      expect(result.provider).toBe('drpc');
    });

    it('should NOT retry on 401 errors', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('drpc', RpcProviderRole.SECONDARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, defaultPrivacy,
      );

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

    it('should use exponential backoff with baseDelayMs and maxDelayMs', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ]);

      const retry: RetryConfig = {
        maxAttempts: 3,
        baseDelayMs: 50,
        maxDelayMs: 200,
      };

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, retry, defaultPrivacy,
      );

      const timestamps: number[] = [];
      let attemptCount = 0;

      const result = await chain.execute(async () => {
        timestamps.push(Date.now());
        attemptCount++;
        if (attemptCount < 3) throw new Error('transient');
        return 'ok';
      });

      expect(result.value).toBe('ok');
      // There should be some delay between attempts
      if (timestamps.length >= 2) {
        const delay = timestamps[1] - timestamps[0];
        expect(delay).toBeGreaterThanOrEqual(30); // baseDelayMs with some tolerance
      }
    });
  });

  describe('cache fallback', () => {
    it('should return cached value when all endpoints fail', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics,
        { ...defaultRetry, maxAttempts: 1 },
        defaultPrivacy,
      );

      chain.setCachedValue('test-key', 'cached result');

      const result = await chain.executeWithCache(
        'test-key',
        async () => { throw new Error('all down'); }
      );

      expect(result.value).toBe('cached result');
      expect(result.fromCache).toBe(true);
    });

    it('should not use cache when endpoints succeed', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, defaultPrivacy,
      );

      chain.setCachedValue('test-key', 'stale');

      const result = await chain.executeWithCache(
        'test-key',
        async () => 'fresh',
      );

      expect(result.value).toBe('fresh');
      expect(result.fromCache).toBe(false);
    });

    it('should throw when no cache available and all fail', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics,
        { ...defaultRetry, maxAttempts: 1 },
        defaultPrivacy,
      );

      await expect(
        chain.executeWithCache('no-cache', async () => { throw new Error('fail'); })
      ).rejects.toThrow();
    });
  });

  describe('total timeout', () => {
    it('should enforce totalOperationTimeoutMs across all endpoints', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('drpc', RpcProviderRole.SECONDARY),
      ], { totalOperationTimeoutMs: 100 });

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics, defaultRetry, defaultPrivacy,
      );

      await expect(
        chain.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'too slow';
        })
      ).rejects.toThrow(/timeout/i);
    });
  });

  describe('metrics recording', () => {
    it('should record error metrics for failed endpoints', async () => {
      const chainConfig = makeChainConfig([
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('drpc', RpcProviderRole.SECONDARY),
      ]);

      const chain = new RpcFallbackChain(
        chainConfig, cbManager, rateLimiter, metrics,
        { ...defaultRetry, maxAttempts: 1 },
        defaultPrivacy,
      );

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
