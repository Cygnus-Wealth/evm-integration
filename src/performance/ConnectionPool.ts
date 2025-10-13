/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  /**
   * Minimum number of connections to maintain
   * @default 2
   */
  minConnections: number;

  /**
   * Maximum number of connections
   * @default 10
   */
  maxConnections: number;

  /**
   * Idle connection timeout (ms)
   * @default 30000
   */
  idleTimeout: number;

  /**
   * Connection establishment timeout (ms)
   * @default 5000
   */
  connectionTimeout: number;

  /**
   * Health check interval (ms)
   * @default 60000
   */
  healthCheckInterval: number;

  /**
   * Strategy for connection selection
   * @default 'LIFO'
   */
  strategy: 'LIFO' | 'FIFO' | 'ROUND_ROBIN';
}

/**
 * Connection wrapper with metadata
 * @private
 */
interface PooledConnection<T> {
  connection: T;
  id: string;
  createdAt: number;
  lastUsedAt: number;
  isHealthy: boolean;
  useCount: number;
}

/**
 * Connection pool statistics
 */
export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalCreated: number;
  totalDestroyed: number;
  totalReused: number;
  healthChecksFailed: number;
}

/**
 * Connection factory interface
 */
export interface ConnectionFactory<T> {
  /**
   * Creates a new connection
   * @returns New connection instance
   */
  create(): Promise<T>;

  /**
   * Destroys a connection
   * @param connection - Connection to destroy
   */
  destroy(connection: T): Promise<void>;

  /**
   * Checks if connection is healthy
   * @param connection - Connection to check
   * @returns True if healthy
   */
  isHealthy(connection: T): Promise<boolean>;
}

/**
 * Connection pool for efficient resource management
 * Maintains pool of reusable connections with health checking
 */
export class ConnectionPool<T> {
  private config: ConnectionPoolConfig;
  private factory: ConnectionFactory<T>;
  private available: PooledConnection<T>[];
  private active: Set<string>;
  private allConnections: Map<T, PooledConnection<T>>; // Track all connections
  private stats: PoolStats;
  private healthCheckInterval: NodeJS.Timeout;
  private roundRobinIndex: number;

  /**
   * Creates a new connection pool
   * @param factory - Connection factory
   * @param config - Pool configuration
   */
  constructor(
    factory: ConnectionFactory<T>,
    config: Partial<ConnectionPoolConfig> = {}
  ) {
    this.factory = factory;
    this.config = {
      minConnections: config.minConnections ?? 2,
      maxConnections: config.maxConnections ?? 10,
      idleTimeout: config.idleTimeout ?? 30000,
      connectionTimeout: config.connectionTimeout ?? 5000,
      healthCheckInterval: config.healthCheckInterval ?? 60000,
      strategy: config.strategy ?? 'LIFO',
    };

    this.available = [];
    this.active = new Set();
    this.allConnections = new Map();
    this.roundRobinIndex = 0;

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      totalCreated: 0,
      totalDestroyed: 0,
      totalReused: 0,
      healthChecksFailed: 0,
    };

    // Start with minimum connections
    this.ensureMinConnections().catch((error) => {
      console.error('Failed to initialize connection pool:', error);
    });

