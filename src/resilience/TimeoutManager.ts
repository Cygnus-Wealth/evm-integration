import { ConnectionError } from '../utils/errors';

/**
 * Timeout hierarchy levels
 */
export enum TimeoutLevel {
  CONNECTION = 'CONNECTION',      // 5s
  REQUEST = 'REQUEST',           // 10s
  OPERATION = 'OPERATION',       // 30s
  GLOBAL = 'GLOBAL'              // 60s
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  /**
   * Connection establishment timeout (ms)
   * @default 5000
   */
  connection: number;

  /**
   * Single RPC request timeout (ms)
   * @default 10000
   */
  request: number;

  /**
   * Complex operation timeout (ms)
   * @default 30000
   */
  operation: number;

  /**
   * Absolute maximum timeout (ms)
   * @default 60000
   */
  global: number;
}

/**
 * Timeout error with level information
 */
export class TimeoutError extends ConnectionError {
  readonly level: TimeoutLevel;
  readonly timeoutMs: number;

  constructor(
    level: TimeoutLevel,
    timeoutMs: number,
    operation: string
  ) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms (${level} timeout)`,
      'TIMEOUT',
      operation,
      'TIMEOUT',
      { level, timeoutMs, operation }
    );
    this.level = level;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Timeout manager with hierarchical timeouts
 * Ensures operations respect appropriate timeout levels
 */
export class TimeoutManager {
  private config: TimeoutConfig;

  /**
   * Creates a new timeout manager
   * @param config - Timeout configuration
   */
  constructor(config: Partial<TimeoutConfig> = {}) {
    this.config = {
      connection: config.connection ?? 5000,
      request: config.request ?? 10000,
      operation: config.operation ?? 30000,
      global: config.global ?? 60000,
    };

    this.validateHierarchy();
  }

  /**
   * Wraps an operation with timeout at specified level
   * @template T - Return type
   * @param operation - Async operation to execute
   * @param level - Timeout level to apply
   * @param operationName - Name for error messages
   * @returns Result of operation
   * @throws TimeoutError if operation exceeds timeout
   */
  async execute<T>(
    operation: () => Promise<T>,
    level: TimeoutLevel,
    operationName: string = 'operation'
  ): Promise<T> {
    const timeout = this.getTimeout(level);
    const timeoutPromise = this.createTimeoutPromise(timeout, level, operationName);

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw error;
      }
      // Re-throw other errors as-is
      throw error;
    }
  }

  /**
   * Gets timeout duration for a specific level
   * @param level - Timeout level
   * @returns Timeout in milliseconds
   */
  getTimeout(level: TimeoutLevel): number {
    switch (level) {
      case TimeoutLevel.CONNECTION:
        return this.config.connection;
      case TimeoutLevel.REQUEST:
        return this.config.request;
      case TimeoutLevel.OPERATION:
        return this.config.operation;
      case TimeoutLevel.GLOBAL:
        return this.config.global;
      default:
        return this.config.request;
    }
  }

  /**
   * Sets timeout duration for a specific level
   * @param level - Timeout level
   * @param ms - New timeout value
   */
  setTimeout(level: TimeoutLevel, ms: number): void {
    switch (level) {
      case TimeoutLevel.CONNECTION:
        this.config.connection = ms;
        break;
      case TimeoutLevel.REQUEST:
        this.config.request = ms;
        break;
      case TimeoutLevel.OPERATION:
        this.config.operation = ms;
        break;
      case TimeoutLevel.GLOBAL:
        this.config.global = ms;
        break;
    }

    this.validateHierarchy();
  }

  /**
   * Creates a timeout promise that rejects after duration
   * @param ms - Timeout duration
   * @param level - Timeout level
   * @param operation - Operation name
   * @returns Promise that rejects with TimeoutError
   * @private
   */
  private createTimeoutPromise(
    ms: number,
    level: TimeoutLevel,
    operation: string
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(level, ms, operation));
      }, ms);
    });
  }

  /**
   * Validates timeout hierarchy (connection < request < operation < global)
   * @throws Error if hierarchy is violated
   * @private
   */
  private validateHierarchy(): void {
    const { connection, request, operation, global } = this.config;

    if (connection > request) {
      throw new Error(
        `Invalid timeout hierarchy: CONNECTION (${connection}ms) must be <= REQUEST (${request}ms)`
      );
    }

    if (request > operation) {
      throw new Error(
        `Invalid timeout hierarchy: REQUEST (${request}ms) must be <= OPERATION (${operation}ms)`
      );
    }

    if (operation > global) {
      throw new Error(
        `Invalid timeout hierarchy: OPERATION (${operation}ms) must be <= GLOBAL (${global}ms)`
      );
    }
  }
}
