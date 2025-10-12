/**
 * Base error class for all integration errors
 * Provides structured error information with context and retry guidance
 */
export class IntegrationError extends Error {
  /**
   * Unique error code for categorization
   * Format: CATEGORY_SPECIFIC_ERROR (e.g., CONNECTION_TIMEOUT, VALIDATION_INVALID_ADDRESS)
   */
  readonly code: string;

  /**
   * Indicates if this error is transient and can be retried
   */
  readonly retriable: boolean;

  /**
   * Additional context for debugging and logging
   * Should include relevant data without exposing sensitive information
   */
  readonly context: Record<string, any>;

  /**
   * Original error that caused this error (if applicable)
   */
  readonly cause?: Error;

  /**
   * Timestamp when the error occurred
   */
  readonly timestamp: Date;

  /**
   * Chain ID where the error occurred (if applicable)
   */
  readonly chainId?: number;

  /**
   * Creates a new IntegrationError
   * @param message - Human-readable error message
   * @param code - Unique error code
   * @param retriable - Whether this error can be retried
   * @param context - Additional context information
   * @param cause - Original error (optional)
   */
  constructor(
    message: string,
    code: string,
    retriable: boolean,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retriable = retriable;
    this.context = context || {};
    this.cause = cause;
    this.timestamp = new Date();

    // Preserve stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts error to JSON for logging/serialization
   * @returns Serializable error object
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      retriable: this.retriable,
      context: ErrorUtils.sanitizeContext(this.context),
      timestamp: this.timestamp.toISOString(),
      chainId: this.chainId,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
          }
        : undefined,
    };
  }
}

/**
 * Connection-related errors (network, timeout, etc.)
 * Always retriable with exponential backoff
 */
export class ConnectionError extends IntegrationError {
  /**
   * RPC endpoint URL that failed
   */
  readonly endpoint: string;

  /**
   * Type of connection error
   */
  readonly connectionType: 'TIMEOUT' | 'REFUSED' | 'RESET' | 'DNS_FAILED' | 'UNKNOWN';

  constructor(
    message: string,
    code: string,
    endpoint: string,
    connectionType: 'TIMEOUT' | 'REFUSED' | 'RESET' | 'DNS_FAILED' | 'UNKNOWN',
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message, code, true, context, cause);
    this.endpoint = endpoint;
    this.connectionType = connectionType;
  }

  /**
   * Static factory for timeout errors
   */
  static timeout(endpoint: string, timeoutMs: number, cause?: Error): ConnectionError {
    return new ConnectionError(
      `Connection timeout after ${timeoutMs}ms`,
      'CONNECTION_TIMEOUT',
      endpoint,
      'TIMEOUT',
      { timeoutMs },
      cause
    );
  }

  /**
   * Static factory for connection refused errors
   */
  static refused(endpoint: string, cause?: Error): ConnectionError {
    return new ConnectionError(
      `Connection refused`,
      'CONNECTION_REFUSED',
      endpoint,
      'REFUSED',
      {},
      cause
    );
  }

  /**
   * Static factory for connection reset errors
   */
  static reset(endpoint: string, cause?: Error): ConnectionError {
    return new ConnectionError(
      `Connection reset by peer`,
      'CONNECTION_RESET',
      endpoint,
      'RESET',
      {},
      cause
    );
  }
}

/**
 * Rate limit exceeded error
 * Retriable after waiting for reset time
 */
export class RateLimitError extends IntegrationError {
  /**
   * Unix timestamp when rate limit resets (milliseconds)
   */
  readonly resetAt: number;

  /**
   * Number of requests allowed per period
   */
  readonly limit: number;

  /**
   * Time period for rate limit (seconds)
   */
  readonly period: number;

  /**
   * Provider that rate limited the request
   */
  readonly provider: string;

  constructor(
    message: string,
    resetAt: number,
    limit: number,
    period: number,
    provider: string,
    context?: Record<string, any>
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', true, context);
    this.resetAt = resetAt;
    this.limit = limit;
    this.period = period;
    this.provider = provider;
  }

  /**
   * Calculates milliseconds until rate limit resets
   * @returns Time to wait before retrying (ms)
   */
  getWaitTime(): number {
    return Math.max(0, this.resetAt - Date.now());
  }
}

/**
 * Input validation error
 * Not retriable - indicates client-side error
 */
export class ValidationError extends IntegrationError {
  /**
   * Field or parameter that failed validation
   */
  readonly field: string;

  /**
   * Expected format or constraint
   */
  readonly expected: string;

  /**
   * Actual value received (sanitized)
   */
  readonly received: string;

  constructor(
    message: string,
    field: string,
    expected: string,
    received: string,
    context?: Record<string, any>
  ) {
    super(message, `VALIDATION_${field.toUpperCase()}_INVALID`, false, context);
    this.field = field;
    this.expected = expected;
    this.received = received;
  }

  /**
   * Static factory for address validation errors
   */
  static invalidAddress(address: string): ValidationError {
    return new ValidationError(
      `Invalid Ethereum address: ${address}`,
      'address',
      '0x-prefixed 40-character hex string',
      address
    );
  }

  /**
   * Static factory for chain ID validation errors
   */
  static invalidChainId(chainId: number): ValidationError {
    return new ValidationError(
      `Invalid or unsupported chain ID: ${chainId}`,
      'chainId',
      'Supported EVM chain ID',
      String(chainId)
    );
  }

