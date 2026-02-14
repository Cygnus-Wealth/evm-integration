import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from './CircuitBreaker';
import { RetryPolicy } from './RetryPolicy';
import { TimeoutManager, TimeoutLevel } from './TimeoutManager';
import { FallbackChain, FallbackStrategy } from './FallbackChain';
import { BulkheadManager } from './BulkheadManager';
import { sleep } from '../test-utils';
import { ConnectionError } from '../utils/errors';

/**
 * Integration tests for resilience patterns
 * Tests component interaction and combined behavior
 */
describe('Resilience Integration', () => {
  describe('CircuitBreaker + RetryPolicy', () => {
    it('should combine circuit breaker with retry logic', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        timeout: 100,
        volumeThreshold: 0,
        name: 'test-breaker',
      });

      const retry = new RetryPolicy({
        maxAttempts: 3,
        baseDelay: 10,
        retryableErrors: ['CONNECTION_RESET'],
      });

      let attemptCount = 0;

      const operation = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw ConnectionError.reset('test-endpoint');
        }
        return 'success';
      };

      // Retry within circuit breaker
      const result = await breaker.execute(async () => {
        return await retry.execute(operation);
      });

      expect(result).toBe('success');
      expect(attemptCount).toBe(2);
      expect(breaker.getStats().successCount).toBe(1);
    });

    it('should open circuit after retry exhaustion', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 100,
        volumeThreshold: 0,
        name: 'test-breaker',
      });

      const retry = new RetryPolicy({
        maxAttempts: 2,
        baseDelay: 10,
        retryableErrors: ['CONNECTION_RESET'],
      });

      const operation = async () => {
        throw ConnectionError.reset('test-endpoint');
      };

      // Need 2 failures to reach threshold of 2
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => retry.execute(operation));
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.getStats().failureCount).toBe(2);
    });
  });

  describe('FallbackChain + CircuitBreaker', () => {
    it('should fallback when circuit is open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        timeout: 100,
        volumeThreshold: 0,
        name: 'primary-breaker',
      });

      // Cause breaker to open (need to hit threshold)
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch (e) {
        // Expected - first failure reaches threshold of 1
      }

      expect(breaker.getState()).toBe('OPEN');

      // Create fallback chain
      const strategies: FallbackStrategy<string>[] = [
        {
          name: 'primary',
          execute: async () => breaker.execute(async () => 'primary-result'),
        },
        {
          name: 'secondary',
          execute: async () => 'secondary-result',
        },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      // Should fallback to secondary since circuit is open
      expect(result.value).toBe('secondary-result');
      expect(result.strategyIndex).toBe(1);
    });

    it('should use fallback strategies with different breakers', async () => {
      const primaryBreaker = new CircuitBreaker({
        failureThreshold: 1,
        timeout: 100,
        volumeThreshold: 0,
        name: 'primary',
      });

      const secondaryBreaker = new CircuitBreaker({
        failureThreshold: 1,
        timeout: 100,
        volumeThreshold: 0,
        name: 'secondary',
      });

      // Open primary breaker
      try {
        await primaryBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch (e) {
        // Expected - threshold reached
      }

      expect(primaryBreaker.getState()).toBe('OPEN');

      const strategies: FallbackStrategy<string>[] = [
        {
          name: 'primary',
          execute: async () => primaryBreaker.execute(async () => 'primary'),
        },
        {
          name: 'secondary',
          execute: async () => secondaryBreaker.execute(async () => 'secondary'),
        },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.value).toBe('secondary');
      expect(secondaryBreaker.getStats().successCount).toBe(1);
    });
  });

  describe('BulkheadManager + TimeoutManager', () => {
    it('should enforce timeouts within bulkhead', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 2,
        maxQueue: 2,
      });

      const timeoutManager = new TimeoutManager({
        connection: 100,
        request: 100,
        operation: 200,
        global: 300,
      });

      const longOperation = async () => {
        await sleep(200);
        return 'result';
      };

      await expect(
        bulkhead.execute(async () =>
          timeoutManager.execute(longOperation, TimeoutLevel.REQUEST)
        )
      ).rejects.toThrow('timeout');
    });

    it('should isolate timeout operations in bulkhead', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 3,
        maxQueue: 2,
      });

      const timeoutManager = new TimeoutManager({
        connection: 50,
        request: 50,
        operation: 100,
        global: 150,
      });

      const operations = [
        // These will timeout
        bulkhead.execute(async () =>
          timeoutManager.execute(async () => {
            await sleep(100);
            return 'timeout1';
          }, TimeoutLevel.REQUEST)
        ),
        // This should succeed
        bulkhead.execute(async () =>
          timeoutManager.execute(async () => {
            await sleep(10);
            return 'success';
          }, TimeoutLevel.REQUEST)
        ),
      ];

      const results = await Promise.allSettled(operations);

      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      if (results[1].status === 'fulfilled') {
        expect(results[1].value).toBe('success');
      }
    });
  });

  describe('RetryPolicy + FallbackChain', () => {
    it('should retry within each fallback strategy', async () => {
      const attemptCounts = { primary: 0, secondary: 0 };

      const retry = new RetryPolicy({
        maxAttempts: 2,
        baseDelay: 10,
        retryableErrors: ['CONNECTION_RESET'],
      });

      const strategies: FallbackStrategy<string>[] = [
        {
          name: 'primary',
          execute: async () =>
            retry.execute(async () => {
              attemptCounts.primary++;
              throw ConnectionError.reset('primary-endpoint');
            }),
        },
        {
          name: 'secondary',
          execute: async () =>
            retry.execute(async () => {
              attemptCounts.secondary++;
              if (attemptCounts.secondary < 2) {
                throw ConnectionError.reset('secondary-endpoint');
              }
              return 'success';
            }),
        },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.value).toBe('success');
      expect(attemptCounts.primary).toBe(3); // Initial + 2 retries
      expect(attemptCounts.secondary).toBe(2); // Initial fail + success on retry
    });
  });

  describe('Full Stack Integration', () => {
    it('should combine bulkhead, circuit breaker, retry, and fallback', async () => {
      // Setup: Bulkhead to limit concurrency
      const bulkhead = new BulkheadManager({
        maxConcurrent: 2,
        maxQueue: 5,
      });

      // Circuit breaker for primary service
      const primaryBreaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 200,
        volumeThreshold: 0,
        name: 'primary-service',
      });

      // Retry policy
      const retry = new RetryPolicy({
        maxAttempts: 2,
        baseDelay: 10,
        retryableErrors: ['CONNECTION_RESET'],
      });

      let primaryAttempts = 0;
      let secondaryAttempts = 0;

      // Fallback chain
      const strategies: FallbackStrategy<string>[] = [
        {
          name: 'primary',
          execute: async () =>
            primaryBreaker.execute(async () =>
              retry.execute(async () => {
                primaryAttempts++;
                throw ConnectionError.reset('primary-endpoint');
              })
            ),
        },
        {
          name: 'secondary',
          execute: async () =>
            retry.execute(async () => {
              secondaryAttempts++;
              if (secondaryAttempts < 2) {
                throw ConnectionError.reset('secondary-endpoint');
              }
              return 'secondary-success';
            }),
        },
      ];

      // Execute within bulkhead
      const result = await bulkhead.execute(async () => {
        const chain = new FallbackChain(strategies);
        return await chain.execute();
      });

      // Assertions
      expect(result.value).toBe('secondary-success');
      expect(result.strategyIndex).toBe(1);
      expect(primaryAttempts).toBe(3); // Initial + 2 retries
      expect(secondaryAttempts).toBe(2); // Initial fail + success on retry
      expect(bulkhead.getStats().totalExecuted).toBe(1);
      expect(primaryBreaker.getStats().failureCount).toBe(1); // One failure (after retries)
    });

    it('should handle high load with complete resilience stack', async () => {
      const bulkhead = new BulkheadManager({
        maxConcurrent: 3,
        maxQueue: 5,
      });

      const breaker = new CircuitBreaker({
        failureThreshold: 5,
        timeout: 500,
        name: 'service',
      });

      const retry = new RetryPolicy({
        maxAttempts: 2,
        baseDelay: 10,
      });

      const timeoutManager = new TimeoutManager({
        connection: 100,
        request: 100,
        operation: 200,
        global: 300,
      });

      let successCount = 0;
      let failureCount = 0;

      const createOperation = (id: number) => async () => {
        return await bulkhead.execute(async () => {
          return await breaker.execute(async () => {
            return await retry.execute(async () => {
              return await timeoutManager.execute(async () => {
                // Simulate some operations failing
                if (id % 3 === 0) {
                  await sleep(150); // Will timeout
                }

                if (id % 5 === 0) {
                  throw new Error('transient');
                }

                successCount++;
                return `result-${id}`;
              }, TimeoutLevel.REQUEST);
            });
          });
        });
      };

      // Execute 10 operations
      const operations = Array.from({ length: 10 }, (_, i) => createOperation(i)());

      const results = await Promise.allSettled(operations);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Some should succeed, some should fail
      expect(successful + failed).toBe(10);
      expect(successful).toBeGreaterThan(0);

      // Bulkhead should have processed all that didn't exceed capacity
      expect(bulkhead.getStats().totalExecuted).toBeGreaterThan(0);
    });
  });

  describe('Error Propagation', () => {
    it('should propagate errors through resilience layers', async () => {
      const retry = new RetryPolicy({ maxAttempts: 2, baseDelay: 10 });
      const breaker = new CircuitBreaker({ failureThreshold: 3, timeout: 100, name: 'error-propagation' });

      const operation = async () => {
        throw new Error('Application error');
      };

      try {
        await breaker.execute(async () => retry.execute(operation));
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Application error');
      }
    });

    it('should track errors across layers', async () => {
      const bulkhead = new BulkheadManager({ maxConcurrent: 2, maxQueue: 2 });
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 100, volumeThreshold: 0, name: 'error-tracking' });

      const errorOperation = async () => {
        throw new Error('Persistent error');
      };

      // Execute twice to test error tracking
      for (let i = 0; i < 2; i++) {
        try {
          await bulkhead.execute(async () => breaker.execute(errorOperation));
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getStats().failureCount).toBe(2);
      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources across all components', async () => {
      const bulkhead = new BulkheadManager({ maxConcurrent: 2, maxQueue: 2 });
      const timeoutManager = new TimeoutManager({
        connection: 50,
        request: 50,
        operation: 100,
        global: 150,
      });

      // Start some operations
      const op1 = bulkhead.execute(async () => {
        await sleep(20);
        return 'op1';
      });

      await sleep(10);

      // Clear bulkhead queue
      bulkhead.clearQueue();

      // Should still complete active operations
      const result = await op1;
      expect(result).toBe('op1');

      // Queue should be empty
      expect(bulkhead.getStats().queuedCount).toBe(0);
    });
  });
});
