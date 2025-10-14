/**
 * Security component interfaces and types
 *
 * @module security/interfaces
 * @see UNIT_ARCHITECTURE.md Section 6: Validation & Security
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /**
   * Maximum tokens (requests) in bucket
   */
  capacity: number;

  /**
   * Tokens added per second (refill rate)
   */
  refillRate: number;

  /**
   * Maximum time to wait for token in milliseconds
   * @default 5000
   */
  maxWait: number;

  /**
   * Limiter name for metrics/logging
   */
  name?: string;
}

/**
 * Rate limiter interface
 * Implements token bucket algorithm for rate limiting
 */
export interface IRateLimiter {
  /**
   * Acquires a token, waiting if necessary
   *
   * @returns Promise that resolves when token is acquired
   * @throws RateLimitError if max wait time exceeded
   */
  acquire(): Promise<void>;

  /**
   * Attempts to acquire a token without waiting
   *
   * @returns True if token was acquired immediately
   */
  tryAcquire(): boolean;

  /**
   * Executes a function with rate limiting
   *
   * @template T - Return type of function
   * @param fn - Async function to execute
   * @returns Promise resolving to function result
   * @throws RateLimitError if rate limit exceeded
   */
  execute<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Gets number of available tokens
   *
   * @returns Current available token count
   */
  getAvailableTokens(): number;
}
