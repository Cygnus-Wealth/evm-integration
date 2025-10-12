import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from './CircuitBreaker';
import { CircuitBreakerError } from '../utils/errors';
import { sleep } from '../test-utils';

describe('CircuitBreaker', () => {
  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      expect(breaker.getState()).toBe('CLOSED');
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    it('should accept partial config', () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
        timeout: 10000,
      });

      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should start in CLOSED state', () => {
      const breaker = new CircuitBreaker({ name: 'test' });
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should validate config parameters', () => {
      // Should not throw with valid config
      expect(() => new CircuitBreaker({ name: 'test' })).not.toThrow();
    });
  });

  describe('State Transitions', () => {
    it('should remain CLOSED on success', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should transition CLOSED -> OPEN after failure threshold', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
        volumeThreshold: 1,
      });

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should stay OPEN within timeout period', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
        timeout: 1000,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');

      // Try immediately - should still be open
      await expect(breaker.execute(async () => 'test')).rejects.toThrow(
        CircuitBreakerError
      );

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should transition OPEN -> HALF_OPEN after timeout', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
        timeout: 100,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');

      // Wait for timeout
      await sleep(150);

      // Next request should transition to HALF_OPEN and then execute
      await breaker.execute(async () => 'success');
      // After one success in HALF_OPEN with default successThreshold=3, still in HALF_OPEN
      expect(breaker.getState()).toBe('HALF_OPEN');
    });

    it('should transition HALF_OPEN -> CLOSED after success threshold', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        successThreshold: 3,
        volumeThreshold: 1,
        timeout: 100,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      // Wait for timeout
      await sleep(150);

      // Execute successful operations to close circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => 'success');
      }

      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should transition HALF_OPEN -> OPEN on failure', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
        timeout: 100,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      // Wait for timeout
      await sleep(150);

      // Fail in half-open state
      try {
        await breaker.execute(async () => {
          throw new Error('fail again');
        });
      } catch (e) {
        // Expected
      }

      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('Execute', () => {
    it('should execute operation when CLOSED', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should throw CircuitBreakerError when OPEN', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      await expect(breaker.execute(async () => 'test')).rejects.toThrow(
        CircuitBreakerError
      );
    });

    it('should allow single request in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
        timeout: 100,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      // Wait for timeout
      await sleep(150);

      // Should allow request in half-open
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should propagate operation errors', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      await expect(
        breaker.execute(async () => {
          throw new Error('operation error');
        })
      ).rejects.toThrow('operation error');
    });

    it('should update stats on success', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      await breaker.execute(async () => 'success');

      const stats = breaker.getStats();
      expect(stats.successCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('should update stats on failure', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch (e) {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
      expect(stats.lastFailureTime).not.toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should track failure count', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getStats().failureCount).toBe(3);
    });

    it('should track success count', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => 'success');
      }

      expect(breaker.getStats().successCount).toBe(3);
    });

    it('should track total requests', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      await breaker.execute(async () => 'success');
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch (e) {
        // Expected
      }

      expect(breaker.getStats().totalRequests).toBe(2);
    });

    it('should record last failure time', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch (e) {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.lastFailureTime).not.toBeNull();
      expect(stats.lastFailureTime).toBeGreaterThan(0);
    });

    it('should record state change time', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
      });

      const initialTime = breaker.getStats().lastStateChange;

      // Small delay to ensure time difference
      await sleep(10);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getStats().lastStateChange).toBeGreaterThan(initialTime);
    });

    it('should respect volume threshold', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 5,
      });

      // Fail less than volume threshold
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      // Should still be closed due to volume threshold
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('Reset', () => {
    it('should reset to CLOSED state', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');

      breaker.reset();
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should clear statistics', () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      breaker.execute(async () => 'success');
      breaker.reset();

      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    it('should allow operations after reset', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      breaker.reset();

      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state changes', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
        timeout: 50,
      });

      // Rapid open/close cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // Open circuit
        for (let i = 0; i < 2; i++) {
          try {
            await breaker.execute(async () => {
              throw new Error('fail');
            });
          } catch (e) {
            // Expected
          }
        }

        expect(breaker.getState()).toBe('OPEN');

        // Wait and execute successful operations to close (need successThreshold=3)
        await sleep(100);
        for (let i = 0; i < 3; i++) {
          await breaker.execute(async () => 'success');
        }
      }

      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should handle concurrent requests in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
        timeout: 100,
      });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      // Wait for half-open
      await sleep(150);

      // Concurrent requests
      const results = await Promise.allSettled([
        breaker.execute(async () => 'success1'),
        breaker.execute(async () => 'success2'),
      ]);

      // At least one should succeed
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(0);
    });

    it('should handle exactly threshold failures', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
        volumeThreshold: 1,
      });

      // Exactly threshold failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should handle extremely short timeouts', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 1,
        timeout: 1,
      });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch (e) {
          // Expected
        }
      }

      // Wait minimal time
      await sleep(10);

      // Should allow retry
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });
  });
});
