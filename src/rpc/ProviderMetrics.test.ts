import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderMetrics } from './ProviderMetrics';

describe('ProviderMetrics', () => {
  let metrics: ProviderMetrics;

  beforeEach(() => {
    vi.useFakeTimers();
    metrics = new ProviderMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordSuccess', () => {
    it('should record a successful request with latency', () => {
      metrics.recordSuccess(1, 'alchemy', 150);
      const snapshot = metrics.getSnapshot(1, 'alchemy');

      expect(snapshot).toBeDefined();
      expect(snapshot!.totalRequests).toBe(1);
      expect(snapshot!.totalErrors).toBe(0);
      expect(snapshot!.errorRate).toBe(0);
    });

    it('should track multiple successes', () => {
      metrics.recordSuccess(1, 'alchemy', 100);
      metrics.recordSuccess(1, 'alchemy', 200);
      metrics.recordSuccess(1, 'alchemy', 300);

      const snapshot = metrics.getSnapshot(1, 'alchemy');
      expect(snapshot!.totalRequests).toBe(3);
      expect(snapshot!.totalErrors).toBe(0);
    });
  });

  describe('recordError', () => {
    it('should record a failed request', () => {
      metrics.recordError(1, 'alchemy', 500);
      const snapshot = metrics.getSnapshot(1, 'alchemy');

      expect(snapshot!.totalRequests).toBe(1);
      expect(snapshot!.totalErrors).toBe(1);
      expect(snapshot!.errorRate).toBe(1);
    });

    it('should calculate error rate correctly', () => {
      // 2 successes, 1 error = 33.3% error rate
      metrics.recordSuccess(1, 'alchemy', 100);
      metrics.recordSuccess(1, 'alchemy', 200);
      metrics.recordError(1, 'alchemy', 500);

      const snapshot = metrics.getSnapshot(1, 'alchemy');
      expect(snapshot!.errorRate).toBeCloseTo(1 / 3);
    });
  });

  describe('latency percentiles', () => {
    it('should calculate P50/P95/P99 correctly', () => {
      // Record 100 latency values: 1, 2, 3, ..., 100
      for (let i = 1; i <= 100; i++) {
        metrics.recordSuccess(1, 'alchemy', i);
      }

      const snapshot = metrics.getSnapshot(1, 'alchemy');
      expect(snapshot!.latency.p50).toBe(50);
      expect(snapshot!.latency.p95).toBe(95);
      expect(snapshot!.latency.p99).toBe(99);
    });

    it('should handle single observation', () => {
      metrics.recordSuccess(1, 'alchemy', 42);

      const snapshot = metrics.getSnapshot(1, 'alchemy');
      expect(snapshot!.latency.p50).toBe(42);
      expect(snapshot!.latency.p95).toBe(42);
      expect(snapshot!.latency.p99).toBe(42);
    });

    it('should handle two observations', () => {
      metrics.recordSuccess(1, 'alchemy', 10);
      metrics.recordSuccess(1, 'alchemy', 20);

      const snapshot = metrics.getSnapshot(1, 'alchemy');
      expect(snapshot!.latency.p50).toBe(10);
      expect(snapshot!.latency.p95).toBe(20);
      expect(snapshot!.latency.p99).toBe(20);
    });
  });

  describe('rolling 5-minute window', () => {
    it('should expire entries older than 5 minutes', () => {
      metrics.recordSuccess(1, 'alchemy', 100);
      expect(metrics.getSnapshot(1, 'alchemy')!.totalRequests).toBe(1);

      // Advance 5 minutes + 1ms
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      metrics.recordSuccess(1, 'alchemy', 200);
      const snapshot = metrics.getSnapshot(1, 'alchemy');
      // Old entry should be expired, only the new one remains
      expect(snapshot!.totalRequests).toBe(1);
      expect(snapshot!.latency.p50).toBe(200);
    });

    it('should keep entries within the 5-minute window', () => {
      metrics.recordSuccess(1, 'alchemy', 100);

      // Advance 4 minutes (still within window)
      vi.advanceTimersByTime(4 * 60 * 1000);

      metrics.recordSuccess(1, 'alchemy', 200);

      const snapshot = metrics.getSnapshot(1, 'alchemy');
      expect(snapshot!.totalRequests).toBe(2);
    });
  });

  describe('per-provider isolation', () => {
    it('should track metrics independently per provider', () => {
      metrics.recordSuccess(1, 'alchemy', 100);
      metrics.recordError(1, 'drpc', 500);

      expect(metrics.getSnapshot(1, 'alchemy')!.errorRate).toBe(0);
      expect(metrics.getSnapshot(1, 'drpc')!.errorRate).toBe(1);
    });

    it('should track metrics independently per chain', () => {
      metrics.recordSuccess(1, 'alchemy', 100);
      metrics.recordSuccess(137, 'alchemy', 200);

      expect(metrics.getSnapshot(1, 'alchemy')!.totalRequests).toBe(1);
      expect(metrics.getSnapshot(137, 'alchemy')!.totalRequests).toBe(1);
    });
  });

  describe('getSnapshot', () => {
    it('should return undefined for unknown provider', () => {
      expect(metrics.getSnapshot(999, 'unknown')).toBeUndefined();
    });

    it('should include window timestamps', () => {
      const now = Date.now();
      metrics.recordSuccess(1, 'alchemy', 100);

      const snapshot = metrics.getSnapshot(1, 'alchemy');
      expect(snapshot!.windowEnd.getTime()).toBeGreaterThanOrEqual(now);
    });
  });

  describe('getAllSnapshots', () => {
    it('should return snapshots for all tracked providers', () => {
      metrics.recordSuccess(1, 'alchemy', 100);
      metrics.recordSuccess(137, 'drpc', 200);

      const all = metrics.getAllSnapshots();
      expect(all.length).toBe(2);
    });

    it('should return empty array when no metrics', () => {
      expect(metrics.getAllSnapshots()).toEqual([]);
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      metrics.recordSuccess(1, 'alchemy', 100);
      metrics.recordError(137, 'drpc', 500);

      metrics.reset();

      expect(metrics.getSnapshot(1, 'alchemy')).toBeUndefined();
      expect(metrics.getSnapshot(137, 'drpc')).toBeUndefined();
      expect(metrics.getAllSnapshots()).toEqual([]);
    });
  });
});
