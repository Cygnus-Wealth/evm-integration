import { describe, it, expect, beforeEach } from 'vitest';
import { RpcRateLimiter } from './RpcRateLimiter';

describe('RpcRateLimiter', () => {
  let limiter: RpcRateLimiter;

  beforeEach(() => {
    limiter = new RpcRateLimiter();
  });

  describe('getLimiter', () => {
    it('should create a limiter for an endpoint with given rps', () => {
      const rl = limiter.getLimiter('https://eth.alchemy.com', 25);
      expect(rl).toBeDefined();
    });

    it('should return the same limiter for the same endpoint', () => {
      const rl1 = limiter.getLimiter('https://eth.alchemy.com', 25);
      const rl2 = limiter.getLimiter('https://eth.alchemy.com', 25);
      expect(rl1).toBe(rl2);
    });

    it('should return different limiters for different endpoints', () => {
      const rl1 = limiter.getLimiter('https://eth.alchemy.com', 25);
      const rl2 = limiter.getLimiter('https://eth.drpc.org', 10);
      expect(rl1).not.toBe(rl2);
    });
  });

  describe('tryAcquire', () => {
    it('should allow requests within rate limit', () => {
      const rl = limiter.getLimiter('https://eth.alchemy.com', 10);
      // Should have capacity=10, so 10 immediate requests should be fine
      for (let i = 0; i < 10; i++) {
        expect(rl.tryAcquire()).toBe(true);
      }
    });

    it('should reject requests exceeding rate limit', () => {
      const rl = limiter.getLimiter('https://eth.alchemy.com', 5);
      // Exhaust all 5 tokens
      for (let i = 0; i < 5; i++) {
        rl.tryAcquire();
      }
      // 6th should fail
      expect(rl.tryAcquire()).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute function when rate limited', async () => {
      const rl = limiter.getLimiter('https://eth.alchemy.com', 10);
      const result = await rl.execute(async () => 'hello');
      expect(result).toBe('hello');
    });
  });

  describe('isAllowed', () => {
    it('should return true when tokens are available', () => {
      expect(limiter.isAllowed('https://eth.alchemy.com', 10)).toBe(true);
    });

    it('should return false when no tokens for unknown high-traffic endpoint', () => {
      // Create and exhaust
      const rl = limiter.getLimiter('https://eth.alchemy.com', 2);
      rl.tryAcquire();
      rl.tryAcquire();
      expect(limiter.isAllowed('https://eth.alchemy.com', 2)).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear all managed limiters', () => {
      limiter.getLimiter('https://a.com', 10);
      limiter.getLimiter('https://b.com', 10);
      limiter.reset();

      // After reset, isAllowed for uncreated limiter returns true (creates fresh)
      expect(limiter.isAllowed('https://a.com', 10)).toBe(true);
    });
  });
});