  /**
   * Static factory for parameter validation errors
   */
  static invalidParameter(
    paramName: string,
    expected: string,
    received: any
  ): ValidationError {
    return new ValidationError(
      `Invalid parameter ${paramName}`,
      paramName,
      expected,
      String(received)
    );
  }
}

/**
 * Data format or integrity error from external sources
 * Not retriable - indicates provider issue or data corruption
 */
export class DataError extends IntegrationError {
  /**
   * Type of data that was invalid
   */
  readonly dataType: 'BALANCE' | 'TRANSACTION' | 'BLOCK' | 'TOKEN' | 'OTHER';

  /**
   * Reason for data invalidity
   */
  readonly reason: string;

  constructor(
    message: string,
    dataType: 'BALANCE' | 'TRANSACTION' | 'BLOCK' | 'TOKEN' | 'OTHER',
    reason: string,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message, `DATA_${dataType}_INVALID`, false, context, cause);
    this.dataType = dataType;
    this.reason = reason;
  }

  /**
   * Static factory for schema validation errors
   */
  static schemaViolation(
    dataType: DataError['dataType'],
    expectedSchema: string,
    actualData: any
  ): DataError {
    return new DataError(
      `Data does not match expected schema`,
      dataType,
      'Schema validation failed',
      { expectedSchema, actualData }
    );
  }
}

/**
 * Circuit breaker open error
 * Retriable after circuit timeout expires
 */
export class CircuitBreakerError extends IntegrationError {
  /**
   * Name of the circuit that is open
   */
  readonly circuitName: string;

  /**
   * Unix timestamp when circuit may transition to half-open (ms)
   */
  readonly resetAt: number;

  /**
   * Number of consecutive failures that triggered opening
   */
  readonly failureCount: number;

  constructor(
    circuitName: string,
    resetAt: number,
    failureCount: number,
    context?: Record<string, any>
  ) {
    super(
      `Circuit breaker '${circuitName}' is open`,
      'CIRCUIT_BREAKER_OPEN',
      true,
      context
    );
    this.circuitName = circuitName;
    this.resetAt = resetAt;
    this.failureCount = failureCount;
  }

  /**
   * Calculates time until circuit may attempt half-open
   * @returns Milliseconds until reset attempt
   */
  getWaitTime(): number {
    return Math.max(0, this.resetAt - Date.now());
  }
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  private static readonly SENSITIVE_KEYS = [
    'apiKey',
    'api_key',
    'secret',
    'password',
    'token',
    'privateKey',
    'private_key',
    'mnemonic',
    'seed',
  ];

  /**
   * Determines if an error is retriable
   * @param error - Error to check
   * @returns True if error can be retried
   */
  static isRetriable(error: Error): boolean {
    if (error instanceof IntegrationError) {
      return error.retriable;
    }

    // Check for known retriable error patterns
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('network') ||
      message.includes('rate limit')
    );
  }

  /**
   * Extracts error code from any error type
   * @param error - Error to extract from
   * @returns Error code or 'UNKNOWN'
   */
  static getErrorCode(error: Error): string {
    if (error instanceof IntegrationError) {
      return error.code;
    }

    // Try to extract code from error object
    if ('code' in error && typeof error.code === 'string') {
      return error.code;
    }

    return 'UNKNOWN';
  }

  /**
   * Safely converts any error to IntegrationError
   * @param error - Error to convert
   * @param defaultCode - Code to use if unknown
   * @returns IntegrationError instance
   */
  static toIntegrationError(
    error: Error,
    defaultCode: string = 'UNKNOWN_ERROR'
  ): IntegrationError {
    if (error instanceof IntegrationError) {
      return error;
    }

    const isRetriable = this.isRetriable(error);
    const code = this.getErrorCode(error) || defaultCode;

    return new IntegrationError(
      error.message || 'An unknown error occurred',
      code,
      isRetriable,
      {},
      error
    );
  }

  /**
   * Sanitizes error context to remove sensitive data
   * @param context - Context object to sanitize
   * @returns Sanitized context safe for logging
   */
  static sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();

      // Check if key contains sensitive information
      const isSensitive = this.SENSITIVE_KEYS.some((sensitive) => {
        const lowerSensitive = sensitive.toLowerCase();
        return lowerKey === lowerSensitive || lowerKey.includes(lowerSensitive);
      });

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Recursively sanitize nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Creates user-friendly error message from technical error
   * @param error - Technical error
   * @returns User-friendly message
   */
  static toUserMessage(error: Error): string {
    if (error instanceof ValidationError) {
      return `Invalid ${error.field}: ${error.message}`;
    }

    if (error instanceof ConnectionError) {
      return 'Unable to connect to blockchain network. Please check your connection and try again.';
    }

    if (error instanceof RateLimitError) {
      const waitSeconds = Math.ceil(error.getWaitTime() / 1000);
      return `Rate limit exceeded. Please wait ${waitSeconds} seconds before trying again.`;
    }

    if (error instanceof CircuitBreakerError) {
      return 'Service temporarily unavailable due to repeated failures. Please try again later.';
    }

    if (error instanceof DataError) {
      return 'Received invalid data from blockchain network. Please try again.';
    }

    // Generic fallback
    return 'An unexpected error occurred. Please try again later.';
  }
}
