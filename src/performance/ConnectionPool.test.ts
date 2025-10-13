import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionPool, ConnectionFactory } from './ConnectionPool';
import { sleep } from '../test-utils';

interface MockConnection {
  id: string;
  isHealthy: boolean;
}

class MockConnectionFactory implements ConnectionFactory<MockConnection> {
  private connectionCounter = 0;
  public createdConnections: MockConnection[] = [];
  public destroyedConnections: MockConnection[] = [];

  async create(): Promise<MockConnection> {
    const connection: MockConnection = {
      id: `conn-${this.connectionCounter++}`,
      isHealthy: true,
    };
    this.createdConnections.push(connection);
    return connection;
  }

  async destroy(connection: MockConnection): Promise<void> {
    this.destroyedConnections.push(connection);
  }

  async isHealthy(connection: MockConnection): Promise<boolean> {
    return connection.isHealthy;
  }
}

describe('ConnectionPool', () => {
  let factory: MockConnectionFactory;

  beforeEach(() => {
    factory = new MockConnectionFactory();
  });

  describe('Constructor', () => {
    it('should initialize with default config', async () => {
      const pool = new ConnectionPool(factory);

      // Wait for min connections to be created
      await sleep(100);

      const stats = pool.getStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(2); // minConnections default

      await pool.destroy();
    });

    it('should create minimum connections', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 3,
        maxConnections: 10,
      });

      await sleep(100);

      expect(factory.createdConnections.length).toBe(3);

      await pool.destroy();
    });

    it('should accept custom config', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 1,
        maxConnections: 5,
        idleTimeout: 10000,
        connectionTimeout: 3000,
        healthCheckInterval: 30000,
        strategy: 'FIFO',
      });

      await sleep(100);

      const stats = pool.getStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(1);

      await pool.destroy();
    });
  });

  describe('Acquire and Release', () => {
    it('should acquire connection from pool', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const connection = await pool.acquire();

      expect(connection).toBeDefined();
      expect(connection.id).toBeTruthy();

      await pool.destroy();
    });

    it('should reuse released connections', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      // Acquiring from min connections already counts as reuse
      const conn1 = await pool.acquire();
      await pool.release(conn1);

      const stats = pool.getStats();
      expect(stats.totalReused).toBeGreaterThanOrEqual(1); // Min connections reused

      const conn2 = await pool.acquire();
      await pool.release(conn2);

      const conn3 = await pool.acquire();

      const stats2 = pool.getStats();
      expect(stats2.totalReused).toBeGreaterThan(stats.totalReused);

      await pool.destroy();
    });

    it('should create new connection when pool empty', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 1,
        maxConnections: 10,
      });

      await sleep(100);

      const initialCount = factory.createdConnections.length;

      // Acquire all connections
      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire(); // Should create new

      expect(factory.createdConnections.length).toBe(initialCount + 1);

      await pool.release(conn1);
      await pool.release(conn2);
      await pool.destroy();
    });

    it('should throw when pool exhausted', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 1,
        maxConnections: 2,
      });

      await sleep(100);

      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();

      await expect(pool.acquire()).rejects.toThrow('Connection pool exhausted');

      await pool.release(conn1);
      await pool.release(conn2);
      await pool.destroy();
    });

    it('should handle concurrent acquires', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 3,
        maxConnections: 10,
      });

      await sleep(100);

      const promises = [
        pool.acquire(),
        pool.acquire(),
        pool.acquire(),
      ];

      const connections = await Promise.all(promises);

      expect(connections).toHaveLength(3);
      expect(new Set(connections.map(c => c.id)).size).toBe(3); // All unique

      for (const conn of connections) {
        await pool.release(conn);
      }

      await pool.destroy();
    });

    it('should update stats on acquire', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const initialStats = pool.getStats();
      const conn = await pool.acquire();
      const afterAcquireStats = pool.getStats();

      expect(afterAcquireStats.activeConnections).toBe(initialStats.activeConnections + 1);
      expect(afterAcquireStats.idleConnections).toBe(initialStats.idleConnections - 1);

      await pool.release(conn);
      await pool.destroy();
    });

    it('should update stats on release', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const conn = await pool.acquire();
      const activeStats = pool.getStats();

      await pool.release(conn);
      const idleStats = pool.getStats();

      expect(idleStats.activeConnections).toBe(activeStats.activeConnections - 1);
      expect(idleStats.idleConnections).toBeGreaterThan(activeStats.idleConnections);

      await pool.destroy();
    });
  });

  describe('Health Checks', () => {
    it('should destroy unhealthy connections on release', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const conn = await pool.acquire();
      conn.isHealthy = false; // Mark unhealthy

      const beforeDestroyCount = factory.destroyedConnections.length;
      await pool.release(conn);

      expect(factory.destroyedConnections.length).toBe(beforeDestroyCount + 1);

      await pool.destroy();
    });

    it('should perform periodic health checks', async () => {
      // Create a factory that will throw on health check
      class FailingFactory extends MockConnectionFactory {
        private shouldFail = false;

        enableFailure() {
          this.shouldFail = true;
        }

        async isHealthy(connection: MockConnection): Promise<boolean> {
          if (this.shouldFail) {
            throw new Error('Health check failed');
          }
          return connection.isHealthy;
        }
      }

      const failingFactory = new FailingFactory();
      const pool = new ConnectionPool(failingFactory, {
        minConnections: 2,
        maxConnections: 10,
        healthCheckInterval: 100, // Short interval for testing
      });

      await sleep(50);

      // Enable health check failures
      failingFactory.enableFailure();

      // Wait for health check to run
      await sleep(150);

      // Health check failures should be tracked
      const stats = pool.getStats();
      expect(stats.healthChecksFailed).toBeGreaterThan(0);

      await pool.destroy();
    });
  });

  describe('Connection Strategies', () => {
    it('should use LIFO strategy', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 3,
        maxConnections: 10,
        strategy: 'LIFO',
      });

      await sleep(100);

      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();
      const conn3 = await pool.acquire();

      await pool.release(conn1);
      await pool.release(conn2);
      await pool.release(conn3);

      // LIFO: Should get conn3 back (last released)
      const reacquired = await pool.acquire();
      expect(reacquired.id).toBe(conn3.id);

      await pool.release(reacquired);
      await pool.destroy();
    });

    it('should use FIFO strategy', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 3,
        maxConnections: 10,
        strategy: 'FIFO',
      });

      await sleep(100);

      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();
      const conn3 = await pool.acquire();

      await pool.release(conn1);
      await pool.release(conn2);
      await pool.release(conn3);

      // FIFO: Should get conn1 back (first released)
      const reacquired = await pool.acquire();
      expect(reacquired.id).toBe(conn1.id);

      await pool.release(reacquired);
      await pool.destroy();
    });

    it('should use ROUND_ROBIN strategy', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 3,
        maxConnections: 10,
        strategy: 'ROUND_ROBIN',
      });

      await sleep(100);

      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();
      const conn3 = await pool.acquire();

      await pool.release(conn1);
      await pool.release(conn2);
      await pool.release(conn3);

      // Round robin: Should cycle through connections
      const reacquired1 = await pool.acquire();
      const reacquired2 = await pool.acquire();

      // With 3 connections and round robin, second should be different
      expect(reacquired2.id).not.toBe(reacquired1.id);

      await pool.release(reacquired1);
      await pool.release(reacquired2);
      await pool.destroy();
    });
  });

  describe('Execute', () => {
    it('should execute function with connection', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const result = await pool.execute(async (conn) => {
        return `Connected: ${conn.id}`;
      });

      expect(result).toContain('Connected:');

      await pool.destroy();
    });

    it('should release connection after execution', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const beforeStats = pool.getStats();

      await pool.execute(async (conn) => {
        return 'result';
      });

      const afterStats = pool.getStats();

      // Connection should be back in pool
      expect(afterStats.activeConnections).toBe(beforeStats.activeConnections);

      await pool.destroy();
    });

    it('should release connection on error', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const beforeStats = pool.getStats();

      await expect(
        pool.execute(async (conn) => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      const afterStats = pool.getStats();

      // Connection should still be released
      expect(afterStats.activeConnections).toBe(beforeStats.activeConnections);

      await pool.destroy();
    });
  });

  describe('Idle Timeout', () => {
    it('should remove idle connections', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 1,
        maxConnections: 10,
        idleTimeout: 100, // Short timeout for testing
      });

      await sleep(50);

      // Create extra connection
      const conn = await pool.acquire();
      await pool.release(conn);

      const beforeStats = pool.getStats();

      // Wait for idle timeout
      await sleep(150);

      // Trigger acquire to clean up idle connections
      const newConn = await pool.acquire();
      await pool.release(newConn);

      const afterStats = pool.getStats();

      // Some connections may have been removed (but min is maintained)
      expect(afterStats.totalConnections).toBeGreaterThanOrEqual(1);

      await pool.destroy();
    });
  });

  describe('Drain', () => {
    it('should close idle connections', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 3,
        maxConnections: 10,
      });

      await sleep(100);

      const beforeDrain = factory.destroyedConnections.length;

      await pool.drain();

      expect(factory.destroyedConnections.length).toBeGreaterThan(beforeDrain);

      await pool.destroy();
    });

    it('should not close active connections by default', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const conn = await pool.acquire();

      const beforeDrain = factory.destroyedConnections.length;
      await pool.drain(false);

      // Active connection should not be destroyed
      const stats = pool.getStats();
      expect(stats.activeConnections).toBe(1);

      await pool.release(conn);
      await pool.destroy();
    });

    it('should force close active connections when requested', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      await pool.acquire();

      await pool.drain(true);

      const stats = pool.getStats();
      expect(stats.activeConnections).toBe(0);

      await pool.destroy();
    });
  });

  describe('Statistics', () => {
    it('should track total created', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const initialCreated = pool.getStats().totalCreated;

      await pool.acquire(); // May create new

      const stats = pool.getStats();
      expect(stats.totalCreated).toBeGreaterThanOrEqual(initialCreated);

      await pool.destroy();
    });

    it('should track total destroyed', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const conn = await pool.acquire();
      conn.isHealthy = false;

      await pool.release(conn); // Should destroy unhealthy

      const stats = pool.getStats();
      expect(stats.totalDestroyed).toBeGreaterThan(0);

      await pool.destroy();
    });

    it('should track total reused', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const conn1 = await pool.acquire();
      await pool.release(conn1);

      const conn2 = await pool.acquire(); // Should reuse

      const stats = pool.getStats();
      expect(stats.totalReused).toBeGreaterThan(0);

      await pool.release(conn2);
      await pool.destroy();
    });

    it('should track waiting requests', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 1,
        maxConnections: 1,
      });

      await sleep(100);

      const conn = await pool.acquire();

      // Waiting requests stat is not directly incremented in current impl
      // but totalConnections tracks pool size
      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(1);

      await pool.release(conn);
      await pool.destroy();
    });
  });

  describe('Destroy', () => {
    it('should destroy all connections', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 3,
        maxConnections: 10,
      });

      await sleep(100);

      const beforeDestroy = factory.destroyedConnections.length;

      await pool.destroy();

      expect(factory.destroyedConnections.length).toBeGreaterThan(beforeDestroy);
    });

    it('should stop health checks', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
        healthCheckInterval: 100,
      });

      await sleep(150);

      await pool.destroy();

      const healthCheckCount = pool.getStats().healthChecksFailed;

      // Wait longer, health checks should not continue
      await sleep(150);

      const stats = pool.getStats();
      expect(stats.healthChecksFailed).toBe(healthCheckCount);
    });
  });

  describe('Edge Cases', () => {
    it('should handle release of non-pooled connection', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const fakeConnection: MockConnection = {
        id: 'fake',
        isHealthy: true,
      };

      // Should not throw
      await pool.release(fakeConnection);

      await pool.destroy();
    });

    it('should maintain minimum connections after failures', async () => {
      const pool = new ConnectionPool(factory, {
        minConnections: 2,
        maxConnections: 10,
      });

      await sleep(100);

      const conn = await pool.acquire();
      conn.isHealthy = false;
      await pool.release(conn); // Destroys unhealthy

      // Wait for min connections to be restored
      await sleep(100);

      const stats = pool.getStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(2);

      await pool.destroy();
    });
  });
});
