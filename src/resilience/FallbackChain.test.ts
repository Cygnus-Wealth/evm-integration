import { describe, it, expect, vi } from 'vitest';
import { FallbackChain, FallbackStrategy } from './FallbackChain';
import { sleep } from '../test-utils';

describe('FallbackChain', () => {
  describe('Constructor', () => {
    it('should accept strategies array', () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 'strategy1', execute: async () => 'result' },
      ];

      const chain = new FallbackChain(strategies);
      expect(chain.getStrategyNames()).toEqual(['strategy1']);
    });

    it('should accept optional default value', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 'strategy1', execute: async () => { throw new Error('fail'); } },
      ];

      const chain = new FallbackChain(strategies, 'default');
      const result = await chain.execute();

      expect(result.value).toBe('default');
      expect(result.success).toBe(true);
    });

    it('should throw on empty strategies', () => {
      expect(() => new FallbackChain([])).toThrow('At least one strategy is required');
    });
  });

  describe('Execute', () => {
    it('should return first successful strategy', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 'primary', execute: async () => 'primary-result' },
        { name: 'secondary', execute: async () => 'secondary-result' },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.value).toBe('primary-result');
      expect(result.strategyIndex).toBe(0);
      expect(result.strategyName).toBe('primary');
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should try second strategy on first failure', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 'primary', execute: async () => { throw new Error('primary failed'); } },
        { name: 'secondary', execute: async () => 'secondary-result' },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.value).toBe('secondary-result');
      expect(result.strategyIndex).toBe(1);
      expect(result.strategyName).toBe('secondary');
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(1);
    });

    it('should try all strategies in order', async () => {
      const executionOrder: string[] = [];

      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => { executionOrder.push('s1'); throw new Error('fail'); } },
        { name: 's2', execute: async () => { executionOrder.push('s2'); throw new Error('fail'); } },
        { name: 's3', execute: async () => { executionOrder.push('s3'); return 's3-result'; } },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(executionOrder).toEqual(['s1', 's2', 's3']);
      expect(result.value).toBe('s3-result');
      expect(result.strategyIndex).toBe(2);
    });

    it('should return default value if all fail', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => { throw new Error('fail1'); } },
        { name: 's2', execute: async () => { throw new Error('fail2'); } },
      ];

      const chain = new FallbackChain(strategies, 'default-value');
      const result = await chain.execute();

      expect(result.value).toBe('default-value');
      expect(result.strategyIndex).toBe(-1);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(2);
    });

    it('should throw if no default and all fail', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => { throw new Error('fail1'); } },
        { name: 's2', execute: async () => { throw new Error('fail2'); } },
      ];

      const chain = new FallbackChain(strategies);

      await expect(chain.execute()).rejects.toThrow('All fallback strategies failed');
    });

    it('should skip strategies with shouldAttempt = false', async () => {
      const executionOrder: string[] = [];

      const strategies: FallbackStrategy<string>[] = [
        {
          name: 's1',
          execute: async () => { executionOrder.push('s1'); throw new Error('fail'); },
        },
        {
          name: 's2',
          execute: async () => { executionOrder.push('s2'); return 's2-result'; },
          shouldAttempt: () => false, // Skip this
        },
        {
          name: 's3',
          execute: async () => { executionOrder.push('s3'); return 's3-result'; },
        },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(executionOrder).toEqual(['s1', 's3']); // s2 was skipped
      expect(result.value).toBe('s3-result');
      expect(result.strategyIndex).toBe(2);
    });

    it('should respect per-strategy timeouts', async () => {
      const strategies: FallbackStrategy<string>[] = [
        {
          name: 's1',
          execute: async () => {
            await sleep(100);
            return 's1-result';
          },
          timeout: 50, // Will timeout
        },
        {
          name: 's2',
          execute: async () => 's2-result',
        },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.value).toBe('s2-result');
      expect(result.strategyIndex).toBe(1);
      expect(result.errors[0].message).toContain('timed out');
    });
  });

  describe('Strategy Management', () => {
    it('should add strategy at end', () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => 's1' },
      ];

      const chain = new FallbackChain(strategies);
      chain.addStrategy({ name: 's2', execute: async () => 's2' });

      expect(chain.getStrategyNames()).toEqual(['s1', 's2']);
    });

    it('should add strategy at specific index', () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => 's1' },
        { name: 's3', execute: async () => 's3' },
      ];

      const chain = new FallbackChain(strategies);
      chain.addStrategy({ name: 's2', execute: async () => 's2' }, 1);

      expect(chain.getStrategyNames()).toEqual(['s1', 's2', 's3']);
    });

    it('should remove strategy by name', () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => 's1' },
        { name: 's2', execute: async () => 's2' },
        { name: 's3', execute: async () => 's3' },
      ];

      const chain = new FallbackChain(strategies);
      const removed = chain.removeStrategy('s2');

      expect(removed).toBe(true);
      expect(chain.getStrategyNames()).toEqual(['s1', 's3']);
    });

    it('should return false when removing non-existent strategy', () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => 's1' },
      ];

      const chain = new FallbackChain(strategies);
      const removed = chain.removeStrategy('nonexistent');

      expect(removed).toBe(false);
      expect(chain.getStrategyNames()).toEqual(['s1']);
    });

    it('should get strategy names in order', () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 'primary', execute: async () => 'p' },
        { name: 'secondary', execute: async () => 's' },
        { name: 'tertiary', execute: async () => 't' },
      ];

      const chain = new FallbackChain(strategies);

      expect(chain.getStrategyNames()).toEqual(['primary', 'secondary', 'tertiary']);
    });
  });

  describe('Result Metadata', () => {
    it('should include strategy index', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => { throw new Error('fail'); } },
        { name: 's2', execute: async () => 's2-result' },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.strategyIndex).toBe(1);
    });

    it('should include strategy name', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 'primary', execute: async () => 'result' },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.strategyName).toBe('primary');
    });

    it('should collect all errors', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 's1', execute: async () => { throw new Error('error1'); } },
        { name: 's2', execute: async () => { throw new Error('error2'); } },
        { name: 's3', execute: async () => 's3-result' },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].message).toBe('error1');
      expect(result.errors[1].message).toBe('error2');
    });

    it('should track total duration', async () => {
      const strategies: FallbackStrategy<string>[] = [
        {
          name: 's1',
          execute: async () => {
            await sleep(50);
            return 'result';
          },
        },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.duration).toBeGreaterThanOrEqual(40); // Allow some timing variance
      expect(result.duration).toBeLessThan(200);
    });

    it('should indicate success/failure', async () => {
      const successChain = new FallbackChain([
        { name: 's1', execute: async () => 'result' },
      ]);

      const successResult = await successChain.execute();
      expect(successResult.success).toBe(true);

      const failChain = new FallbackChain(
        [{ name: 's1', execute: async () => { throw new Error('fail'); } }],
        'default'
      );

      const failResult = await failChain.execute();
      expect(failResult.success).toBe(true); // Has default value
    });
  });

  describe('Edge Cases', () => {
    it('should handle single strategy', async () => {
      const strategies: FallbackStrategy<string>[] = [
        { name: 'only', execute: async () => 'result' },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.value).toBe('result');
      expect(result.strategyIndex).toBe(0);
    });

    it('should handle all strategies timing out', async () => {
      const strategies: FallbackStrategy<string>[] = [
        {
          name: 's1',
          execute: async () => {
            await sleep(100);
            return 's1';
          },
          timeout: 10,
        },
        {
          name: 's2',
          execute: async () => {
            await sleep(100);
            return 's2';
          },
          timeout: 10,
        },
      ];

      const chain = new FallbackChain(strategies, 'default');
      const result = await chain.execute();

      expect(result.value).toBe('default');
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].message).toContain('timed out');
    });

    it('should handle strategies that throw synchronously', async () => {
      const strategies: FallbackStrategy<string>[] = [
        {
          name: 's1',
          execute: () => {
            throw new Error('sync error');
          },
        },
        { name: 's2', execute: async () => 's2-result' },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(result.value).toBe('s2-result');
      expect(result.strategyIndex).toBe(1);
    });

    it('should handle async shouldAttempt predicate', async () => {
      const executionOrder: string[] = [];

      const strategies: FallbackStrategy<string>[] = [
        {
          name: 's1',
          execute: async () => { executionOrder.push('s1'); throw new Error('fail'); },
        },
        {
          name: 's2',
          execute: async () => { executionOrder.push('s2'); return 's2-result'; },
          shouldAttempt: async () => {
            await sleep(10);
            return false;
          },
        },
        {
          name: 's3',
          execute: async () => { executionOrder.push('s3'); return 's3-result'; },
        },
      ];

      const chain = new FallbackChain(strategies);
      const result = await chain.execute();

      expect(executionOrder).toEqual(['s1', 's3']); // s2 skipped
      expect(result.value).toBe('s3-result');
    });
  });
});
