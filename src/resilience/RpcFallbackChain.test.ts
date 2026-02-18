import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcFallbackChain, RpcEndpoint } from './RpcFallbackChain.js';
import { CircuitBreaker } from './CircuitBreaker.js';

describe('RpcFallbackChain', () => {
  const endpoints: RpcEndpoint[] = [
    { url: 'https://primary.rpc.example.com', priority: 1 },
    { url: 'https://secondary.rpc.example.com', priority: 2 },
    { url: 'https://tertiary.rpc.example.com', priority: 3 },
  ];

  let fallbackChain: RpcFallbackChain;

  beforeEach(() => {
    fallbackChain = new RpcFallbackChain(1, endpoints);
  });

  describe('constructor', () => {
    it('should create with valid endpoints', () => {
      expect(fallbackChain).toBeDefined();
      expect(fallbackChain.getChainId()).toBe(1);
    });

    it('should throw if no endpoints provided', () => {
      expect(() => new RpcFallbackChain(1, [])).toThrow();
    });

    it('should sort endpoints by priority', () => {
      const reversed: RpcEndpoint[] = [
        { url: 'https://low-priority.rpc.com', priority: 3 },
        { url: 'https://high-priority.rpc.com', priority: 1 },
      ];
      const chain = new RpcFallbackChain(1, reversed);
      const names = chain.getEndpointUrls();
      expect(names[0]).toBe('https://high-priority.rpc.com');
    });
  });

  describe('execute', () => {
    it('should execute RPC call through primary endpoint', async () => {
      const operation = vi.fn().mockResolvedValue('0x1234');

      const result = await fallbackChain.execute(operation);

      expect(result.success).toBe(true);
      expect(result.value).toBe('0x1234');
      expect(result.endpointUrl).toBe('https://primary.rpc.example.com');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should fall back to secondary when primary fails', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Primary down'))
        .mockResolvedValueOnce('0xabcd');

      const result = await fallbackChain.execute(operation);

      expect(result.success).toBe(true);
      expect(result.value).toBe('0xabcd');
      expect(result.endpointUrl).toBe('https://secondary.rpc.example.com');
      expect(result.errors.length).toBe(1);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should fall back through all endpoints', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Primary down'))
        .mockRejectedValueOnce(new Error('Secondary down'))
        .mockResolvedValueOnce('0xfinal');

      const result = await fallbackChain.execute(operation);

      expect(result.success).toBe(true);
      expect(result.value).toBe('0xfinal');
      expect(result.endpointUrl).toBe('https://tertiary.rpc.example.com');
      expect(result.errors.length).toBe(2);
    });

    it('should throw when all endpoints fail', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('All down'));

      await expect(fallbackChain.execute(operation)).rejects.toThrow(
        /All RPC endpoints failed for chain 1/
      );
    });
  });

  describe('circuit breaker integration', () => {
    it('should open circuit breaker after repeated failures on an endpoint', async () => {
      const chain = new RpcFallbackChain(1, endpoints, {
        circuitBreakerEnabled: true,
        failureThreshold: 3,
        circuitTimeout: 30000,
      });

      const operation = vi.fn()
        .mockRejectedValue(new Error('Connection refused'));

      // Make enough calls to trigger circuit breaker on primary
      // Each call fails on all endpoints, but primary accumulates failures
      for (let i = 0; i < 3; i++) {
        try {
          await chain.execute(operation);
        } catch {
          // expected
        }
      }

      const stats = chain.getEndpointStats();
      const primaryStats = stats.find(s => s.url === 'https://primary.rpc.example.com');
      expect(primaryStats).toBeDefined();
      expect(primaryStats!.failures).toBeGreaterThanOrEqual(3);
      expect(primaryStats!.circuitState).toBe('OPEN');
    });

    it('should skip open circuit breaker endpoints', async () => {
      const chain = new RpcFallbackChain(1, endpoints, {
        circuitBreakerEnabled: true,
        failureThreshold: 2,
        circuitTimeout: 60000,
      });

      // Trip only primary's circuit breaker by having the operation
      // fail on first call (primary) but succeed on second (secondary).
      // This gives primary failures and secondary successes.
      for (let i = 0; i < 3; i++) {
        const op = vi.fn()
          .mockRejectedValueOnce(new Error('primary fail'))
          .mockResolvedValueOnce('ok');
        await chain.execute(op);
      }

      // Primary should now be open (3 failures, threshold=2)
      const stats = chain.getEndpointStats();
      const primary = stats.find(s => s.url === 'https://primary.rpc.example.com');
      expect(primary!.circuitState).toBe('OPEN');

      // Now calls should skip primary and go to secondary directly
      const successOp = vi.fn().mockResolvedValue('result');
      const result = await chain.execute(successOp);

      expect(result.success).toBe(true);
      expect(result.endpointUrl).not.toBe('https://primary.rpc.example.com');
    });
  });

  describe('endpoint stats', () => {
    it('should track success count per endpoint', async () => {
      const operation = vi.fn().mockResolvedValue('ok');

      await fallbackChain.execute(operation);
      await fallbackChain.execute(operation);

      const stats = fallbackChain.getEndpointStats();
      const primary = stats.find(s => s.url === 'https://primary.rpc.example.com');
      expect(primary!.successes).toBe(2);
      expect(primary!.failures).toBe(0);
    });

    it('should track failure count per endpoint', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');

      await fallbackChain.execute(operation);

      const stats = fallbackChain.getEndpointStats();
      const primary = stats.find(s => s.url === 'https://primary.rpc.example.com');
      expect(primary!.failures).toBe(1);

      const secondary = stats.find(s => s.url === 'https://secondary.rpc.example.com');
      expect(secondary!.successes).toBe(1);
    });
  });
});
