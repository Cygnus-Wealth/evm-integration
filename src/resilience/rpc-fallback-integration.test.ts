import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcFallbackChain, RpcEndpoint, RpcFallbackConfig } from './RpcFallbackChain.js';

describe('RPC Fallback Chain Integration', () => {
  const endpoints: RpcEndpoint[] = [
    { url: 'https://primary.rpc.com', priority: 1 },
    { url: 'https://secondary.rpc.com', priority: 2 },
    { url: 'https://tertiary.rpc.com', priority: 3 },
  ];

  describe('primary failure -> secondary success', () => {
    it('should successfully return data when primary fails but secondary succeeds', async () => {
      const chain = new RpcFallbackChain(1, endpoints);
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED: primary'))
        .mockResolvedValueOnce({ balance: '1000000000000000000' });

      const result = await chain.execute(operation);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ balance: '1000000000000000000' });
      expect(result.endpointUrl).toBe('https://secondary.rpc.com');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('primary');
    });

    it('should transparently recover without caller awareness of failover', async () => {
      const chain = new RpcFallbackChain(1, endpoints);

      // Simulate intermittent primary failure
      let callCount = 0;
      const operation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 1) {
          return Promise.reject(new Error('Rate limited'));
        }
        return Promise.resolve('success');
      });

      const result = await chain.execute(operation);
      expect(result.success).toBe(true);
      expect(result.value).toBe('success');
    });
  });

  describe('all-fail -> cached value', () => {
    it('should return cached value when all endpoints fail and cache is available', async () => {
      const chain = new RpcFallbackChain(1, endpoints, {
        enableCachedFallback: true,
      });

      // First successful call populates cache
      const successOp = vi.fn().mockResolvedValue({ balance: '500' });
      await chain.execute(successOp);

      // All endpoints fail
      const failOp = vi.fn().mockRejectedValue(new Error('All down'));
      const result = await chain.execute(failOp);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ balance: '500' });
      expect(result.fromCache).toBe(true);
    });

    it('should throw when all fail and no cache available', async () => {
      const chain = new RpcFallbackChain(1, endpoints, {
        enableCachedFallback: true,
      });

      const failOp = vi.fn().mockRejectedValue(new Error('All down'));

      await expect(chain.execute(failOp)).rejects.toThrow(
        /All RPC endpoints failed/
      );
    });
  });

  describe('circuit breaker opening', () => {
    it('should open circuit after repeated failures on an endpoint', async () => {
      const config: RpcFallbackConfig = {
        circuitBreakerEnabled: true,
        failureThreshold: 2,
        circuitTimeout: 60000,
      };
      const chain = new RpcFallbackChain(1, endpoints, config);

      const failOp = vi.fn().mockRejectedValue(new Error('timeout'));

      // Exhaust all endpoints multiple times to accumulate failures
      for (let i = 0; i < 3; i++) {
        try { await chain.execute(failOp); } catch { /* expected */ }
      }

      const stats = chain.getEndpointStats();
      const primary = stats.find(s => s.url === 'https://primary.rpc.com');

      expect(primary!.circuitState).toBe('OPEN');
    });

    it('should skip endpoints with open circuit breakers', async () => {
      const config: RpcFallbackConfig = {
        circuitBreakerEnabled: true,
        failureThreshold: 2,
        circuitTimeout: 60000,
      };
      const chain = new RpcFallbackChain(1, endpoints, config);

      // Trip only primary's circuit breaker: fail on first attempt (primary),
      // succeed on second (secondary) so only primary accumulates failures
      for (let i = 0; i < 3; i++) {
        const op = vi.fn()
          .mockRejectedValueOnce(new Error('primary timeout'))
          .mockResolvedValueOnce('ok');
        await chain.execute(op);
      }

      // Primary should now be open
      const stats = chain.getEndpointStats();
      expect(stats.find(s => s.url === 'https://primary.rpc.com')!.circuitState).toBe('OPEN');

      // Next call should skip primary and go to secondary
      const successOp = vi.fn().mockResolvedValue('recovered');
      const result = await chain.execute(successOp);

      expect(result.success).toBe(true);
      expect(result.endpointUrl).toBe('https://secondary.rpc.com');
    });

    it('should attempt half-open after circuit timeout', async () => {
      vi.useFakeTimers();
      try {
        const config: RpcFallbackConfig = {
          circuitBreakerEnabled: true,
          failureThreshold: 2,
          circuitTimeout: 5000,
        };
        const chain = new RpcFallbackChain(1, endpoints, config);

        // Trip circuit breaker
        const failOp = vi.fn().mockRejectedValue(new Error('down'));
        for (let i = 0; i < 3; i++) {
          try { await chain.execute(failOp); } catch { /* expected */ }
        }

        // Verify primary is open
        let stats = chain.getEndpointStats();
        expect(stats.find(s => s.url === 'https://primary.rpc.com')!.circuitState).toBe('OPEN');

        // Advance past circuit timeout
        vi.advanceTimersByTime(6000);

        // Next call should attempt primary again (half-open)
        const successOp = vi.fn().mockResolvedValue('back up');
        const result = await chain.execute(successOp);

        expect(result.success).toBe(true);
        // Primary should be attempted again (half-open -> closed on success)
        expect(result.endpointUrl).toBe('https://primary.rpc.com');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('performance tracking', () => {
    it('should track response times per endpoint', async () => {
      const chain = new RpcFallbackChain(1, endpoints);

      const operation = vi.fn().mockResolvedValue('ok');
      await chain.execute(operation);

      const stats = chain.getEndpointStats();
      const primary = stats.find(s => s.url === 'https://primary.rpc.com');
      expect(primary!.avgResponseTime).toBeGreaterThanOrEqual(0);
    });
  });
});
