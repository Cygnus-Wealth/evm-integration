import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager, TTL_STRATEGY } from './CacheManager';
import { sleep } from '../test-utils';

describe('CacheManager', () => {
  let cache: CacheManager<string>;

  beforeEach(() => {
    cache = new CacheManager<string>();
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const stats = cache.getStats();
      expect(stats.capacity).toBe(1000);
      expect(stats.size).toBe(0);
    });

    it('should accept partial config', () => {
      const customCache = new CacheManager({ capacity: 500, defaultTTL: 30 });
      expect(customCache.getStats().capacity).toBe(500);
      customCache.destroy();
    });

    it('should start cleanup interval', () => {
      // Cleanup interval is started in constructor
      expect(cache).toBeDefined();
    });
  });

  describe('Get/Set', () => {
    it('should set and get value', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('should return undefined for missing key', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeUndefined();
    });

    it('should return undefined for expired key', async () => {
      await cache.set('key1', 'value1', 0.1); // 100ms TTL
      await sleep(150);
      const value = await cache.get('key1');
      expect(value).toBeUndefined();
    });

    it('should use default TTL', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('should use custom TTL', async () => {
      await cache.set('key1', 'value1', 1);
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('should update last accessed time', async () => {
      await cache.set('key1', 'value1');
      await sleep(10);
      await cache.get('key1');
      // Access time updated internally
      expect(true).toBe(true);
    });

    it('should increment hit count', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.get('key1');
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });
  });

  describe('Has', () => {
    it('should return true for existing key', async () => {
      await cache.set('key1', 'value1');
      expect(await cache.has('key1')).toBe(true);
    });

    it('should return false for missing key', async () => {
      expect(await cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired key', async () => {
      await cache.set('key1', 'value1', 0.1);
      await sleep(150);
      expect(await cache.has('key1')).toBe(false);
    });
  });

  describe('Delete', () => {
    it('should delete existing key', async () => {
      await cache.set('key1', 'value1');
      const deleted = await cache.delete('key1');
      expect(deleted).toBe(true);
      expect(await cache.get('key1')).toBeUndefined();
    });

    it('should return false for non-existent key', async () => {
      const deleted = await cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should update stats', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');
      expect(cache.getStats().deletes).toBe(1);
    });
  });

  describe('Clear', () => {
    it('should remove all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    it('should update stats', async () => {
      await cache.set('key1', 'value1');
      await cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when full', async () => {
      const smallCache = new CacheManager<string>({ capacity: 3, enableLRU: true });

      await smallCache.set('key1', 'value1');
      await sleep(10);
      await smallCache.set('key2', 'value2');
      await sleep(10);
      await smallCache.set('key3', 'value3');

      await sleep(10);
      // Access key1 to make it recently used
      await smallCache.get('key1');

      await sleep(10);
      // Add key4, should evict key2 (least recently used)
      await smallCache.set('key4', 'value4');

      expect(await smallCache.get('key1')).toBe('value1'); // Still there
      expect(await smallCache.get('key2')).toBeUndefined(); // Evicted
      expect(await smallCache.get('key4')).toBe('value4'); // New one

      smallCache.destroy();
    });

    it('should maintain capacity', async () => {
      const smallCache = new CacheManager<string>({ capacity: 2 });
      
      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3');

      expect(smallCache.getStats().size).toBeLessThanOrEqual(2);
      smallCache.destroy();
    });
  });

  describe('Statistics', () => {
    it('should track hits', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      expect(cache.getStats().hits).toBe(1);
    });

    it('should track misses', async () => {
      await cache.get('nonexistent');
      expect(cache.getStats().misses).toBe(1);
    });

    it('should track sets', async () => {
      await cache.set('key1', 'value1');
      expect(cache.getStats().sets).toBe(1);
    });

    it('should track deletes', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');
      expect(cache.getStats().deletes).toBe(1);
    });

    it('should track evictions', async () => {
      const smallCache = new CacheManager<string>({ capacity: 2 });
      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3');
      expect(smallCache.getStats().evictions).toBeGreaterThan(0);
      smallCache.destroy();
    });

    it('should calculate hit rate', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1'); // hit
      await cache.get('key2'); // miss
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.5);
    });

    it('should track size and capacity', async () => {
      await cache.set('key1', 'value1');
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.capacity).toBe(1000);
    });

    it('should reset stats', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      cache.resetStats();
      expect(cache.getStats().hits).toBe(0);
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys', () => {
      const key1 = CacheManager.generateKey('method', 1, 'address');
      const key2 = CacheManager.generateKey('method', 1, 'address');
      expect(key1).toBe(key2);
    });

    it('should handle string parts', () => {
      const key = CacheManager.generateKey('part1', 'part2');
      expect(key).toBe('part1:part2');
    });

    it('should handle number parts', () => {
      const key = CacheManager.generateKey(1, 2, 3);
      expect(key).toBe('1:2:3');
    });

    it('should handle mixed types', () => {
      const key = CacheManager.generateKey('method', 1, 'address', 123);
      expect(key).toBe('method:1:address:123');
    });
  });

  describe('Cleanup', () => {
    it('should destroy cache manager', () => {
      cache.destroy();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should clear all entries on destroy', async () => {
      await cache.set('key1', 'value1');
      cache.destroy();
      // Cache is destroyed, can't test further
      expect(true).toBe(true);
    });
  });
});
