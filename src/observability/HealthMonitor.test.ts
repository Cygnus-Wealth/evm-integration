/**
 * Unit tests for HealthMonitor
 *
 * @module observability/HealthMonitor.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthMonitor } from './HealthMonitor';
import { HealthStatus, HealthCheckConfig, HealthCheckResult } from './interfaces';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    monitor = new HealthMonitor();
    vi.useFakeTimers();
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  describe('registerCheck', () => {
    it('should register health check', () => {
      const check: HealthCheckConfig = {
        component: 'test',
        check: async () => ({
          component: 'test',
          status: HealthStatus.HEALTHY,
          timestamp: new Date(),
          responseTime: 10,
        }),
      };

      monitor.registerCheck(check);
      expect(monitor.getStatus('test')).toBeUndefined(); // Not run yet
    });

    it('should start periodic checks if monitor is running', async () => {
      const checkFn = vi.fn(async () => ({
        component: 'test',
        status: HealthStatus.HEALTHY,
        timestamp: new Date(),
        responseTime: 10,
      }));

      const check: HealthCheckConfig = {
        component: 'test',
        check: checkFn,
        interval: 1000,
      };

      monitor.start();
      monitor.registerCheck(check);

      // Wait for initial check
      await vi.advanceTimersByTimeAsync(100);
      expect(checkFn).toHaveBeenCalled();
    });

    it('should not duplicate checks', () => {
      const check: HealthCheckConfig = {
        component: 'test',
        check: async () => ({
          component: 'test',
          status: HealthStatus.HEALTHY,
          timestamp: new Date(),
          responseTime: 10,
        }),
      };

      monitor.registerCheck(check);
      monitor.registerCheck(check); // Register again

      // Should not cause issues
      expect(() => monitor.unregisterCheck('test')).not.toThrow();
    });
  });

  describe('unregisterCheck', () => {
    it('should unregister check', () => {
      const check: HealthCheckConfig = {
        component: 'test',
        check: async () => ({
          component: 'test',
          status: HealthStatus.HEALTHY,
          timestamp: new Date(),
          responseTime: 10,
        }),
      };

      monitor.registerCheck(check);
      const result = monitor.unregisterCheck('test');

      expect(result).toBe(true);
    });

    it('should stop periodic checks', async () => {
      const checkFn = vi.fn(async () => ({
        component: 'test',
        status: HealthStatus.HEALTHY,
        timestamp: new Date(),
        responseTime: 10,
      }));

      const check: HealthCheckConfig = {
        component: 'test',
        check: checkFn,
        interval: 1000,
      };

      monitor.start();
      monitor.registerCheck(check);

      await vi.advanceTimersByTimeAsync(100);
      const initialCalls = checkFn.mock.calls.length;

      monitor.unregisterCheck('test');

      await vi.advanceTimersByTimeAsync(5000);
      expect(checkFn.mock.calls.length).toBe(initialCalls); // No new calls
    });

    it('should return false for non-existent component', () => {
      const result = monitor.unregisterCheck('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('runHealthChecks', () => {
    it('should run all registered checks', async () => {
      const check1 = createHealthyCheck('component1');
      const check2 = createHealthyCheck('component2');

      monitor.registerCheck(check1);
      monitor.registerCheck(check2);

      const health = await monitor.runHealthChecks();

      expect(health.components.length).toBe(2);
      expect(health.components[0].component).toBe('component1');
      expect(health.components[1].component).toBe('component2');
    });

    it('should collect all results', async () => {
      monitor.registerCheck(createHealthyCheck('test1'));
      monitor.registerCheck(createHealthyCheck('test2'));

      const health = await monitor.runHealthChecks();

      expect(health.components.length).toBe(2);
      expect(health.status).toBe(HealthStatus.HEALTHY);
    });

    it('should determine overall status', async () => {
      monitor.registerCheck(createHealthyCheck('test1'));
      monitor.registerCheck(createUnhealthyCheck('test2'));

      const health = await monitor.runHealthChecks();

      expect(health.status).toBe(HealthStatus.DEGRADED);
    });

    it('should handle check timeouts', async () => {
      const check: HealthCheckConfig = {
        component: 'slow',
        check: async () => {
          await new Promise(resolve => setTimeout(resolve, 10000));
          return {
            component: 'slow',
            status: HealthStatus.HEALTHY,
            timestamp: new Date(),
            responseTime: 10000,
          };
        },
        timeout: 100,
      };

      monitor.registerCheck(check);

      // Run health checks and advance timers to trigger timeout
      const healthPromise = monitor.runHealthChecks();
      await vi.advanceTimersByTimeAsync(150); // Advance past timeout
      const health = await healthPromise;

      const result = health.components.find(c => c.component === 'slow');
      expect(result?.status).toBe(HealthStatus.UNHEALTHY);
      expect(result?.error).toBeDefined();
    });

    it('should handle check errors', async () => {
      const check: HealthCheckConfig = {
        component: 'failing',
        check: async () => {
          throw new Error('Check failed');
        },
      };

      monitor.registerCheck(check);

      const health = await monitor.runHealthChecks();

      const result = health.components.find(c => c.component === 'failing');
      expect(result?.status).toBe(HealthStatus.UNHEALTHY);
      expect(result?.error?.message).toBe('Check failed');
    });
  });

  describe('getStatus', () => {
    it('should return latest result', async () => {
      monitor.registerCheck(createHealthyCheck('test'));
      await monitor.runHealthChecks();

      const status = monitor.getStatus('test');

      expect(status).toBeDefined();
      expect(status?.component).toBe('test');
      expect(status?.status).toBe(HealthStatus.HEALTHY);
    });

    it('should return undefined for unknown component', () => {
      const status = monitor.getStatus('unknown');
      expect(status).toBeUndefined();
    });
  });

  describe('getSystemHealth', () => {
    it('should return overall health', async () => {
      monitor.registerCheck(createHealthyCheck('test'));
      await monitor.runHealthChecks();

      const health = monitor.getSystemHealth();

      expect(health.status).toBe(HealthStatus.HEALTHY);
      expect(health.components.length).toBe(1);
    });

    it('should include all component results', async () => {
      monitor.registerCheck(createHealthyCheck('test1'));
      monitor.registerCheck(createHealthyCheck('test2'));
      await monitor.runHealthChecks();

      const health = monitor.getSystemHealth();

      expect(health.components.length).toBe(2);
    });

    it('should calculate uptime', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      const health = monitor.getSystemHealth();

      expect(health.uptime).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('Status Determination', () => {
    it('should be HEALTHY if all healthy', async () => {
      monitor.registerCheck(createHealthyCheck('test1'));
      monitor.registerCheck(createHealthyCheck('test2'));

      const health = await monitor.runHealthChecks();

      expect(health.status).toBe(HealthStatus.HEALTHY);
    });

    it('should be DEGRADED if non-critical unhealthy', async () => {
      monitor.registerCheck(createHealthyCheck('test1'));
      monitor.registerCheck(createUnhealthyCheck('test2', false));

      const health = await monitor.runHealthChecks();

      expect(health.status).toBe(HealthStatus.DEGRADED);
    });

    it('should be UNHEALTHY if critical unhealthy', async () => {
      monitor.registerCheck(createHealthyCheck('test1'));
      monitor.registerCheck(createUnhealthyCheck('test2', true));

      const health = await monitor.runHealthChecks();

      expect(health.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should be DEGRADED if any component degraded', async () => {
      monitor.registerCheck(createHealthyCheck('test1'));
      monitor.registerCheck(createDegradedCheck('test2'));

      const health = await monitor.runHealthChecks();

      expect(health.status).toBe(HealthStatus.DEGRADED);
    });

    it('should be HEALTHY with no checks', async () => {
      const health = await monitor.runHealthChecks();

      expect(health.status).toBe(HealthStatus.HEALTHY);
      expect(health.components.length).toBe(0);
    });
  });

  describe('Start/Stop', () => {
    it('should start periodic checks', async () => {
      const checkFn = vi.fn(async () => ({
        component: 'test',
        status: HealthStatus.HEALTHY,
        timestamp: new Date(),
        responseTime: 10,
      }));

      monitor.registerCheck({
        component: 'test',
        check: checkFn,
        interval: 1000,
      });

      monitor.start();

      await vi.advanceTimersByTimeAsync(100);
      expect(checkFn).toHaveBeenCalled();
    });

    it('should stop all checks', async () => {
      const checkFn = vi.fn(async () => ({
        component: 'test',
        status: HealthStatus.HEALTHY,
        timestamp: new Date(),
        responseTime: 10,
      }));

      monitor.registerCheck({
        component: 'test',
        check: checkFn,
        interval: 1000,
      });

      monitor.start();
      await vi.advanceTimersByTimeAsync(100);

      const callsBeforeStop = checkFn.mock.calls.length;

      monitor.stop();
      await vi.advanceTimersByTimeAsync(5000);

      expect(checkFn.mock.calls.length).toBe(callsBeforeStop);
    });

    it('should clear intervals on stop', async () => {
      monitor.registerCheck({
        component: 'test',
        check: async () => ({
          component: 'test',
          status: HealthStatus.HEALTHY,
          timestamp: new Date(),
          responseTime: 10,
        }),
        interval: 1000,
      });

      monitor.start();
      monitor.stop();

      // Should not throw
      monitor.stop();
    });

    it('should not start twice', () => {
      monitor.start();
      monitor.start(); // Should be ignored

      expect(() => monitor.stop()).not.toThrow();
    });
  });
});

// Helper functions

function createHealthyCheck(name: string): HealthCheckConfig {
  return {
    component: name,
    check: async () => ({
      component: name,
      status: HealthStatus.HEALTHY,
      timestamp: new Date(),
      responseTime: 10,
    }),
  };
}

function createUnhealthyCheck(name: string, critical = false): HealthCheckConfig {
  return {
    component: name,
    critical,
    check: async () => ({
      component: name,
      status: HealthStatus.UNHEALTHY,
      timestamp: new Date(),
      responseTime: 10,
      error: new Error('Component unhealthy'),
    }),
  };
}

function createDegradedCheck(name: string): HealthCheckConfig {
  return {
    component: name,
    check: async () => ({
      component: name,
      status: HealthStatus.DEGRADED,
      timestamp: new Date(),
      responseTime: 10,
    }),
  };
}
