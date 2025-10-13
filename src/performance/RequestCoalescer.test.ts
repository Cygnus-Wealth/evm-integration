import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RequestCoalescer } from './RequestCoalescer';
import { sleep } from '../test-utils';

describe('RequestCoalescer', () => {
  let coalescer: RequestCoalescer;

  beforeEach(() => {
    coalescer = new RequestCoalescer();
  });

  afterEach(() => {
    coalescer.destroy();
  });

  describe('Execute', () => {
    it('should execute unique requests', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return 'result';
      };

      const result = await coalescer.execute('key1', fn);
      expect(result).toBe('result');
      expect(callCount).toBe(1);
    });

    it('should coalesce concurrent identical requests', async () => {
      let callCount = 0;
      const fn = async () => {
        await sleep(50);
        callCount++;
        return 'result';
      };

      // Start multiple concurrent requests with same key
      const promises = [
        coalescer.execute('key1', fn),
        coalescer.execute('key1', fn),
        coalescer.execute('key1', fn),
      ];

      const results = await Promise.all(promises);

      // All should get same result
      expect(results).toEqual(['result', 'result', 'result']);

      // But function should only execute once
      expect(callCount).toBe(1);
    });

    it('should handle different keys separately', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return 'result';
      };

      await Promise.all([
        coalescer.execute('key1', fn),
        coalescer.execute('key2', fn),
        coalescer.execute('key3', fn),
      ]);

      expect(callCount).toBe(3);
    });

    it('should allow sequential requests with same key', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return 'result';
      };

      await coalescer.execute('key1', fn);
      await coalescer.execute('key1', fn);

      expect(callCount).toBe(2);
    });

    it('should propagate errors to all coalesced requests', async () => {
      const fn = async () => {
        await sleep(20);
        throw new Error('Test error');
      };

      const promises = [
        coalescer.execute('key1', fn),
        coalescer.execute('key1', fn),
      ];

      await expect(Promise.all(promises)).rejects.toThrow('Test error');
    });

    it('should clean up after successful execution', async () => {
      const fn = async () => 'result';

      await coalescer.execute('key1', fn);

      expect(coalescer.isPending('key1')).toBe(false);
    });

    it('should clean up after failed execution', async () => {
      const fn = async () => {
        throw new Error('Test error');
      };

      await expect(coalescer.execute('key1', fn)).rejects.toThrow();

      expect(coalescer.isPending('key1')).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track total requests', async () => {
      const fn = async () => 'result';

      await coalescer.execute('key1', fn);
      await coalescer.execute('key2', fn);

      const stats = coalescer.getStats();
      expect(stats.totalRequests).toBe(2);
    });

    it('should track coalesced requests', async () => {
      const fn = async () => {
        await sleep(50);
        return 'result';
      };

      const promises = [
        coalescer.execute('key1', fn),
        coalescer.execute('key1', fn),
        coalescer.execute('key1', fn),
      ];

      await Promise.all(promises);

      const stats = coalescer.getStats();
      expect(stats.coalescedRequests).toBe(2); // First is unique, next 2 are coalesced
    });

    it('should track unique requests', async () => {
      const fn = async () => {
        await sleep(20);
        return 'result';
      };

      await Promise.all([
        coalescer.execute('key1', fn),
        coalescer.execute('key1', fn),
        coalescer.execute('key2', fn),
      ]);

      const stats = coalescer.getStats();
      expect(stats.uniqueRequests).toBe(2); // key1 and key2
    });

    it('should calculate coalesce rate', async () => {
      const fn = async () => {
        await sleep(20);
        return 'result';
      };

      // Total: 4 requests
      // Unique: 2 requests (key1, key2)
      // Coalesced: 2 requests (extra key1, extra key2)
      // Rate: 2/4 = 0.5
      await Promise.all([
        coalescer.execute('key1', fn),
        coalescer.execute('key1', fn),
        coalescer.execute('key2', fn),
        coalescer.execute('key2', fn),
      ]);

      const stats = coalescer.getStats();
      expect(stats.coalesceRate).toBe(0.5);
    });

    it('should track active requests', async () => {
      const fn = async () => {
        await sleep(50);
        return 'result';
      };

      // Start request but don't wait
      const promise = coalescer.execute('key1', fn);

      expect(coalescer.getStats().activeRequests).toBe(1);

      await promise;

      expect(coalescer.getStats().activeRequests).toBe(0);
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys', () => {
      const key1 = RequestCoalescer.generateKey('getBalance', 1, '0x123');
      const key2 = RequestCoalescer.generateKey('getBalance', 1, '0x123');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different params', () => {
      const key1 = RequestCoalescer.generateKey('getBalance', 1, '0x123');
      const key2 = RequestCoalescer.generateKey('getBalance', 1, '0x456');
      expect(key1).not.toBe(key2);
    });

    it('should handle params object', () => {
      const key = RequestCoalescer.generateKey(
        'getTransactions',
        1,
        '0x123',
        { from: 0, to: 100 }
      );
      expect(key).toContain('getTransactions');
      expect(key).toContain('1');
      expect(key).toContain('0x123');
    });

    it('should handle missing address', () => {
      const key = RequestCoalescer.generateKey('getBlock', 1);
      expect(key).toBe('getBlock:1');
    });

    it('should serialize params consistently', () => {
      const key1 = RequestCoalescer.generateKey('method', 1, undefined, { a: 1, b: 2 });
      const key2 = RequestCoalescer.generateKey('method', 1, undefined, { a: 1, b: 2 });
      expect(key1).toBe(key2);
    });
  });

  describe('IsPending', () => {
    it('should return false for non-pending key', () => {
      expect(coalescer.isPending('key1')).toBe(false);
    });

    it('should return true for pending key', async () => {
      const fn = async () => {
        await sleep(50);
        return 'result';
      };

      const promise = coalescer.execute('key1', fn);

      expect(coalescer.isPending('key1')).toBe(true);

      await promise;
    });

    it('should return false after completion', async () => {
      const fn = async () => 'result';

      await coalescer.execute('key1', fn);

      expect(coalescer.isPending('key1')).toBe(false);
    });
  });

  describe('Clear', () => {
    it('should clear all pending requests', () => {
      coalescer.clear();
      expect(coalescer.getStats().activeRequests).toBe(0);
    });

    it('should reset active request count', async () => {
      const fn = async () => {
        await sleep(50);
        return 'result';
      };

      // Start but don't wait
      coalescer.execute('key1', fn);
      coalescer.execute('key2', fn);

      expect(coalescer.getStats().activeRequests).toBeGreaterThan(0);

      coalescer.clear();

      expect(coalescer.getStats().activeRequests).toBe(0);
    });
  });

  describe('Destroy', () => {
    it('should clean up resources', () => {
      coalescer.destroy();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should clear pending requests', async () => {
      const fn = async () => {
        await sleep(50);
        return 'result';
      };

      coalescer.execute('key1', fn);

      coalescer.destroy();

      expect(coalescer.getStats().activeRequests).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid sequential requests', async () => {
      const fn = async () => 'result';

      for (let i = 0; i < 100; i++) {
        await coalescer.execute(`key${i}`, fn);
      }

      const stats = coalescer.getStats();
      expect(stats.uniqueRequests).toBe(100);
      expect(stats.coalescedRequests).toBe(0);
    });

    it('should handle subscriber counting', async () => {
      let subscriberCount = 0;
      const fn = async () => {
        await sleep(20);
        return 'result';
      };

      // Create 5 concurrent requests
      const promises = Array(5).fill(null).map(() =>
        coalescer.execute('key1', fn)
      );

      await Promise.all(promises);

      const stats = coalescer.getStats();
      expect(stats.totalRequests).toBe(5);
      expect(stats.uniqueRequests).toBe(1);
      expect(stats.coalescedRequests).toBe(4);
    });
  });
});
