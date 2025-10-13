import { describe, it, expect, beforeEach } from 'vitest';
import { BulkheadManager } from './BulkheadManager';
import { sleep } from '../test-utils';

describe('BulkheadManager', () => {
  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const bulkhead = new BulkheadManager();
      const stats = bulkhead.getStats();

      expect(stats.activeCount).toBe(0);
      expect(stats.queuedCount).toBe(0);
      expect(stats.totalExecuted).toBe(0);
      expect(stats.loadPercentage).toBe(0);
    });

    it('should accept partial config', () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 5,
        maxQueue: 10,
        queueTimeout: 1000,
        name: 'test-bulkhead',
      });

      expect(bulkhead).toBeDefined();
      expect(bulkhead.hasCapacity()).toBe(true);
    });

    it('should validate positive limits', () => {
      expect(() => new BulkheadManager({ maxConcurrent: 0 })).toThrow(
        'maxConcurrent must be positive'
      );

      expect(() => new BulkheadManager({ maxConcurrent: -1 })).toThrow(
        'maxConcurrent must be positive'
      );

      expect(() => new BulkheadManager({ maxQueue: -1 })).toThrow(
        'maxQueue must be non-negative'
      );
    });
  });

  describe('Execute', () => {
    let bulkhead: BulkheadManager;

    beforeEach(() => {
      bulkhead = new BulkheadManager({
        maxConcurrent: 2,
        maxQueue: 3,
        queueTimeout: 1000,
      });
    });

    it('should execute immediately when under limit', async () => {
      const result = await bulkhead.execute(async () => 'result');

      expect(result).toBe('result');
      const stats = bulkhead.getStats();
      expect(stats.totalExecuted).toBe(1);
    });

    it('should queue when at max concurrent', async () => {
      // Start 2 long-running operations (fills concurrent slots)
      const op1 = bulkhead.execute(async () => {
        await sleep(100);
        return 'op1';
      });

      const op2 = bulkhead.execute(async () => {
        await sleep(100);
        return 'op2';
      });

      // Third operation should be queued
      await sleep(10); // Let op1 and op2 start
      expect(bulkhead.getStats().activeCount).toBe(2);

      const op3 = bulkhead.execute(async () => 'op3');

      expect(bulkhead.getStats().queuedCount).toBe(1);

      await Promise.all([op1, op2, op3]);
      expect(bulkhead.getStats().totalExecuted).toBe(3);
    });

    it('should reject when queue is full', async () => {
      // Fill concurrent slots
      const longOps = [
        bulkhead.execute(async () => {
          await sleep(200);
          return '1';
        }),
        bulkhead.execute(async () => {
          await sleep(200);
          return '2';
        }),
      ];

      await sleep(10);

      // Fill queue
      const queuedOps = [
        bulkhead.execute(async () => '3'),
        bulkhead.execute(async () => '4'),
        bulkhead.execute(async () => '5'),
      ];

      await sleep(10);

      // Next should be rejected
      await expect(bulkhead.execute(async () => '6')).rejects.toThrow('queue is full');

      expect(bulkhead.getStats().totalRejected).toBe(1);

      await Promise.all([...longOps, ...queuedOps]);
    });

    it('should process queue as operations complete', async () => {
      const results: string[] = [];

      // Start 2 concurrent operations
      const op1 = bulkhead.execute(async () => {
        await sleep(50);
        results.push('op1');
        return 'op1';
      });

      const op2 = bulkhead.execute(async () => {
        await sleep(50);
        results.push('op2');
        return 'op2';
      });

      await sleep(10);

      // Queue 2 more
      const op3 = bulkhead.execute(async () => {
        results.push('op3');
        return 'op3';
      });

      const op4 = bulkhead.execute(async () => {
        results.push('op4');
        return 'op4';
      });

      await Promise.all([op1, op2, op3, op4]);

      expect(results).toHaveLength(4);
      expect(bulkhead.getStats().totalExecuted).toBe(4);
    });

    it('should timeout queued operations', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 2,
        queueTimeout: 100,
      });

      // Start long-running operation
      const longOp = bulkhead.execute(async () => {
        await sleep(300);
        return 'long';
      });

      await sleep(10);

      // Queue operation that will timeout
      const timeoutOp = bulkhead.execute(async () => 'queued');

      await expect(timeoutOp).rejects.toThrow('timed out in queue');
      expect(bulkhead.getStats().totalTimedOut).toBe(1);

      await longOp;
    });

    it('should update active count correctly', async () => {
      const op1 = bulkhead.execute(async () => {
        await sleep(50);
        return 'op1';
      });

      await sleep(10);
      expect(bulkhead.getStats().activeCount).toBe(1);

      await op1;
      expect(bulkhead.getStats().activeCount).toBe(0);
    });
  });

  describe('Capacity', () => {
    it('should report capacity when under limit', () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 2,
        maxQueue: 2,
      });

      expect(bulkhead.hasCapacity()).toBe(true);
    });

    it('should report no capacity when full', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 1,
      });

      // Fill concurrent
      const op1 = bulkhead.execute(async () => {
        await sleep(100);
        return '1';
      });

      await sleep(10);

      // Fill queue
      const op2 = bulkhead.execute(async () => '2');

      await sleep(10);

      expect(bulkhead.hasCapacity()).toBe(false);

      await Promise.all([op1, op2]);
    });

    it('should restore capacity after completion', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 1,
      });

      const op = bulkhead.execute(async () => {
        await sleep(50);
        return 'result';
      });

      await sleep(10);
      expect(bulkhead.hasCapacity()).toBe(true); // Queue still has space

      await op;
      expect(bulkhead.hasCapacity()).toBe(true);
    });
  });

  describe('Statistics', () => {
    let bulkhead: BulkheadManager;

    beforeEach(() => {
      bulkhead = new BulkheadManager({
        maxConcurrent: 2,
        maxQueue: 2,
      });
    });

    it('should track active count', async () => {
      const op = bulkhead.execute(async () => {
        await sleep(50);
        return 'result';
      });

      await sleep(10);
      expect(bulkhead.getStats().activeCount).toBe(1);

      await op;
      expect(bulkhead.getStats().activeCount).toBe(0);
    });

    it('should track queued count', async () => {
      // Fill concurrent slots
      const op1 = bulkhead.execute(async () => {
        await sleep(100);
        return '1';
      });
      const op2 = bulkhead.execute(async () => {
        await sleep(100);
        return '2';
      });

      await sleep(10);

      // Queue one
      const op3 = bulkhead.execute(async () => '3');

      await sleep(10);
      expect(bulkhead.getStats().queuedCount).toBe(1);

      await Promise.all([op1, op2, op3]);
      expect(bulkhead.getStats().queuedCount).toBe(0);
    });

    it('should track total executed', async () => {
      await bulkhead.execute(async () => '1');
      await bulkhead.execute(async () => '2');
      await bulkhead.execute(async () => '3');

      expect(bulkhead.getStats().totalExecuted).toBe(3);
    });

    it('should track total rejected', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 1,
      });

      // Fill slots
      const op1 = bulkhead.execute(async () => {
        await sleep(100);
        return '1';
      });

      await sleep(10);

      const op2 = bulkhead.execute(async () => '2');

      await sleep(10);

      // Should reject
      try {
        await bulkhead.execute(async () => '3');
      } catch (e) {
        // Expected
      }

      expect(bulkhead.getStats().totalRejected).toBe(1);

      await Promise.all([op1, op2]);
    });

    it('should track total timed out', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 2,
        queueTimeout: 50,
      });

      // Long operation
      const longOp = bulkhead.execute(async () => {
        await sleep(200);
        return 'long';
      });

      await sleep(10);

      // Will timeout
      const timeoutOp = bulkhead.execute(async () => 'timeout');

      try {
        await timeoutOp;
      } catch (e) {
        // Expected timeout
      }

      expect(bulkhead.getStats().totalTimedOut).toBe(1);

      await longOp;
    });

    it('should calculate load percentage', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 2,
        maxQueue: 2,
      });

      // Total capacity = 4 (2 concurrent + 2 queue)
      // 0 used = 0%
      expect(bulkhead.getStats().loadPercentage).toBe(0);

      // Start 1 operation = 25%
      const op1 = bulkhead.execute(async () => {
        await sleep(100);
        return '1';
      });

      await sleep(10);
      expect(bulkhead.getStats().loadPercentage).toBe(25);

      // Start another = 50%
      const op2 = bulkhead.execute(async () => {
        await sleep(100);
        return '2';
      });

      await sleep(10);
      expect(bulkhead.getStats().loadPercentage).toBe(50);

      // Queue one = 75%
      const op3 = bulkhead.execute(async () => '3');

      await sleep(10);
      expect(bulkhead.getStats().loadPercentage).toBe(75);

      await Promise.all([op1, op2, op3]);
    });
  });

  describe('Queue Management', () => {
    it('should clear queue', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 3,
      });

      // Fill concurrent
      const op1 = bulkhead.execute(async () => {
        await sleep(100);
        return '1';
      });

      await sleep(10);

      // Queue some operations
      const op2 = bulkhead.execute(async () => '2');
      const op3 = bulkhead.execute(async () => '3');

      await sleep(10);
      expect(bulkhead.getStats().queuedCount).toBe(2);

      bulkhead.clearQueue();

      expect(bulkhead.getStats().queuedCount).toBe(0);

      // Queued operations should be rejected
      await expect(op2).rejects.toThrow('queue cleared');
      await expect(op3).rejects.toThrow('queue cleared');

      await op1;
    });

    it('should cancel timeouts on clear', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 2,
        queueTimeout: 1000,
      });

      // Fill concurrent
      const op1 = bulkhead.execute(async () => {
        await sleep(100);
        return '1';
      });

      await sleep(10);

      // Queue operation
      const op2 = bulkhead.execute(async () => '2');

      await sleep(10);

      // Clear should cancel the timeout
      bulkhead.clearQueue();

      await expect(op2).rejects.toThrow('queue cleared');

      // totalTimedOut should still be 0 (cleared, not timed out)
      expect(bulkhead.getStats().totalTimedOut).toBe(0);

      await op1;
    });

    it('should reject cleared operations', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 1,
      });

      // Fill concurrent
      const op1 = bulkhead.execute(async () => {
        await sleep(50);
        return '1';
      });

      await sleep(10);

      // Queue operation
      const op2 = bulkhead.execute(async () => '2');

      await sleep(10);

      bulkhead.clearQueue();

      await expect(op2).rejects.toThrow();

      await op1;
    });

    it('should process FIFO', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 1,
        maxQueue: 3,
      });

      const executionOrder: string[] = [];

      // Fill concurrent
      const op1 = bulkhead.execute(async () => {
        await sleep(50);
        executionOrder.push('op1');
        return 'op1';
      });

      await sleep(10);

      // Queue operations
      const op2 = bulkhead.execute(async () => {
        executionOrder.push('op2');
        return 'op2';
      });

      const op3 = bulkhead.execute(async () => {
        executionOrder.push('op3');
        return 'op3';
      });

      const op4 = bulkhead.execute(async () => {
        executionOrder.push('op4');
        return 'op4';
      });

      await Promise.all([op1, op2, op3, op4]);

      // Should execute in FIFO order
      expect(executionOrder).toEqual(['op1', 'op2', 'op3', 'op4']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid sequential operations', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 5,
        maxQueue: 10,
      });

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          bulkhead.execute(async () => `result-${i}`)
        )
      );

      expect(results).toHaveLength(10);
      expect(bulkhead.getStats().totalExecuted).toBe(10);
    });

    it('should handle operation errors', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 2,
        maxQueue: 2,
      });

      const errorOp = bulkhead.execute(async () => {
        throw new Error('operation failed');
      });

      await expect(errorOp).rejects.toThrow('operation failed');

      // Should still be able to execute more operations
      const successOp = await bulkhead.execute(async () => 'success');
      expect(successOp).toBe('success');
    });

    it('should handle concurrent execute calls', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 3,
        maxQueue: 5,
      });

      const operations = Array.from({ length: 8 }, (_, i) =>
        bulkhead.execute(async () => {
          await sleep(20);
          return `op-${i}`;
        })
      );

      const results = await Promise.all(operations);

      expect(results).toHaveLength(8);
      expect(bulkhead.getStats().totalExecuted).toBe(8);
    });
  });
});
