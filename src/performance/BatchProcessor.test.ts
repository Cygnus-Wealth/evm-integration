import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BatchProcessor } from './BatchProcessor';
import { sleep } from '../test-utils';

describe('BatchProcessor', () => {
  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const processor = vi.fn().mockResolvedValue([]);
      const batch = new BatchProcessor(processor);

      const stats = batch.getStats();
      expect(stats.totalBatches).toBe(0);
      expect(stats.totalRequests).toBe(0);

      batch.destroy();
    });

    it('should accept custom config', () => {
      const processor = vi.fn().mockResolvedValue([]);
      const batch = new BatchProcessor(processor, {
        windowMs: 100,
        maxSize: 25,
        autoFlush: false,
        name: 'test-batch',
      });

      expect(batch).toBeDefined();
      batch.destroy();
    });
  });

  describe('Add and Batching', () => {
    it('should batch requests within time window', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r * 2);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 50,
        maxSize: 10,
        autoFlush: true,
      });

      // Add requests rapidly
      const promise1 = batch.add(1);
      const promise2 = batch.add(2);
      const promise3 = batch.add(3);

      const results = await Promise.all([promise1, promise2, promise3]);

      expect(results).toEqual([2, 4, 6]);
      expect(processor).toHaveBeenCalledTimes(1);
      expect(processor).toHaveBeenCalledWith([1, 2, 3]);

      batch.destroy();
    });

    it('should flush on max size', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r * 2);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 1000, // Long window
        maxSize: 3,
        autoFlush: true,
      });

      // Add exactly max size
      const promises = [
        batch.add(1),
        batch.add(2),
        batch.add(3),
      ];

      await Promise.all(promises);

      // Should flush immediately without waiting for timer
      expect(processor).toHaveBeenCalledTimes(1);

      batch.destroy();
    });

    it('should handle multiple batches', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r * 2);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 20,
        maxSize: 2,
        autoFlush: true,
      });

      // First batch
      await Promise.all([batch.add(1), batch.add(2)]);

      // Wait for window
      await sleep(30);

      // Second batch
      await Promise.all([batch.add(3), batch.add(4)]);

      expect(processor).toHaveBeenCalledTimes(2);
      expect(processor).toHaveBeenNthCalledWith(1, [1, 2]);
      expect(processor).toHaveBeenNthCalledWith(2, [3, 4]);

      batch.destroy();
    });

    it('should auto-flush on window timeout', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r * 2);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 50,
        maxSize: 10,
        autoFlush: true,
      });

      batch.add(1);
      batch.add(2);

      // Wait for window to expire
      await sleep(70);

      expect(processor).toHaveBeenCalledTimes(1);

      batch.destroy();
    });

    it('should not auto-flush when disabled', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r * 2);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 50,
        maxSize: 10,
        autoFlush: false,
      });

      batch.add(1);
      batch.add(2);

      await sleep(70);

      // Should not have flushed automatically
      expect(processor).not.toHaveBeenCalled();

      // Manual flush
      await batch.flush();
      expect(processor).toHaveBeenCalledTimes(1);

      batch.destroy();
    });
  });

  describe('Manual Flush', () => {
    it('should manually flush pending requests', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r * 2);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 1000,
        maxSize: 10,
        autoFlush: false,
      });

      batch.add(1);
      batch.add(2);

      const count = await batch.flush();

      expect(count).toBe(2);
      expect(processor).toHaveBeenCalledWith([1, 2]);

      batch.destroy();
    });

    it('should return 0 for empty flush', async () => {
      const processor = vi.fn().mockResolvedValue([]);
      const batch = new BatchProcessor(processor);

      const count = await batch.flush();

      expect(count).toBe(0);
      expect(processor).not.toHaveBeenCalled();

      batch.destroy();
    });

    it('should cancel timer on manual flush', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 100,
        maxSize: 10,
        autoFlush: true,
      });

      batch.add(1);
      await batch.flush();

      // Wait longer than window
      await sleep(150);

      // Should only have been called once (manual flush)
      expect(processor).toHaveBeenCalledTimes(1);

      batch.destroy();
    });
  });

  describe('Error Handling', () => {
    it('should reject all requests on processor error', async () => {
      const processor = vi.fn().mockRejectedValue(new Error('Processor failed'));

      const batch = new BatchProcessor(processor, {
        windowMs: 50,
        maxSize: 10,
        autoFlush: true,
      });

      const promises = [batch.add(1), batch.add(2), batch.add(3)];

      await expect(Promise.all(promises)).rejects.toThrow('Processor failed');

      batch.destroy();
    });

    it('should throw on result count mismatch', async () => {
      const processor = vi.fn().mockResolvedValue([1]); // Only 1 result for 3 requests

      const batch = new BatchProcessor(processor, {
        windowMs: 50,
        maxSize: 10,
        autoFlush: true,
      });

      const promises = [batch.add(1), batch.add(2), batch.add(3)];

      await expect(Promise.all(promises)).rejects.toThrow(
        'Batch processor returned 1 results but expected 3'
      );

      batch.destroy();
    });

    it('should handle empty batch', async () => {
      const processor = vi.fn().mockResolvedValue([]);
      const batch = new BatchProcessor(processor);

      await batch.flush();

      expect(processor).not.toHaveBeenCalled();

      batch.destroy();
    });
  });

  describe('Statistics', () => {
    it('should track total batches', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 20,
        maxSize: 2,
        autoFlush: true,
      });

      await Promise.all([batch.add(1), batch.add(2)]);
      await sleep(30);
      await Promise.all([batch.add(3), batch.add(4)]);

      const stats = batch.getStats();
      expect(stats.totalBatches).toBe(2);

      batch.destroy();
    });

    it('should track total requests', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 50,
        maxSize: 10,
        autoFlush: true,
      });

      const promises = [batch.add(1), batch.add(2), batch.add(3), batch.add(4)];
      await Promise.all(promises);

      const stats = batch.getStats();
      expect(stats.totalRequests).toBe(4);

      batch.destroy();
    });

    it('should calculate average batch size', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 1000,
        maxSize: 10,
        autoFlush: false, // Manual flush for control
      });

      // Batch 1: 2 requests
      batch.add(1);
      batch.add(2);
      await batch.flush();

      // Batch 2: 4 requests
      batch.add(3);
      batch.add(4);
      batch.add(5);
      batch.add(6);
      await batch.flush();

      const stats = batch.getStats();
      expect(stats.averageBatchSize).toBe(3); // (2 + 4) / 2

      batch.destroy();
    });

    it('should track largest batch', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 1000,
        maxSize: 10,
        autoFlush: false,
      });

      batch.add(1);
      await batch.flush();

      batch.add(2);
      batch.add(3);
      batch.add(4);
      await batch.flush();

      const stats = batch.getStats();
      expect(stats.largestBatch).toBe(3);

      batch.destroy();
    });

    it('should track smallest batch', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 1000,
        maxSize: 10,
        autoFlush: false,
      });

      batch.add(1);
      batch.add(2);
      batch.add(3);
      await batch.flush();

      batch.add(4);
      await batch.flush();

      const stats = batch.getStats();
      expect(stats.smallestBatch).toBe(1);

      batch.destroy();
    });
  });

  describe('Clear', () => {
    it('should clear pending requests', async () => {
      const processor = vi.fn().mockResolvedValue([]);
      const batch = new BatchProcessor(processor);

      const p1 = batch.add(1);
      const p2 = batch.add(2);
      batch.clear();

      // Catch expected rejections from cleared requests
      await expect(p1).rejects.toThrow('Batch processor cleared');
      await expect(p2).rejects.toThrow('Batch processor cleared');

      const stats = batch.getStats();
      expect(stats.totalRequests).toBe(0);

      batch.destroy();
    });

    it('should reject cleared requests with error', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        await sleep(100);
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 1000,
        maxSize: 10,
        autoFlush: false,
      });

      const promise = batch.add(1);
      batch.clear();

      await expect(promise).rejects.toThrow('Batch processor cleared');

      batch.destroy();
    });

    it('should accept custom error', async () => {
      const processor = vi.fn().mockResolvedValue([]);
      const batch = new BatchProcessor(processor, {
        windowMs: 1000,
        maxSize: 10,
        autoFlush: false,
      });

      const promise = batch.add(1);
      batch.clear(new Error('Custom error'));

      await expect(promise).rejects.toThrow('Custom error');

      batch.destroy();
    });
  });

  describe('Destroy', () => {
    it('should clean up resources', () => {
      const processor = vi.fn().mockResolvedValue([]);
      const batch = new BatchProcessor(processor);

      batch.destroy();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should reject pending requests', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        await sleep(100);
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 1000,
        maxSize: 10,
        autoFlush: false,
      });

      const promise = batch.add(1);
      batch.destroy();

      await expect(promise).rejects.toThrow('Batch processor destroyed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single request batch', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r * 2);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 50,
        maxSize: 10,
        autoFlush: true,
      });

      const result = await batch.add(1);

      expect(result).toBe(2);
      expect(processor).toHaveBeenCalledWith([1]);

      batch.destroy();
    });

    it('should handle rapid batch creation', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 10,
        maxSize: 3,
        autoFlush: true,
      });

      // Create multiple batches rapidly
      for (let i = 0; i < 9; i++) {
        batch.add(i);
      }

      await sleep(20);

      expect(processor).toHaveBeenCalledTimes(3); // 3 batches of 3

      batch.destroy();
    });

    it('should preserve request order in batch', async () => {
      const processor = vi.fn().mockImplementation(async (requests: number[]) => {
        // Verify order is preserved
        return requests.map(r => r);
      });

      const batch = new BatchProcessor(processor, {
        windowMs: 50,
        maxSize: 10,
        autoFlush: true,
      });

      await Promise.all([
        batch.add(1),
        batch.add(2),
        batch.add(3),
        batch.add(4),
        batch.add(5),
      ]);

      expect(processor).toHaveBeenCalledWith([1, 2, 3, 4, 5]);

      batch.destroy();
    });
  });
});
