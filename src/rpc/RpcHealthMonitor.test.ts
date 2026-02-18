import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RpcHealthMonitor, RpcHealthCheckFn } from './RpcHealthMonitor';
import { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager';
import { ProviderMetrics } from './ProviderMetrics';
import type { RpcEndpoint } from './types';

function makeEndpoint(provider: string, url?: string): RpcEndpoint {
  return {
    url: url ?? `https://${provider}.example.com`,
    provider,
    rateLimitRps: 25,
    priority: 0,
  };
}

describe('RpcHealthMonitor', () => {
  let monitor: RpcHealthMonitor;
  let cbManager: RpcCircuitBreakerManager;
  let metrics: ProviderMetrics;
  let mockHealthCheck: RpcHealthCheckFn;

  beforeEach(() => {
    vi.useFakeTimers();
    cbManager = new RpcCircuitBreakerManager();
    metrics = new ProviderMetrics();
    mockHealthCheck = vi.fn().mockResolvedValue(12345678n);

    monitor = new RpcHealthMonitor(cbManager, metrics, {
      healthCheckIntervalMs: 1000, // Short for testing
      healthCheckFn: mockHealthCheck,
    });
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  describe('registerEndpoint', () => {
    it('should register an endpoint for monitoring', () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      const statuses = monitor.getAllStatuses();
      expect(statuses.length).toBe(1);
      expect(statuses[0].provider).toBe('alchemy');
      expect(statuses[0].status).toBe('unknown');
    });

    it('should register multiple endpoints', () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      monitor.registerEndpoint(1, makeEndpoint('drpc'));
      monitor.registerEndpoint(137, makeEndpoint('alchemy'));

      expect(monitor.getAllStatuses().length).toBe(3);
    });
  });

  describe('runCheck', () => {
    it('should mark endpoint as healthy on success', async () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      await monitor.runCheck(1, 'alchemy');

      const status = monitor.getStatus(1, 'alchemy');
      expect(status).toBeDefined();
      expect(status!.status).toBe('healthy');
      expect(status!.blockNumber).toBe(12345678n);
    });

    it('should mark endpoint as unhealthy on failure', async () => {
      mockHealthCheck = vi.fn().mockRejectedValue(new Error('connection refused'));
      monitor = new RpcHealthMonitor(cbManager, metrics, {
        healthCheckIntervalMs: 1000,
        healthCheckFn: mockHealthCheck,
      });

      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      await monitor.runCheck(1, 'alchemy');

      const status = monitor.getStatus(1, 'alchemy');
      expect(status!.status).toBe('unhealthy');
      expect(status!.error).toBe('connection refused');
    });

    it('should record latency in metrics', async () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      await monitor.runCheck(1, 'alchemy');

      const snap = metrics.getSnapshot(1, 'alchemy');
      expect(snap).toBeDefined();
      expect(snap!.totalRequests).toBe(1);
    });

    it('should call health check with correct endpoint URL', async () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy', 'https://eth-mainnet.alchemy.com'));
      await monitor.runCheck(1, 'alchemy');

      expect(mockHealthCheck).toHaveBeenCalledWith('https://eth-mainnet.alchemy.com');
    });
  });

  describe('periodic checks', () => {
    it('should run checks at configured interval when started', async () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      monitor.start();

      // Initial check
      await vi.advanceTimersByTimeAsync(0);
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);

      // After one interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockHealthCheck).toHaveBeenCalledTimes(2);

      // After another interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockHealthCheck).toHaveBeenCalledTimes(3);
    });

    it('should stop periodic checks', async () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      monitor.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);

      monitor.stop();

      await vi.advanceTimersByTimeAsync(5000);
      // Should not have been called again
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe('unregisterEndpoint', () => {
    it('should remove endpoint from monitoring', () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      monitor.registerEndpoint(1, makeEndpoint('drpc'));

      monitor.unregisterEndpoint(1, 'alchemy');

      expect(monitor.getAllStatuses().length).toBe(1);
      expect(monitor.getStatus(1, 'alchemy')).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('should return undefined for unregistered endpoint', () => {
      expect(monitor.getStatus(999, 'unknown')).toBeUndefined();
    });
  });

  describe('runAllChecks', () => {
    it('should run health checks for all registered endpoints', async () => {
      monitor.registerEndpoint(1, makeEndpoint('alchemy'));
      monitor.registerEndpoint(137, makeEndpoint('drpc'));

      await monitor.runAllChecks();

      expect(mockHealthCheck).toHaveBeenCalledTimes(2);
      expect(monitor.getStatus(1, 'alchemy')!.status).toBe('healthy');
      expect(monitor.getStatus(137, 'drpc')!.status).toBe('healthy');
    });
  });
});