    // Start health check interval
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckInterval
    );
  }

  /**
   * Acquires a connection from the pool
   * @returns Connection instance
   * @throws Error if pool is exhausted and cannot create more
   */
  async acquire(): Promise<T> {
    // Try to get an available connection
    const pooled = this.selectConnection();

    if (pooled) {
      // Reuse existing connection
      this.available = this.available.filter((c) => c.id !== pooled.id);
      this.active.add(pooled.id);
      pooled.lastUsedAt = Date.now();
      pooled.useCount++;

      this.stats.activeConnections = this.active.size;
      this.stats.idleConnections = this.available.length;
      this.stats.totalReused++;

      return pooled.connection;
    }

    // Need to create a new connection
    if (this.stats.totalConnections >= this.config.maxConnections) {
      throw new Error('Connection pool exhausted');
    }

    const pooledConnection = await this.createConnection();
    this.active.add(pooledConnection.id);

    this.stats.activeConnections = this.active.size;
    this.stats.idleConnections = this.available.length;

    return pooledConnection.connection;
  }

  /**
   * Returns a connection to the pool
   * @param connection - Connection to return
   */
  async release(connection: T): Promise<void> {
    const pooled = this.findPooledConnection(connection);

    if (!pooled) {
      // Connection not from this pool
      return;
    }

    this.active.delete(pooled.id);
    pooled.lastUsedAt = Date.now();

    // Check if still healthy
    try {
      pooled.isHealthy = await this.factory.isHealthy(connection);
    } catch (error) {
      pooled.isHealthy = false;
    }

    if (!pooled.isHealthy) {
      // Destroy unhealthy connection
      await this.factory.destroy(connection);
      this.allConnections.delete(connection);
      this.stats.totalConnections--;
      this.stats.totalDestroyed++;

      // Ensure we maintain minimum connections
      this.ensureMinConnections();
    } else {
      // Return to available pool
      this.available.push(pooled);
    }

    this.stats.activeConnections = this.active.size;
    this.stats.idleConnections = this.available.length;
  }

  /**
   * Executes a function with a pooled connection
   * Automatically acquires and releases connection
   * @template R - Return type
   * @param fn - Function to execute with connection
   * @returns Result of function
   */
  async execute<R>(fn: (connection: T) => Promise<R>): Promise<R> {
    const connection = await this.acquire();

    try {
      return await fn(connection);
    } finally {
      await this.release(connection);
    }
  }

  /**
   * Gets pool statistics
   * @returns Current stats
   */
  getStats(): Readonly<PoolStats> {
    return { ...this.stats };
  }

  /**
   * Drains the pool (closes all connections)
   * @param force - If true, closes active connections immediately
   */
  async drain(force: boolean = false): Promise<void> {
    clearInterval(this.healthCheckInterval);

    // Close idle connections
    for (const pooled of this.available) {
      await this.factory.destroy(pooled.connection);
      this.stats.totalDestroyed++;
    }
    this.available = [];

    if (force) {
      // Force close active connections (not recommended)
      // In production, this would interrupt ongoing operations
      this.active.clear();
    }

    this.stats.totalConnections = this.active.size;
    this.stats.activeConnections = this.active.size;
    this.stats.idleConnections = 0;
  }

  /**
   * Ensures minimum connections are available
   * @private
   */
  private async ensureMinConnections(): Promise<void> {
    while (this.stats.totalConnections < this.config.minConnections) {
      try {
        const pooled = await this.createConnection();
        this.available.push(pooled);
        this.stats.idleConnections = this.available.length;
      } catch (error) {
        console.error('Failed to create minimum connection:', error);
        break;
      }
    }
  }

  /**
   * Creates a new connection
   * @private
   */
  private async createConnection(): Promise<PooledConnection<T>> {
    const connection = await this.factory.create();

    const pooled: PooledConnection<T> = {
      connection,
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      isHealthy: true,
      useCount: 0,
    };

    this.allConnections.set(connection, pooled);
    this.stats.totalConnections++;
    this.stats.totalCreated++;

    return pooled;
  }

  /**
   * Selects next connection based on strategy
   * @private
   */
  private selectConnection(): PooledConnection<T> | undefined {
    if (this.available.length === 0) {
      return undefined;
    }

    // Remove idle connections first
    this.removeIdleConnections();

    if (this.available.length === 0) {
      return undefined;
    }

    switch (this.config.strategy) {
      case 'LIFO':
        // Last in, first out - use most recently used
        return this.available[this.available.length - 1];

      case 'FIFO':
        // First in, first out - use oldest
        return this.available[0];

      case 'ROUND_ROBIN':
        // Round robin through available connections
        this.roundRobinIndex = this.roundRobinIndex % this.available.length;
        return this.available[this.roundRobinIndex++];

      default:
        return this.available[this.available.length - 1];
    }
  }

  /**
   * Removes idle connections exceeding timeout
   * @private
   */
  private removeIdleConnections(): void {
    const now = Date.now();
    this.available = this.available.filter((pooled) => {
      if (now - pooled.lastUsedAt > this.config.idleTimeout) {
        this.factory.destroy(pooled.connection).catch(console.error);
        this.allConnections.delete(pooled.connection);
        this.stats.totalConnections--;
        this.stats.totalDestroyed++;
        return false;
      }
      return true;
    });

    this.stats.idleConnections = this.available.length;
  }

  /**
   * Performs health checks on idle connections
   * @private
   */
  private async performHealthChecks(): Promise<void> {
    const healthChecks = this.available.map(async (pooled) => {
      try {
        pooled.isHealthy = await this.factory.isHealthy(pooled.connection);
        return pooled;
      } catch (error) {
        pooled.isHealthy = false;
        this.stats.healthChecksFailed++;
        return pooled;
      }
    });

    await Promise.all(healthChecks);

    // Remove unhealthy connections
    const healthyConnections: PooledConnection<T>[] = [];
    for (const pooled of this.available) {
      if (pooled.isHealthy) {
        healthyConnections.push(pooled);
      } else {
        await this.factory.destroy(pooled.connection);
        this.allConnections.delete(pooled.connection);
        this.stats.totalConnections--;
        this.stats.totalDestroyed++;
      }
    }

    this.available = healthyConnections;
    this.stats.idleConnections = this.available.length;

    // Ensure minimum connections
    this.ensureMinConnections();
  }

  /**
   * Finds pooled connection by instance
   * @param connection - Connection instance
   * @private
   */
  private findPooledConnection(connection: T): PooledConnection<T> | undefined {
    return this.allConnections.get(connection);
  }

  /**
   * Destroys connection pool
   */
  async destroy(): Promise<void> {
    await this.drain(true);
  }
}
