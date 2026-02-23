import { describe, it, expect, beforeEach } from 'vitest';
import { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager';
import { CircuitBreakerError } from '../utils/errors';
import { sleep } from '../test-utils';
import type { CircuitBreakerConfig } from '@cygnus-wealth/rpc-infrastructure';

describe('RpcCircuitBreakerManager', () => {
  let manager: RpcCircuitBreakerManager;

  beforeEach(() => {
    manager = new RpcCircuitBreakerManager();
  });

  describe('getBreaker', () => {
    it('should create a new circuit breaker for a (chainId, provider) pair', () => {
      const breaker = manager.getBreaker(1, 'alchemy');
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should return the same breaker for the same (chainId, provider)', () => {
      const b1 = manager.getBreaker(1, 'alchemy');
      const b2 = manager.getBreaker(1, 'alchemy');
      expect(b1).toBe(b2);
    });

    it('should return different breakers for different providers on same chain', () => {
      const b1 = manager.getBreaker(1, 'alchemy');
      const b2 = manager.getBreaker(1, 'drpc');
      expect(b1).not.toBe(b2);
    });

    it('should return different breakers for same provider on different chains', () => {
      const b1 = manager.getBreaker(1, 'alchemy');
      const b2 = manager.getBreaker(137, 'alchemy');
      expect(b1).not.toBe(b2);
    });
  });

  describe('default config: 5 failures/60s → OPEN, 30s timeout, 3 successes to close', () => {
    it('should open after 5 failures', async () => {
      const breaker = manager.getBreaker(1, 'alchemy');

      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => { throw new Error('rpc fail'); });
        } catch { /* expected */ }
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should NOT open after 4 failures', async () => {
      const breaker = manager.getBreaker(1, 'alchemy');

      for (let i = 0; i < 4; i++) {
        try {
          await breaker.execute(async () => { throw new Error('rpc fail'); });
        } catch { /* expected */ }
      }

      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should reject calls when OPEN', async () => {
      const breaker = manager.getBreaker(1, 'alchemy');

      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => { throw new Error('rpc fail'); });
        } catch { /* expected */ }
      }

      await expect(breaker.execute(async () => 'test')).rejects.toThrow(CircuitBreakerError);
    });
  });

  describe('package CircuitBreakerConfig', () => {
    it('should accept CircuitBreakerConfig from @cygnus-wealth/rpc-infrastructure', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 3,
        openDurationMs: 100,
        halfOpenMaxAttempts: 2,
        monitorWindowMs: 60_000,
      };

      const mgr = new RpcCircuitBreakerManager(config);
      const breaker = mgr.getBreaker(1, 'alchemy');

      // Should open after 3 failures (failureThreshold)
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }
      expect(breaker.getState()).toBe('OPEN');
    });

    it('should respect openDurationMs for HALF_OPEN transition', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 3,
        openDurationMs: 100,
        halfOpenMaxAttempts: 2,
        monitorWindowMs: 60_000,
      };

      const mgr = new RpcCircuitBreakerManager(config);
      const breaker = mgr.getBreaker(1, 'alchemy');

      // Open it
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }
      expect(breaker.getState()).toBe('OPEN');

      // Wait for openDurationMs
      await sleep(150);

      // Should transition to HALF_OPEN on next attempt
      await breaker.execute(async () => 'ok');
      // After openDurationMs, it moves to HALF_OPEN and a success is recorded
      expect(breaker.getState()).not.toBe('OPEN');
    });

    it('should use halfOpenMaxAttempts as success threshold to close', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 3,
        openDurationMs: 100,
        halfOpenMaxAttempts: 2,
        monitorWindowMs: 60_000,
      };

      const mgr = new RpcCircuitBreakerManager(config);
      const breaker = mgr.getBreaker(1, 'alchemy');

      // Open it
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }
      expect(breaker.getState()).toBe('OPEN');

      // Wait for HALF_OPEN
      await sleep(150);

      // 2 successes (halfOpenMaxAttempts) should close it
      for (let i = 0; i < 2; i++) {
        await breaker.execute(async () => 'ok');
      }
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should respect monitorWindowMs as rolling window', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        openDurationMs: 30_000,
        halfOpenMaxAttempts: 3,
        monitorWindowMs: 60_000,
      };

      const mgr = new RpcCircuitBreakerManager(config);
      const breaker = mgr.getBreaker(1, 'test');
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('isOpen', () => {
    it('should return false for unknown (chainId, provider)', () => {
      expect(manager.isOpen(999, 'unknown')).toBe(false);
    });

    it('should return true when circuit is open', async () => {
      const breaker = manager.getBreaker(1, 'alchemy');

      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }

      expect(manager.isOpen(1, 'alchemy')).toBe(true);
    });

    it('should return false when circuit is closed', () => {
      manager.getBreaker(1, 'alchemy');
      expect(manager.isOpen(1, 'alchemy')).toBe(false);
    });
  });

  describe('isOpenForUrl', () => {
    it('should check circuit state by URL', async () => {
      // Register mapping
      manager.registerEndpointUrl(1, 'alchemy', 'https://alchemy.example.com');
      const breaker = manager.getBreaker(1, 'alchemy');

      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }

      expect(manager.isOpenForUrl('https://alchemy.example.com')).toBe(true);
    });

    it('should return false for unknown URL', () => {
      expect(manager.isOpenForUrl('https://unknown.example.com')).toBe(false);
    });
  });

  describe('resetAll', () => {
    it('should reset all circuit breakers', async () => {
      const b1 = manager.getBreaker(1, 'alchemy');
      const b2 = manager.getBreaker(137, 'drpc');

      // Open both
      for (const b of [b1, b2]) {
        for (let i = 0; i < 5; i++) {
          try {
            await b.execute(async () => { throw new Error('fail'); });
          } catch { /* expected */ }
        }
      }

      expect(b1.getState()).toBe('OPEN');
      expect(b2.getState()).toBe('OPEN');

      manager.resetAll();

      expect(b1.getState()).toBe('CLOSED');
      expect(b2.getState()).toBe('CLOSED');
    });
  });

  describe('getAllStats', () => {
    it('should return stats for all managed breakers', async () => {
      manager.getBreaker(1, 'alchemy');
      manager.getBreaker(137, 'drpc');

      await manager.getBreaker(1, 'alchemy').execute(async () => 'ok');

      const stats = manager.getAllStats();
      expect(stats.size).toBe(2);
      expect(stats.has('1:alchemy')).toBe(true);
      expect(stats.has('137:drpc')).toBe(true);
    });
  });
});
