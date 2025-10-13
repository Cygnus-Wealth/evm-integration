/**
 * Fallback strategy result
 */
export interface FallbackResult<T> {
  /**
   * Result value (if successful)
   */
  value?: T;

  /**
   * Index of strategy that succeeded (0-based)
   * -1 if all failed
   */
  strategyIndex: number;

  /**
   * Name of successful strategy
   */
  strategyName?: string;

  /**
   * Errors from failed strategies
   */
  errors: Error[];

  /**
   * Total time taken (ms)
   */
  duration: number;

  /**
   * Whether fallback was successful
   */
  success: boolean;
}

/**
 * Fallback strategy definition
 */
export interface FallbackStrategy<T> {
  /**
   * Unique name for this strategy
   */
  name: string;

  /**
   * Function to execute
   */
  execute: () => Promise<T>;

  /**
   * Optional predicate to determine if this strategy should be attempted
   * If returns false, strategy is skipped
   */
  shouldAttempt?: () => boolean | Promise<boolean>;

  /**
   * Optional timeout for this specific strategy (ms)
   */
  timeout?: number;
}

/**
 * Fallback chain orchestration
 * Attempts strategies in priority order until one succeeds
 */
export class FallbackChain<T> {
  private strategies: FallbackStrategy<T>[];
  private defaultValue?: T;

  /**
   * Creates a new fallback chain
   * @param strategies - Ordered array of fallback strategies (highest priority first)
   * @param defaultValue - Optional default value if all strategies fail
   */
  constructor(strategies: FallbackStrategy<T>[], defaultValue?: T) {
    if (!strategies || strategies.length === 0) {
      throw new Error('At least one strategy is required');
    }

    this.strategies = strategies;
    this.defaultValue = defaultValue;
  }

  /**
   * Executes fallback chain
   * @returns Result with value and metadata
   */
  async execute(): Promise<FallbackResult<T>> {
    const startTime = Date.now();
    const errors: Error[] = [];

    for (let i = 0; i < this.strategies.length; i++) {
      const strategy = this.strategies[i];

      try {
        // Check if strategy should be attempted
        if (strategy.shouldAttempt) {
          const shouldAttempt = await strategy.shouldAttempt();
          if (!shouldAttempt) {
            continue; // Skip this strategy
          }
        }

        // Execute strategy with optional timeout
        const value = await this.executeStrategy(strategy);

        // Success!
        return {
          value,
          strategyIndex: i,
          strategyName: strategy.name,
          errors,
          duration: Date.now() - startTime,
          success: true,
        };
      } catch (error) {
        errors.push(error as Error);
        // Continue to next strategy
      }
    }

    // All strategies failed
    const duration = Date.now() - startTime;

    // Return default value if available
    if (this.defaultValue !== undefined) {
      return {
        value: this.defaultValue,
        strategyIndex: -1,
        errors,
        duration,
        success: true, // Technically successful because we have a value
      };
    }

    // No default value - complete failure
    throw new Error(
      `All fallback strategies failed. Errors: ${errors.map(e => e.message).join(', ')}`
    );
  }

  /**
   * Adds a strategy to the chain
   * @param strategy - Strategy to add
   * @param index - Position to insert (defaults to end)
   */
  addStrategy(strategy: FallbackStrategy<T>, index?: number): void {
    if (index === undefined || index >= this.strategies.length) {
      this.strategies.push(strategy);
    } else {
      this.strategies.splice(index, 0, strategy);
    }
  }

  /**
   * Removes a strategy by name
   * @param name - Strategy name to remove
   * @returns True if removed
   */
  removeStrategy(name: string): boolean {
    const index = this.strategies.findIndex(s => s.name === name);
    if (index === -1) {
      return false;
    }

    this.strategies.splice(index, 1);
    return true;
  }

  /**
   * Gets all strategy names in order
   * @returns Array of strategy names
   */
  getStrategyNames(): string[] {
    return this.strategies.map(s => s.name);
  }

  /**
   * Executes a single strategy with timeout
   * @param strategy - Strategy to execute
   * @returns Result value
   * @throws Error if strategy fails or times out
   * @private
   */
  private async executeStrategy(strategy: FallbackStrategy<T>): Promise<T> {
    if (strategy.timeout) {
      // Execute with timeout
      return await Promise.race([
        strategy.execute(),
        this.createTimeout(strategy.timeout),
      ]);
    }

    // Execute without timeout
    return await strategy.execute();
  }

  /**
   * Creates timeout promise
   * @param ms - Timeout duration
   * @private
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Strategy timed out after ${ms}ms`));
      }, ms);
    });
  }
}
