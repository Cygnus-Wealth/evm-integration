import { describe, it, expect, beforeEach } from 'vitest';
import { RpcCircuitBreakerManager } from './RpcCircuitBreakerManager';
import { CircuitBreakerError } from '../utils/errors';
import { sleep } from '../test-utils';

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

    it('should close after 3 successes in HALF_OPEN', async () => {
      const mgr = new RpcCircuitBreakerManager({
        failureThreshold: 5,
        rollingWindowMs: 60_000,
        openTimeoutMs: 100, // short for test
        successThreshold: 3,
      });
      const breaker = mgr.getBreaker(1, 'alchemy');

      // Open it
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }
      expect(breaker.getState()).toBe('OPEN');

      // Wait for HALF_OPEN
      await sleep(150);

      // 3 successes to close
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => 'ok');
      }
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('custom config', () => {
    it('should accept custom failure threshold', async () => {
      const mgr = new RpcCircuitBreakerManager({ failureThreshold: 3 });
      const breaker = mgr.getBreaker(1, 'custom');

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }

      expect(breaker.getState()).toBe('OPEN');
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
