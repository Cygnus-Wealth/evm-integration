import { ErrorUtils } from '../utils/errors.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts: number;

  /**
   * Initial delay before first retry (ms)
   * @default 1000
   */
  baseDelay: number;

  /**
   * Maximum delay between retries (ms)
   * @default 30000
   */
  maxDelay: number;

  /**
   * Multiplier for exponential backoff
   * @default 2
   */
  multiplier: number;

  /**
   * Random jitter factor (0-1)
   * @default 0.3
   */
  jitterFactor: number;

  /**
   * Error codes/types that should be retried
   * @default ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'RATE_LIMIT']
   */
  retryableErrors: string[];

  /**
   * Optional callback invoked before each retry
   */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

/**
 * Retry statistics for a single operation
 */
export interface RetryStats {
  attempts: number;
  totalDelay: number;
  errors: Error[];
}

/**
 * Retry policy implementation with exponential backoff and jitter
 * Formula: delay = min(baseDelay * (multiplier ^ attempt) + jitter, maxDelay)
 */
export class RetryPolicy {
  private config: RetryConfig;

  /**
   * Creates a new retry policy
   * @param config - Retry configuration
   */
  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      baseDelay: config.baseDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      multiplier: config.multiplier ?? 2,
      jitterFactor: config.jitterFactor ?? 0.3,
      retryableErrors: config.retryableErrors ?? [
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EHOSTUNREACH',
        'ECONNREFUSED',
        'RATE_LIMIT',
        'CONNECTION_TIMEOUT',
        'CONNECTION_REFUSED',
        'CONNECTION_RESET',
      ],
      onRetry: config.onRetry,
    };

    // Validate config
    if (this.config.maxAttempts < 0) {
      throw new Error('maxAttempts must be >= 0');
    }
    if (this.config.baseDelay < 0) {
      throw new Error('baseDelay must be >= 0');
    }
    if (this.config.maxDelay < this.config.baseDelay) {
      throw new Error('maxDelay must be >= baseDelay');
    }
  }

  /**
   * Executes an operation with retry logic
   * @template T - Return type of operation
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws Last error if all retries exhausted
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const [result] = await this.executeWithStats(operation);
    return result;
  }

  /**
   * Executes operation with stats collection
   * @template T - Return type
   * @param operation - Operation to execute
   * @returns Tuple of [result, stats]
   */
  async executeWithStats<T>(
    operation: () => Promise<T>
  ): Promise<[T, RetryStats]> {
    const stats: RetryStats = {
      attempts: 0,
      totalDelay: 0,
      errors: [],
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxAttempts; attempt++) {
      stats.attempts++;

      try {
        const result = await operation();
        return [result, stats];
      } catch (error) {
        lastError = error as Error;
        stats.errors.push(lastError);

        // Check if error is retriable
        if (!this.isRetriable(lastError)) {
          throw lastError;
        }

        // Check if we have attempts left
        if (attempt >= this.config.maxAttempts) {
          throw lastError;
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt);
        stats.totalDelay += delay;

        // Invoke callback if provided
        if (this.config.onRetry) {
          this.config.onRetry(attempt + 1, lastError, delay);
        }

        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError!;
  }

  /**
   * Checks if an error should be retried
   * @param error - Error to check
   * @returns True if error is retriable
   */
  isRetriable(error: Error): boolean {
    // Use ErrorUtils to check if error is retriable
    if (!ErrorUtils.isRetriable(error)) {
      return false;
    }

    // Check if error code matches retryable errors
    const errorCode = ErrorUtils.getErrorCode(error);
    return this.config.retryableErrors.some((code) =>
      errorCode.includes(code) || error.message.includes(code)
    );
  }

  /**
   * Calculates delay for a specific attempt
   * @param attempt - Attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ attempt)
    const exponentialDelay = this.config.baseDelay * Math.pow(this.config.multiplier, attempt);

    // Apply max delay cap
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);

    // Apply jitter
    const delayWithJitter = this.applyJitter(cappedDelay);

    return Math.floor(delayWithJitter);
  }

  /**
   * Generates jitter for delay randomization
   * @param delay - Base delay
   * @returns Jittered delay
   * @private
   */
  private applyJitter(delay: number): number {
    // Jitter formula: delay +/- (delay * jitterFactor * random)
    const jitterAmount = delay * this.config.jitterFactor;
    const randomJitter = (Math.random() * 2 - 1) * jitterAmount;
    return Math.max(0, delay + randomJitter);
  }

  /**
   * Sleeps for specified duration
   * @param ms - Milliseconds to sleep
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
