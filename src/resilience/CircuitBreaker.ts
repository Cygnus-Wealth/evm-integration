import { CircuitBreakerError } from '../utils/errors';

/**
 * Circuit breaker state
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures to open circuit
   * @default 5
   */
  failureThreshold: number;

  /**
   * Number of consecutive successes in half-open to close
   * @default 3
   */
  successThreshold: number;

  /**
   * Time in ms to wait before transitioning to half-open
   * @default 30000
   */
  timeout: number;

  /**
   * Minimum requests before evaluating statistics
   * @default 10
   */
  volumeThreshold: number;

  /**
   * Time window for failure rate calculation (ms)
   * @default 60000
   */
  rollingWindow: number;

  /**
   * Name for this circuit (for logging/metrics)
   */
  name: string;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  halfOpenSuccesses: number;
}

/**
 * Circuit breaker implementation using state pattern
 * Prevents cascading failures by failing fast when error threshold exceeded
 */
export class CircuitBreaker {
  private state: CircuitState;
  private config: CircuitBreakerConfig;
  private stats: CircuitStats;
  private halfOpenSuccesses: number;
  private openedAt: number | null;

  /**
   * Creates a new circuit breaker
   * @param config - Circuit breaker configuration
   */
  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 3,
      timeout: config.timeout ?? 30000,
      volumeThreshold: config.volumeThreshold ?? 10,
      rollingWindow: config.rollingWindow ?? 60000,
      name: config.name,
    };

    this.state = 'CLOSED';
    this.halfOpenSuccesses = 0;
    this.openedAt = null;

    this.stats = {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      totalRequests: 0,
      lastFailureTime: null,
      lastStateChange: Date.now(),
      halfOpenSuccesses: 0,
    };
  }

  /**
   * Executes an operation through the circuit breaker
   * @template T - Return type of operation
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws CircuitBreakerError if circuit is open
   * @throws Original error if operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should transition to half-open
    if (this.state === 'OPEN' && this.shouldAttemptHalfOpen()) {
      this.transitionToHalfOpen();
    }

    // Reject immediately if circuit is open
    if (this.state === 'OPEN') {
      throw new CircuitBreakerError(
        this.config.name,
        this.openedAt! + this.config.timeout,
        this.stats.failureCount
      );
    }

    this.stats.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Gets current circuit state
   * @returns Current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Gets circuit statistics
   * @returns Current statistics
   */
  getStats(): Readonly<CircuitStats> {
    return { ...this.stats };
  }

  /**
   * Manually resets circuit to closed state
   * Use with caution - typically for testing or manual intervention
   */
  reset(): void {
    this.state = 'CLOSED';
    this.halfOpenSuccesses = 0;
    this.openedAt = null;
    this.stats = {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      totalRequests: 0,
      lastFailureTime: null,
      lastStateChange: Date.now(),
      halfOpenSuccesses: 0,
    };
  }

  /**
   * Records a successful operation
   * Updates statistics and may transition state
   * @private
   */
  private onSuccess(): void {
    this.stats.successCount++;

    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      this.stats.halfOpenSuccesses = this.halfOpenSuccesses;

      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success in closed state
      this.stats.failureCount = 0;
    }
  }

  /**
   * Records a failed operation
   * Updates statistics and may transition state
   * @param error - Error that occurred
   * @private
   */
  private onFailure(error: Error): void {
    this.stats.failureCount++;
    this.stats.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open immediately reopens circuit
      this.transitionToOpen();
    } else if (this.state === 'CLOSED') {
      // Check if we should open the circuit
      if (this.isThresholdExceeded()) {
        this.transitionToOpen();
      }
    }
  }

  /**
   * Checks if circuit should attempt half-open
   * @returns True if timeout has elapsed
   * @private
   */
  private shouldAttemptHalfOpen(): boolean {
    if (!this.openedAt) return false;
    return Date.now() >= this.openedAt + this.config.timeout;
  }

  /**
   * Transitions circuit to open state
   * @private
   */
  private transitionToOpen(): void {
    this.state = 'OPEN';
    this.openedAt = Date.now();
    this.stats.state = 'OPEN';
    this.stats.lastStateChange = Date.now();
  }

  /**
   * Transitions circuit to half-open state
   * @private
   */
  private transitionToHalfOpen(): void {
    this.state = 'HALF_OPEN';
    this.halfOpenSuccesses = 0;
    this.stats.state = 'HALF_OPEN';
    this.stats.halfOpenSuccesses = 0;
    this.stats.lastStateChange = Date.now();
  }

  /**
   * Transitions circuit to closed state
   * @private
   */
  private transitionToClosed(): void {
    this.state = 'CLOSED';
    this.halfOpenSuccesses = 0;
    this.openedAt = null;
    this.stats.state = 'CLOSED';
    this.stats.failureCount = 0;
    this.stats.halfOpenSuccesses = 0;
    this.stats.lastStateChange = Date.now();
  }

  /**
   * Checks if failure threshold is exceeded
   * @returns True if should open
   * @private
   */
  private isThresholdExceeded(): boolean {
    // Need minimum volume before evaluating
    if (this.stats.totalRequests < this.config.volumeThreshold) {
      return false;
    }

    return this.stats.failureCount >= this.config.failureThreshold;
  }
}
