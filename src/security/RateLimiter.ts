/**
 * Rate limiter implementation
 *
 * @module security/RateLimiter
 * @see interfaces.ts for IRateLimiter contract
 */

import { IRateLimiter, RateLimiterConfig } from './interfaces';
import { RateLimitError } from '../utils/errors';

/**
 * Default rate limiter configuration
 */
const DEFAULT_CONFIG: Required<RateLimiterConfig> = {
  capacity: 10,
  refillRate: 1,
  maxWait: 5000,
  name: 'default',
};

/**
 * Rate limiter implementation using token bucket algorithm
 * Ensures requests stay within configured rate limits
 */
export class RateLimiter implements IRateLimiter {
  private config: Required<RateLimiterConfig>;
  private tokens: number;
  private lastRefillTime: number;
  private waitQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
    timeoutId?: NodeJS.Timeout;
  }>;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokens = this.config.capacity;
    this.lastRefillTime = Date.now();
    this.waitQueue = [];
  }

  /**
   * Acquires a token, waiting if necessary
   *
   * @returns Promise that resolves when token is acquired
   * @throws RateLimitError if max wait time exceeded
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    // Try immediate acquisition
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Need to wait for token
    return new Promise<void>((resolve, reject) => {
      const timestamp = Date.now();

      // Set timeout for max wait
      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.findIndex(
          (item) => item.timestamp === timestamp
        );

        if (index !== -1) {
          // Still waiting, reject with rate limit error
          this.waitQueue.splice(index, 1);
          reject(
            new RateLimitError(
              `Rate limit exceeded: no tokens available within ${this.config.maxWait}ms`,
              Date.now() + this.config.maxWait,
              this.config.capacity,
              1, // period in seconds
              this.config.name,
              { limiter: this.config.name }
            )
          );
        }
      }, this.config.maxWait);

      this.waitQueue.push({ resolve, reject, timestamp, timeoutId });

      // Start processing queue
      this.processQueue();
    });
  }

  /**
   * Attempts to acquire a token without waiting
   *
   * @returns True if token was acquired immediately
   */
  tryAcquire(): boolean {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Executes a function with rate limiting
   *
   * @template T - Return type of function
   * @param fn - Async function to execute
   * @returns Promise resolving to function result
   * @throws RateLimitError if rate limit exceeded
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    return fn();
  }

  /**
   * Gets number of available tokens
   *
   * @returns Current available token count
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Refills tokens based on elapsed time
   *
   * @private
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const elapsedSeconds = elapsedMs / 1000;

    // Calculate tokens to add
    const tokensToAdd = elapsedSeconds * this.config.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(
        this.config.capacity,
        this.tokens + tokensToAdd
      );
      this.lastRefillTime = now;
    }
  }

  /**
   * Processes waiting queue when tokens become available
   *
   * @private
   */
  private processQueue(): void {
    // Use setImmediate or setTimeout to avoid blocking
    setTimeout(() => {
      this.refillTokens();

      while (this.waitQueue.length > 0 && this.tokens >= 1) {
        const waiter = this.waitQueue.shift();
        if (waiter) {
          this.tokens -= 1;
          // Clear timeout to prevent unhandled rejection
          if (waiter.timeoutId) {
            clearTimeout(waiter.timeoutId);
          }
          waiter.resolve();
        }
      }

      // Continue processing if queue still has items
      if (this.waitQueue.length > 0) {
        this.processQueue();
      }
    }, 100); // Check every 100ms
  }
}
