/**
 * Unit tests for RateLimiter
 *
 * @module security/RateLimiter.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from './RateLimiter';
import { RateLimitError } from '../utils/errors';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should use default configuration', () => {
      limiter = new RateLimiter();

      expect(limiter.getAvailableTokens()).toBe(10); // Default capacity
    });

    it('should accept custom configuration', () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 2 });

      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it('should merge partial config with defaults', () => {
      limiter = new RateLimiter({ capacity: 20 });

      expect(limiter.getAvailableTokens()).toBe(20);
    });
  });

  describe('tryAcquire', () => {
    it('should acquire token when available', () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 1 });

      const result = limiter.tryAcquire();

      expect(result).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(4);
    });

    it('should fail when no tokens available', () => {
      limiter = new RateLimiter({ capacity: 1, refillRate: 1 });

      limiter.tryAcquire(); // Consume the only token
      const result = limiter.tryAcquire();

      expect(result).toBe(false);
      expect(limiter.getAvailableTokens()).toBe(0);
    });

    it('should not wait for tokens', () => {
      limiter = new RateLimiter({ capacity: 0, refillRate: 1 });

      const result = limiter.tryAcquire();

      expect(result).toBe(false);
    });

    it('should work multiple times', () => {
      limiter = new RateLimiter({ capacity: 3, refillRate: 1 });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });
  });

  describe('acquire', () => {
    it('should acquire token immediately when available', async () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 1 });

      await limiter.acquire();

      expect(limiter.getAvailableTokens()).toBe(4);
    });

    it('should consume multiple tokens', async () => {
      limiter = new RateLimiter({ capacity: 3, refillRate: 1 });

      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.getAvailableTokens()).toBe(0);
    });

    it('should wait for token refill', async () => {
      limiter = new RateLimiter({ capacity: 1, refillRate: 10 }); // 10 tokens/sec = 1 per 100ms

      await limiter.acquire(); // Consume the token

      const acquirePromise = limiter.acquire();

      // Advance time by 100ms to refill 1 token
      await vi.advanceTimersByTimeAsync(150);

      await expect(acquirePromise).resolves.toBeUndefined();
    });

    it('should throw RateLimitError when max wait exceeded', async () => {
      limiter = new RateLimiter({
        capacity: 1,
        refillRate: 0.1, // Very slow refill: 0.1 tokens/sec
        maxWait: 500,
      });

      await limiter.acquire(); // Consume the token

      // Attach rejection handler BEFORE advancing time
      const acquirePromise = limiter.acquire().catch((error) => {
        throw error; // Re-throw for expect to catch
      });

      // Advance past maxWait
      await vi.advanceTimersByTimeAsync(600);

      await expect(acquirePromise).rejects.toThrow(RateLimitError);
      await expect(acquirePromise).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle multiple waiting requests', async () => {
      limiter = new RateLimiter({ capacity: 1, refillRate: 5 }); // 5 tokens/sec

      await limiter.acquire(); // Consume initial token

      const promise1 = limiter.acquire();
      const promise2 = limiter.acquire();
      const promise3 = limiter.acquire();

      // Advance time to refill tokens
      await vi.advanceTimersByTimeAsync(800); // Should refill 4 tokens

      await expect(Promise.all([promise1, promise2, promise3])).resolves.toBeDefined();
    });
  });

  describe('getAvailableTokens', () => {
    it('should return initial capacity', () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 1 });

      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('should decrease after acquisition', () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 1 });

      limiter.tryAcquire();

      expect(limiter.getAvailableTokens()).toBe(4);
    });

    it('should increase after time passes', async () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 2 }); // 2 tokens/sec

      limiter.tryAcquire();
      limiter.tryAcquire();
      limiter.tryAcquire();

      expect(limiter.getAvailableTokens()).toBe(7);

      // Advance 1 second
      await vi.advanceTimersByTimeAsync(1000);

      expect(limiter.getAvailableTokens()).toBe(9); // 7 + 2
    });

    it('should not exceed capacity', async () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 10 });

      // Advance time significantly
      await vi.advanceTimersByTimeAsync(10000);

      expect(limiter.getAvailableTokens()).toBe(5); // Capped at capacity
    });

    it('should return floor of token count', async () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 3 }); // 3 tokens/sec

      limiter.tryAcquire();
      limiter.tryAcquire();

      // Advance 333ms = 0.333 seconds = ~1 token
      await vi.advanceTimersByTimeAsync(333);

      const tokens = limiter.getAvailableTokens();
      expect(tokens).toBeGreaterThanOrEqual(8);
      expect(tokens).toBeLessThanOrEqual(9);
    });
  });

  describe('execute', () => {
    it('should execute function with rate limiting', async () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 1 });

      const fn = vi.fn(async () => 'result');

      const result = await limiter.execute(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(limiter.getAvailableTokens()).toBe(4);
    });

    it('should wait for token before executing', async () => {
      limiter = new RateLimiter({ capacity: 1, refillRate: 5 });

      await limiter.acquire(); // Consume token

      const fn = vi.fn(async () => 'result');
      const executePromise = limiter.execute(fn);

      // Advance time to refill
      await vi.advanceTimersByTimeAsync(250);

      const result = await executePromise;

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should propagate function result', async () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 1 });

      const result = await limiter.execute(async () => ({ data: 'value' }));

      expect(result).toEqual({ data: 'value' });
    });

    it('should propagate function error', async () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 1 });

      const fn = async () => {
        throw new Error('Test error');
      };

      await expect(limiter.execute(fn)).rejects.toThrow('Test error');
    });

    it('should throw RateLimitError if max wait exceeded', async () => {
      limiter = new RateLimiter({
        capacity: 1,
        refillRate: 0.1,
        maxWait: 500,
      });

      await limiter.acquire(); // Consume token

      const fn = async () => 'result';
      // Attach rejection handler BEFORE advancing time
      const executePromise = limiter.execute(fn).catch((error) => {
        throw error; // Re-throw for expect to catch
      });

      // Advance past maxWait
      await vi.advanceTimersByTimeAsync(600);

      await expect(executePromise).rejects.toThrow(RateLimitError);
    });
  });

  describe('Token Refill', () => {
    it('should refill at configured rate', async () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 5 }); // 5 tokens/sec

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      expect(limiter.getAvailableTokens()).toBe(0);

      // Advance 1 second
      await vi.advanceTimersByTimeAsync(1000);

      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it('should refill gradually', async () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 10 }); // 10 tokens/sec

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      // Advance 500ms = 5 tokens
      await vi.advanceTimersByTimeAsync(500);
      expect(limiter.getAvailableTokens()).toBe(5);

      // Advance another 500ms = 5 more tokens (capped at capacity)
      await vi.advanceTimersByTimeAsync(500);
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('should refill fractional tokens', async () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 3 }); // 3 tokens/sec

      limiter.tryAcquire();
      limiter.tryAcquire();

      // Advance 666ms = 0.666 seconds = ~2 tokens
      await vi.advanceTimersByTimeAsync(666);

      const tokens = limiter.getAvailableTokens();
      expect(tokens).toBeGreaterThanOrEqual(9);
      expect(tokens).toBeLessThanOrEqual(10);
    });
  });

  describe('Configuration', () => {
    it('should use custom name', () => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 1, name: 'test-limiter' });

      // Name is used in error messages
      expect(() => limiter).not.toThrow();
    });

    it('should use custom max wait', async () => {
      limiter = new RateLimiter({
        capacity: 1,
        refillRate: 0.1,
        maxWait: 1000,
      });

      await limiter.acquire();

      // Attach rejection handler BEFORE advancing time
      const acquirePromise = limiter.acquire().catch((error) => {
        throw error; // Re-throw for expect to catch
      });

      await vi.advanceTimersByTimeAsync(1100);

      await expect(acquirePromise).rejects.toThrow('no tokens available within 1000ms');
    });

    it('should handle zero initial capacity', async () => {
      limiter = new RateLimiter({ capacity: 0, refillRate: 1 });

      expect(limiter.getAvailableTokens()).toBe(0);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should handle high refill rates', async () => {
      limiter = new RateLimiter({ capacity: 100, refillRate: 100 }); // 100 tokens/sec

      // Consume many tokens
      for (let i = 0; i < 50; i++) {
        limiter.tryAcquire();
      }

      expect(limiter.getAvailableTokens()).toBe(50);

      // Advance 500ms = 50 tokens
      await vi.advanceTimersByTimeAsync(500);

      expect(limiter.getAvailableTokens()).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid consecutive acquisitions', () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 1 });

      for (let i = 0; i < 5; i++) {
        expect(limiter.tryAcquire()).toBe(true);
      }

      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it('should handle mixed acquire and tryAcquire', async () => {
      limiter = new RateLimiter({ capacity: 3, refillRate: 2 });

      expect(limiter.tryAcquire()).toBe(true);
      await limiter.acquire();
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);

      expect(limiter.getAvailableTokens()).toBe(0);
    });

    it('should handle very small refill rates', async () => {
      limiter = new RateLimiter({ capacity: 1, refillRate: 0.01 }); // 1 token per 100 seconds

      await limiter.acquire();

      expect(limiter.getAvailableTokens()).toBe(0);

      // Advance 50 seconds = 0.5 tokens (not enough for acquisition)
      await vi.advanceTimersByTimeAsync(50000);

      expect(limiter.tryAcquire()).toBe(false);

      // Advance another 50 seconds = 1 token total
      await vi.advanceTimersByTimeAsync(50000);

      expect(limiter.tryAcquire()).toBe(true);
    });
  });
});
