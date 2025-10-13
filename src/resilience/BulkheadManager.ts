/**
 * Bulkhead configuration
 */
export interface BulkheadConfig {
  /**
   * Maximum concurrent operations
   * @default 10
   */
  maxConcurrent: number;

  /**
   * Maximum queue size for waiting operations
   * @default 50
   */
  maxQueue: number;

  /**
   * Timeout for queued operations (ms)
   * @default 5000
   */
  queueTimeout: number;

  /**
   * Bulkhead name for metrics/logging
   */
  name: string;
}

/**
 * Bulkhead statistics
 */
export interface BulkheadStats {
  /**
   * Currently executing operations
   */
  activeCount: number;

  /**
   * Operations waiting in queue
   */
  queuedCount: number;

  /**
   * Total operations executed
   */
  totalExecuted: number;

  /**
   * Total operations rejected (queue full)
   */
  totalRejected: number;

  /**
   * Total operations that timed out in queue
   */
  totalTimedOut: number;

  /**
   * Current load percentage (0-100)
   */
  loadPercentage: number;
}

/**
 * Queued operation
 * @private
 */
interface QueuedOperation<T> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  queuedAt: number;
  timeout: NodeJS.Timeout;
}

/**
 * Bulkhead pattern implementation for resource isolation
 * Limits concurrent operations and queues excess requests
 */
export class BulkheadManager {
  private config: BulkheadConfig;
  private activeCount: number;
  private queue: QueuedOperation<any>[];
  private stats: BulkheadStats;

  /**
   * Creates a new bulkhead
   * @param config - Bulkhead configuration
   */
  constructor(config: Partial<BulkheadConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      maxQueue: config.maxQueue ?? 50,
      queueTimeout: config.queueTimeout ?? 5000,
      name: config.name ?? 'bulkhead',
    };

    // Validate config
    if (this.config.maxConcurrent <= 0) {
      throw new Error('maxConcurrent must be positive');
    }
    if (this.config.maxQueue < 0) {
      throw new Error('maxQueue must be non-negative');
    }

    this.activeCount = 0;
    this.queue = [];
    this.stats = {
      activeCount: 0,
      queuedCount: 0,
      totalExecuted: 0,
      totalRejected: 0,
      totalTimedOut: 0,
      loadPercentage: 0,
    };
  }

  /**
   * Executes an operation through the bulkhead
   * @template T - Return type
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws Error if queue is full or operation times out
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.activeCount < this.config.maxConcurrent) {
      return await this.executeImmediately(operation);
    }

    // Need to queue - check if queue has space
    if (this.queue.length >= this.config.maxQueue) {
      this.stats.totalRejected++;
      throw new Error(
        `Bulkhead "${this.config.name}" queue is full (${this.config.maxQueue})`
      );
    }

    // Queue the operation
    return await this.enqueue(operation);
  }

  /**
   * Gets current bulkhead statistics
   * @returns Current stats
   */
  getStats(): Readonly<BulkheadStats> {
    return { ...this.stats };
  }

  /**
   * Checks if bulkhead has capacity
   * @returns True if can accept more operations
   */
  hasCapacity(): boolean {
    return (
      this.activeCount < this.config.maxConcurrent ||
      this.queue.length < this.config.maxQueue
    );
  }

  /**
   * Clears the queue (cancels all waiting operations)
   */
  clearQueue(): void {
    const error = new Error(`Bulkhead "${this.config.name}" queue cleared`);

    for (const queued of this.queue) {
      clearTimeout(queued.timeout);
      queued.reject(error);
    }

    this.queue = [];
    this.stats.queuedCount = 0;
    this.updateLoadPercentage();
  }

  /**
   * Executes operation immediately (no queueing)
   * @param operation - Operation to execute
   * @returns Result of operation
   * @private
   */
  private async executeImmediately<T>(operation: () => Promise<T>): Promise<T> {
    this.activeCount++;
    this.stats.activeCount = this.activeCount;
    this.updateLoadPercentage();

    try {
      const result = await operation();
      this.stats.totalExecuted++;
      return result;
    } finally {
      this.activeCount--;
      this.stats.activeCount = this.activeCount;
      this.updateLoadPercentage();

      // Process queue if available
      this.processQueue();
    }
  }

  /**
   * Enqueues operation for later execution
   * @param operation - Operation to enqueue
   * @returns Promise that resolves when operation executes
   * @private
   */
  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Create timeout for this queued operation
      const timeout = setTimeout(() => {
        this.removeFromQueue(queued);
        this.stats.totalTimedOut++;
        reject(
          new Error(
            `Operation timed out in queue after ${this.config.queueTimeout}ms`
          )
        );
      }, this.config.queueTimeout);

      const queued: QueuedOperation<T> = {
        operation,
        resolve,
        reject,
        queuedAt: Date.now(),
        timeout,
      };

      this.queue.push(queued);
      this.stats.queuedCount = this.queue.length;
      this.updateLoadPercentage();
    });
  }

  /**
   * Attempts to dequeue and execute next operation
   * @private
   */
  private processQueue(): void {
    // Check if we have capacity and operations waiting
    if (this.activeCount >= this.config.maxConcurrent || this.queue.length === 0) {
      return;
    }

    // Dequeue next operation (FIFO)
    const queued = this.queue.shift();
    if (!queued) {
      return;
    }

    clearTimeout(queued.timeout);
    this.stats.queuedCount = this.queue.length;
    this.updateLoadPercentage();

    // Execute the queued operation
    this.activeCount++;
    this.stats.activeCount = this.activeCount;
    this.updateLoadPercentage();

    queued
      .operation()
      .then((result) => {
        this.stats.totalExecuted++;
        queued.resolve(result);
      })
      .catch((error) => {
        queued.reject(error);
      })
      .finally(() => {
        this.activeCount--;
        this.stats.activeCount = this.activeCount;
        this.updateLoadPercentage();

        // Process next in queue
        this.processQueue();
      });
  }

  /**
   * Removes operation from queue
   * @param operation - Operation to remove
   * @private
   */
  private removeFromQueue(operation: QueuedOperation<any>): void {
    const index = this.queue.indexOf(operation);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.stats.queuedCount = this.queue.length;
      this.updateLoadPercentage();
    }
  }

  /**
   * Updates load percentage calculation
   * @private
   */
  private updateLoadPercentage(): void {
    const totalUsed = this.activeCount + this.queue.length;
    const totalCapacity = this.config.maxConcurrent + this.config.maxQueue;
    this.stats.loadPercentage = Math.round((totalUsed / totalCapacity) * 100);
  }
}
