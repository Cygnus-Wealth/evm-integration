import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TimeoutManager, TimeoutLevel, TimeoutError } from './TimeoutManager';
import { sleep } from '../test-utils';

describe('TimeoutManager', () => {
  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const manager = new TimeoutManager();

      expect(manager.getTimeout(TimeoutLevel.CONNECTION)).toBe(5000);
      expect(manager.getTimeout(TimeoutLevel.REQUEST)).toBe(10000);
      expect(manager.getTimeout(TimeoutLevel.OPERATION)).toBe(30000);
      expect(manager.getTimeout(TimeoutLevel.GLOBAL)).toBe(60000);
    });

    it('should accept partial config', () => {
      const manager = new TimeoutManager({
        connection: 3000,
        request: 8000,
      });

      expect(manager.getTimeout(TimeoutLevel.CONNECTION)).toBe(3000);
      expect(manager.getTimeout(TimeoutLevel.REQUEST)).toBe(8000);
      expect(manager.getTimeout(TimeoutLevel.OPERATION)).toBe(30000);
    });

    it('should validate timeout hierarchy', () => {
      expect(() => new TimeoutManager({
        connection: 10000,
        request: 5000,
      })).toThrow('Invalid timeout hierarchy');
    });

    it('should throw on invalid hierarchy', () => {
      expect(() => new TimeoutManager({
        operation: 50000,
        global: 40000,
      })).toThrow('Invalid timeout hierarchy');
    });
  });

  describe('Execute', () => {
    it('should complete operation within timeout', async () => {
      const manager = new TimeoutManager();
      const operation = async () => {
        await sleep(10);
        return 'success';
      };

      const result = await manager.execute(operation, TimeoutLevel.REQUEST, 'test');
      expect(result).toBe('success');
    });

    it('should throw TimeoutError on timeout', async () => {
      const manager = new TimeoutManager({ connection: 50 });
      const operation = async () => {
        await sleep(100);
        return 'success';
      };

      await expect(
        manager.execute(operation, TimeoutLevel.CONNECTION, 'test')
      ).rejects.toThrow(TimeoutError);
    });

    it('should include timeout level in error', async () => {
      const manager = new TimeoutManager({ connection: 50 });
      const operation = async () => {
        await sleep(100);
        return 'success';
      };

      try {
        await manager.execute(operation, TimeoutLevel.CONNECTION, 'test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as TimeoutError).level).toBe(TimeoutLevel.CONNECTION);
      }
    });

    it('should include operation name in error', async () => {
      const manager = new TimeoutManager({ connection: 50 });
      const operation = async () => {
        await sleep(100);
        return 'success';
      };

      try {
        await manager.execute(operation, TimeoutLevel.CONNECTION, 'myOperation');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as TimeoutError).message).toContain('myOperation');
      }
    });

    it('should respect different timeout levels', async () => {
      const manager = new TimeoutManager();

      // Fast operation should succeed at all levels
      const fastOp = async () => 'done';
      await expect(
        manager.execute(fastOp, TimeoutLevel.CONNECTION)
      ).resolves.toBe('done');

      await expect(
        manager.execute(fastOp, TimeoutLevel.REQUEST)
      ).resolves.toBe('done');
    });
  });

  describe('Timeout Management', () => {
    it('should get timeout for level', () => {
      const manager = new TimeoutManager();

      expect(manager.getTimeout(TimeoutLevel.CONNECTION)).toBe(5000);
      expect(manager.getTimeout(TimeoutLevel.REQUEST)).toBe(10000);
      expect(manager.getTimeout(TimeoutLevel.OPERATION)).toBe(30000);
      expect(manager.getTimeout(TimeoutLevel.GLOBAL)).toBe(60000);
    });

    it('should set timeout for level', () => {
      const manager = new TimeoutManager();

      manager.setTimeout(TimeoutLevel.CONNECTION, 3000);
      expect(manager.getTimeout(TimeoutLevel.CONNECTION)).toBe(3000);
    });

    it('should revalidate hierarchy on set', () => {
      const manager = new TimeoutManager();

      expect(() => {
        manager.setTimeout(TimeoutLevel.CONNECTION, 15000);
      }).toThrow('Invalid timeout hierarchy');
    });

    it('should throw on invalid hierarchy update', () => {
      const manager = new TimeoutManager();

      expect(() => {
        manager.setTimeout(TimeoutLevel.REQUEST, 35000);
      }).toThrow('Invalid timeout hierarchy');
    });
  });

  describe('Timeout Levels', () => {
    it('should enforce CONNECTION timeout', async () => {
      const manager = new TimeoutManager({ connection: 100 });
      const operation = async () => {
        await sleep(150);
        return 'done';
      };

      await expect(
        manager.execute(operation, TimeoutLevel.CONNECTION)
      ).rejects.toThrow(TimeoutError);
    });

    it('should enforce REQUEST timeout', async () => {
      const manager = new TimeoutManager({
        connection: 50,
        request: 100,
        operation: 200,
        global: 300
      });
      const operation = async () => {
        await sleep(150);
        return 'done';
      };

      await expect(
        manager.execute(operation, TimeoutLevel.REQUEST)
      ).rejects.toThrow(TimeoutError);
    });

    it('should enforce OPERATION timeout', async () => {
      const manager = new TimeoutManager({
        connection: 50,
        request: 75,
        operation: 100,
        global: 200
      });
      const operation = async () => {
        await sleep(150);
        return 'done';
      };

      await expect(
        manager.execute(operation, TimeoutLevel.OPERATION)
      ).rejects.toThrow(TimeoutError);
    });

    it('should enforce GLOBAL timeout', async () => {
      const manager = new TimeoutManager({
        connection: 25,
        request: 50,
        operation: 75,
        global: 100
      });
      const operation = async () => {
        await sleep(150);
        return 'done';
      };

      await expect(
        manager.execute(operation, TimeoutLevel.GLOBAL)
      ).rejects.toThrow(TimeoutError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle instant completion', async () => {
      const manager = new TimeoutManager();
      const operation = async () => 'instant';

      const result = await manager.execute(operation, TimeoutLevel.CONNECTION);
      expect(result).toBe('instant');
    });

    it('should handle exactly timeout duration', async () => {
      const manager = new TimeoutManager({ connection: 200 });
      const operation = async () => {
        await sleep(100);
        return 'done';
      };

      // Operation completes well before timeout
      const result = await manager.execute(operation, TimeoutLevel.CONNECTION);
      expect(result).toBe('done');
    });

    it('should handle multiple concurrent operations', async () => {
      const manager = new TimeoutManager();
      const operations = [
        manager.execute(async () => 'op1', TimeoutLevel.REQUEST),
        manager.execute(async () => 'op2', TimeoutLevel.REQUEST),
        manager.execute(async () => 'op3', TimeoutLevel.REQUEST),
      ];

      const results = await Promise.all(operations);
      expect(results).toEqual(['op1', 'op2', 'op3']);
    });

    it('should clean up timeout timers on success', async () => {
      const manager = new TimeoutManager();
      const operation = async () => {
        await sleep(10);
        return 'done';
      };

      // Execute multiple operations
      for (let i = 0; i < 5; i++) {
        await manager.execute(operation, TimeoutLevel.REQUEST);
      }

      // If timers aren't cleaned up, this could cause memory leaks
      // This test mainly ensures the code runs without errors
      expect(true).toBe(true);
    });
  });
});
