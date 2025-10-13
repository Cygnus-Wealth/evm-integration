/**
 * Batch configuration
 */
export interface BatchConfig {
  /**
   * Time window for collecting requests (ms)
   * @default 50
   */
  windowMs: number;

  /**
   * Maximum requests per batch
   * @default 50
   */
  maxSize: number;

  /**
   * Flush automatically on window close
   * @default true
   */
  autoFlush: boolean;

  /**
   * Name for metrics/logging
   */
  name?: string;
}

/**
 * Batched request
 * @private
 */
interface BatchedRequest<T, R> {
  request: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  addedAt: number;
}

/**
 * Batch statistics
 */
export interface BatchStats {
  totalBatches: number;
  totalRequests: number;
  averageBatchSize: number;
  largestBatch: number;
  smallestBatch: number;
}

/**
 * Batch processor for combining multiple requests
 * Reduces RPC calls by batching requests within a time window
 */
export class BatchProcessor<TRequest, TResponse> {
  private config: BatchConfig;
  private queue: BatchedRequest<TRequest, TResponse>[];
  private timer: NodeJS.Timeout | null;
  private processor: (requests: TRequest[]) => Promise<TResponse[]>;
  private stats: BatchStats;

  /**
   * Creates a new batch processor
   * @param processor - Function to process a batch of requests
   * @param config - Batch configuration
   */
  constructor(
    processor: (requests: TRequest[]) => Promise<TResponse[]>,
    config: Partial<BatchConfig> = {}
  ) {
    this.processor = processor;
    this.config = {
      windowMs: config.windowMs ?? 50,
      maxSize: config.maxSize ?? 50,
      autoFlush: config.autoFlush ?? true,
      name: config.name,
    };

    this.queue = [];
    this.timer = null;
    this.stats = {
      totalBatches: 0,
      totalRequests: 0,
      averageBatchSize: 0,
      largestBatch: 0,
      smallestBatch: Infinity,
    };
  }

  /**
   * Adds a request to the batch
   * @param request - Request to add
   * @returns Promise that resolves with the response
   */
  async add(request: TRequest): Promise<TResponse> {
    return new Promise<TResponse>((resolve, reject) => {
      const batchedRequest: BatchedRequest<TRequest, TResponse> = {
        request,
        resolve,
        reject,
        addedAt: Date.now(),
      };

      this.queue.push(batchedRequest);

      // Start timer on first request
      if (this.queue.length === 1) {
        this.startTimer();
      }

      // Flush immediately if we hit max size
      if (this.queue.length >= this.config.maxSize) {
        this.stopTimer();
        this.processBatch();
      }
    });
  }

  /**
   * Manually flushes the current batch
   * @returns Number of requests flushed
   */
  async flush(): Promise<number> {
    this.stopTimer();
    const count = this.queue.length;
    if (count > 0) {
      await this.processBatch();
    }
    return count;
  }

  /**
   * Gets batch statistics
   * @returns Current stats
   */
  getStats(): Readonly<BatchStats> {
    return { ...this.stats };
  }

  /**
   * Clears pending requests
   * @param error - Error to reject pending requests with
   */
  clear(error?: Error): void {
    this.stopTimer();

    const defaultError = error || new Error('Batch processor cleared');
    for (const item of this.queue) {
      item.reject(defaultError);
    }

    this.queue = [];
  }

  /**
   * Starts the batch window timer
   * @private
   */
  private startTimer(): void {
    if (this.config.autoFlush && !this.timer) {
      this.timer = setTimeout(() => {
        this.processBatch();
      }, this.config.windowMs);
    }
  }

  /**
   * Stops the batch window timer
   * @private
   */
  private stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Processes the current batch
   * @private
   */
  private async processBatch(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    // Get current queue and reset
    const batch = [...this.queue];
    this.queue = [];

    // Update stats
    this.updateStats(batch.length);

    try {
      // Extract requests
      const requests = batch.map((item) => item.request);

      // Process batch
      const results = await this.processor(requests);

      // Resolve promises
      if (results.length !== batch.length) {
        throw new Error(
          `Batch processor returned ${results.length} results but expected ${batch.length}`
        );
      }

      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(results[i]);
      }
    } catch (error) {
      // Reject all promises on error
      for (const item of batch) {
        item.reject(error as Error);
      }
    }
  }

  /**
   * Updates batch statistics
   * @param batchSize - Size of processed batch
   * @private
   */
  private updateStats(batchSize: number): void {
    this.stats.totalBatches++;
    this.stats.totalRequests += batchSize;
    this.stats.averageBatchSize = this.stats.totalRequests / this.stats.totalBatches;
    this.stats.largestBatch = Math.max(this.stats.largestBatch, batchSize);
    this.stats.smallestBatch = Math.min(this.stats.smallestBatch, batchSize);
  }

  /**
   * Destroys batch processor
   */
  destroy(): void {
    this.clear(new Error('Batch processor destroyed'));
  }
}
