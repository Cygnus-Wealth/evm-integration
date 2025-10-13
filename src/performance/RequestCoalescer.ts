/**
 * Coalesced request metadata
 * @private
 */
interface CoalescedRequest<T> {
  promise: Promise<T>;
  createdAt: number;
  subscribers: number;
}

/**
 * Coalescer statistics
 */
export interface CoalescerStats {
  totalRequests: number;
  coalescedRequests: number;
  uniqueRequests: number;
  coalesceRate: number;
  activeRequests: number;
}

/**
 * Request coalescer for deduplicating concurrent requests
 * Prevents multiple identical requests from executing simultaneously
 */
export class RequestCoalescer {
  private pending: Map<string, CoalescedRequest<any>>;
  private stats: CoalescerStats;
  private cleanupInterval: NodeJS.Timeout;

  /**
   * Creates a new request coalescer
   */
  constructor() {
    this.pending = new Map();
    this.stats = {
      totalRequests: 0,
      coalescedRequests: 0,
      uniqueRequests: 0,
      coalesceRate: 0,
      activeRequests: 0,
    };

    // Periodic cleanup of stale entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.periodicCleanup(), 300000);
  }

  /**
   * Executes a request with deduplication
   * If an identical request is in flight, returns the same promise
   * @template T - Return type
   * @param key - Unique key for this request
   * @param fn - Function to execute if not already in flight
   * @returns Result of the request
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.stats.totalRequests++;

    // Check if request is already in flight
    const existing = this.pending.get(key);
    if (existing) {
      this.stats.coalescedRequests++;
      existing.subscribers++;
      this.updateCoalesceRate();
      return existing.promise;
    }

    // Create new request
    this.stats.uniqueRequests++;
    this.stats.activeRequests++;

    const promise = fn()
      .then((result) => {
        this.cleanup(key);
        return result;
      })
      .catch((error) => {
        this.cleanup(key);
        throw error;
      });

    const request: CoalescedRequest<T> = {
      promise,
      createdAt: Date.now(),
      subscribers: 1,
    };

    this.pending.set(key, request);
    this.updateCoalesceRate();

    return promise;
  }

  /**
   * Generates a cache key from method and parameters
   * @param method - Method name
   * @param chainId - Chain ID
   * @param address - Address
   * @param params - Additional parameters
   * @returns Generated key
   */
  static generateKey(
    method: string,
    chainId: number,
    address?: string,
    params?: Record<string, any>
  ): string {
    const parts = [method, chainId.toString()];

    if (address) {
      parts.push(address);
    }

    if (params) {
      // Simple hash of params object
      const paramsStr = JSON.stringify(params);
      parts.push(paramsStr);
    }

    return parts.join(':');
  }

  /**
   * Gets coalescer statistics
   * @returns Current stats
   */
  getStats(): Readonly<CoalescerStats> {
    return { ...this.stats };
  }

  /**
   * Clears all pending requests
   */
  clear(): void {
    this.pending.clear();
    this.stats.activeRequests = 0;
  }

  /**
   * Checks if a request is in flight
   * @param key - Request key
   * @returns True if request is pending
   */
  isPending(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * Removes completed request from pending map
   * @param key - Request key
   * @private
   */
  private cleanup(key: string): void {
    this.pending.delete(key);
    this.stats.activeRequests = this.pending.size;
  }

  /**
   * Periodic cleanup of stale entries
   * @private
   */
  private periodicCleanup(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [key, request] of this.pending.entries()) {
      if (now - request.createdAt > staleThreshold) {
        this.pending.delete(key);
      }
    }

    this.stats.activeRequests = this.pending.size;
  }

  /**
   * Updates coalesce rate calculation
   * @private
   */
  private updateCoalesceRate(): void {
    if (this.stats.totalRequests > 0) {
      this.stats.coalesceRate = this.stats.coalescedRequests / this.stats.totalRequests;
    }
  }

  /**
   * Destroys coalescer and cleans up resources
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.pending.clear();
    this.stats.activeRequests = 0;
  }
}
