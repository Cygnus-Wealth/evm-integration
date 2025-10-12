# EVM Integration Unit Architecture

> **Navigation**: [Developer Guide](./DEVELOPERS.md) > [System Architecture](./ARCHITECTURE.md) > **Unit Architecture** (Root Document)
>
> **Document Type**: Unit Architecture Specification
> **Status**: Ready for Implementation
> **Version**: 1.0
> **Created**: 2025-10-12
> **For**: Software Engineer (Implementation)

## Overview

This document provides detailed unit-level specifications for implementing the EVM Integration system. Each section includes:
- File structure and location
- Complete interface/class definitions with JSDoc
- Method signatures with parameter and return type documentation
- Comprehensive unit test specifications
- Implementation notes and constraints

**IMPORTANT**: This is an architecture document. Do NOT implement the code - use these specifications to guide implementation.

---

## Table of Contents

1. [Error Hierarchy](#1-error-hierarchy)
2. [Resilience Components](#2-resilience-components)
3. [Performance Components](#3-performance-components)
4. [Service Layer](#4-service-layer)
5. [Observability Components](#5-observability-components)
6. [Validation & Security](#6-validation--security)
7. [Unit Test Specifications](#7-unit-test-specifications)

---

## 1. Error Hierarchy

### 1.1 Base Error Class

**File**: `src/utils/errors.ts`

```typescript
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
  );

  /**
   * Converts error to JSON for logging/serialization
   * @returns Serializable error object
   */
  toJSON(): Record<string, any>;
}
```

### 1.2 Connection Errors

```typescript
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
  );

  /**
   * Static factory for timeout errors
   */
  static timeout(endpoint: string, timeoutMs: number, cause?: Error): ConnectionError;

  /**
   * Static factory for connection refused errors
   */
  static refused(endpoint: string, cause?: Error): ConnectionError;

  /**
   * Static factory for connection reset errors
   */
  static reset(endpoint: string, cause?: Error): ConnectionError;
}
```

### 1.3 Rate Limit Error

```typescript
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
  );

  /**
   * Calculates milliseconds until rate limit resets
   * @returns Time to wait before retrying (ms)
   */
  getWaitTime(): number;
}
```

### 1.4 Validation Error

```typescript
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
  );

  /**
   * Static factory for address validation errors
   */
  static invalidAddress(address: string): ValidationError;

  /**
   * Static factory for chain ID validation errors
   */
  static invalidChainId(chainId: number): ValidationError;

  /**
   * Static factory for parameter validation errors
   */
  static invalidParameter(
    paramName: string,
    expected: string,
    received: any
  ): ValidationError;
}
```

### 1.5 Data Error

```typescript
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
  );

  /**
   * Static factory for schema validation errors
   */
  static schemaViolation(
    dataType: DataError['dataType'],
    expectedSchema: string,
    actualData: any
  ): DataError;
}
```

### 1.6 Circuit Breaker Error

```typescript
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
  );

  /**
   * Calculates time until circuit may attempt half-open
   * @returns Milliseconds until reset attempt
   */
  getWaitTime(): number;
}
```

### 1.7 Error Utilities

```typescript
/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  /**
   * Determines if an error is retriable
   * @param error - Error to check
   * @returns True if error can be retried
   */
  static isRetriable(error: Error): boolean;

  /**
   * Extracts error code from any error type
   * @param error - Error to extract from
   * @returns Error code or 'UNKNOWN'
   */
  static getErrorCode(error: Error): string;

  /**
   * Safely converts any error to IntegrationError
   * @param error - Error to convert
   * @param defaultCode - Code to use if unknown
   * @returns IntegrationError instance
   */
  static toIntegrationError(
    error: Error,
    defaultCode?: string
  ): IntegrationError;

  /**
   * Sanitizes error context to remove sensitive data
   * @param context - Context object to sanitize
   * @returns Sanitized context safe for logging
   */
  static sanitizeContext(context: Record<string, any>): Record<string, any>;

  /**
   * Creates user-friendly error message from technical error
   * @param error - Technical error
   * @returns User-friendly message
   */
  static toUserMessage(error: Error): string;
}
```

### Unit Tests for Error Hierarchy

**File**: `src/utils/errors.test.ts`

```typescript
describe('Error Hierarchy', () => {
  describe('IntegrationError', () => {
    it('should create error with all properties');
    it('should serialize to JSON correctly');
    it('should preserve error chain with cause');
    it('should include timestamp');
    it('should sanitize context in toJSON');
  });

  describe('ConnectionError', () => {
    it('should be retriable by default');
    it('should create timeout error with factory');
    it('should create refused error with factory');
    it('should include endpoint in context');
    it('should categorize connection types correctly');
  });

  describe('RateLimitError', () => {
    it('should be retriable');
    it('should calculate wait time correctly');
    it('should handle past reset times');
    it('should include provider information');
  });

  describe('ValidationError', () => {
    it('should not be retriable');
    it('should create address validation error');
    it('should create chain ID validation error');
    it('should sanitize received values');
  });

  describe('DataError', () => {
    it('should not be retriable');
    it('should categorize data types');
    it('should include reason for invalidity');
  });

  describe('CircuitBreakerError', () => {
    it('should be retriable');
    it('should calculate wait time until reset');
    it('should include failure count');
  });

  describe('ErrorUtils', () => {
    it('should identify retriable errors');
    it('should identify non-retriable errors');
    it('should extract error codes');
    it('should convert unknown errors to IntegrationError');
    it('should sanitize sensitive data from context');
    it('should remove API keys from context');
    it('should remove private keys from context');
    it('should create user-friendly messages');
  });
});
```

---

## 2. Resilience Components

### 2.1 Circuit Breaker

**File**: `src/resilience/CircuitBreaker.ts`

```typescript
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
  constructor(config: Partial<CircuitBreakerConfig>);

  /**
   * Executes an operation through the circuit breaker
   * @template T - Return type of operation
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws CircuitBreakerError if circuit is open
   * @throws Original error if operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Gets current circuit state
   * @returns Current state
   */
  getState(): CircuitState;

  /**
   * Gets circuit statistics
   * @returns Current statistics
   */
  getStats(): Readonly<CircuitStats>;

  /**
   * Manually resets circuit to closed state
   * Use with caution - typically for testing or manual intervention
   */
  reset(): void;

  /**
   * Records a successful operation
   * Updates statistics and may transition state
   * @private
   */
  private onSuccess(): void;

  /**
   * Records a failed operation
   * Updates statistics and may transition state
   * @param error - Error that occurred
   * @private
   */
  private onFailure(error: Error): void;

  /**
   * Checks if circuit should attempt half-open
   * @returns True if timeout has elapsed
   * @private
   */
  private shouldAttemptHalfOpen(): boolean;

  /**
   * Transitions circuit to open state
   * @private
   */
  private transitionToOpen(): void;

  /**
   * Transitions circuit to half-open state
   * @private
   */
  private transitionToHalfOpen(): void;

  /**
   * Transitions circuit to closed state
   * @private
   */
  private transitionToClosed(): void;

  /**
   * Checks if failure threshold is exceeded
   * @returns True if should open
   * @private
   */
  private isThresholdExceeded(): boolean;
}
```

### Unit Tests for Circuit Breaker

**File**: `src/resilience/CircuitBreaker.test.ts`

```typescript
describe('CircuitBreaker', () => {
  describe('Constructor', () => {
    it('should initialize with default config');
    it('should accept partial config');
    it('should start in CLOSED state');
    it('should validate config parameters');
  });

  describe('State Transitions', () => {
    it('should remain CLOSED on success');
    it('should transition CLOSED -> OPEN after failure threshold');
    it('should stay OPEN within timeout period');
    it('should transition OPEN -> HALF_OPEN after timeout');
    it('should transition HALF_OPEN -> CLOSED after success threshold');
    it('should transition HALF_OPEN -> OPEN on failure');
  });

  describe('Execute', () => {
    it('should execute operation when CLOSED');
    it('should throw CircuitBreakerError when OPEN');
    it('should allow single request in HALF_OPEN');
    it('should propagate operation errors');
    it('should update stats on success');
    it('should update stats on failure');
  });

  describe('Statistics', () => {
    it('should track failure count');
    it('should track success count');
    it('should track total requests');
    it('should record last failure time');
    it('should record state change time');
    it('should respect volume threshold');
  });

  describe('Reset', () => {
    it('should reset to CLOSED state');
    it('should clear statistics');
    it('should allow operations after reset');
  });

  describe('Edge Cases', () => {
    it('should handle rapid state changes');
    it('should handle concurrent requests in HALF_OPEN');
    it('should handle exactly threshold failures');
    it('should handle extremely short timeouts');
  });
});
```

### 2.2 Retry Policy

**File**: `src/resilience/RetryPolicy.ts`

```typescript
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
  constructor(config: Partial<RetryConfig>);

  /**
   * Executes an operation with retry logic
   * @template T - Return type of operation
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws Last error if all retries exhausted
   */
  async execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Executes operation with stats collection
   * @template T - Return type
   * @param operation - Operation to execute
   * @returns Tuple of [result, stats]
   */
  async executeWithStats<T>(
    operation: () => Promise<T>
  ): Promise<[T, RetryStats]>;

  /**
   * Checks if an error should be retried
   * @param error - Error to check
   * @returns True if error is retriable
   */
  isRetriable(error: Error): boolean;

  /**
   * Calculates delay for a specific attempt
   * @param attempt - Attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number): number;

  /**
   * Generates jitter for delay randomization
   * @param delay - Base delay
   * @returns Jittered delay
   * @private
   */
  private applyJitter(delay: number): number;

  /**
   * Sleeps for specified duration
   * @param ms - Milliseconds to sleep
   * @private
   */
  private sleep(ms: number): Promise<void>;
}
```

### Unit Tests for Retry Policy

**File**: `src/resilience/RetryPolicy.test.ts`

```typescript
describe('RetryPolicy', () => {
  describe('Constructor', () => {
    it('should initialize with default config');
    it('should accept partial config');
    it('should validate max attempts > 0');
    it('should validate delays');
  });

  describe('Execute', () => {
    it('should return result on first success');
    it('should retry on retriable error');
    it('should not retry on non-retriable error');
    it('should throw after max attempts');
    it('should apply exponential backoff');
    it('should invoke onRetry callback');
  });

  describe('Delay Calculation', () => {
    it('should calculate exponential backoff correctly');
    it('should respect max delay');
    it('should apply jitter');
    it('should handle attempt 0');
    it('should handle large attempt numbers');
  });

  describe('Retriable Errors', () => {
    it('should identify retriable connection errors');
    it('should identify retriable rate limit errors');
    it('should identify non-retriable validation errors');
    it('should respect custom retryable errors');
  });

  describe('Stats Collection', () => {
    it('should track attempt count');
    it('should track total delay');
    it('should collect all errors');
  });

  describe('Edge Cases', () => {
    it('should handle immediate success');
    it('should handle all failures');
    it('should handle zero base delay');
    it('should handle very large delays');
  });
});
```

### 2.3 Fallback Chain

**File**: `src/resilience/FallbackChain.ts`

```typescript
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
  constructor(strategies: FallbackStrategy<T>[], defaultValue?: T);

  /**
   * Executes fallback chain
   * @returns Result with value and metadata
   */
  async execute(): Promise<FallbackResult<T>>;

  /**
   * Adds a strategy to the chain
   * @param strategy - Strategy to add
   * @param index - Position to insert (defaults to end)
   */
  addStrategy(strategy: FallbackStrategy<T>, index?: number): void;

  /**
   * Removes a strategy by name
   * @param name - Strategy name to remove
   * @returns True if removed
   */
  removeStrategy(name: string): boolean;

  /**
   * Gets all strategy names in order
   * @returns Array of strategy names
   */
  getStrategyNames(): string[];

  /**
   * Executes a single strategy with timeout
   * @param strategy - Strategy to execute
   * @returns Result value
   * @throws Error if strategy fails or times out
   * @private
   */
  private executeStrategy(strategy: FallbackStrategy<T>): Promise<T>;

  /**
   * Creates timeout promise
   * @param ms - Timeout duration
   * @private
   */
  private createTimeout(ms: number): Promise<never>;
}
```

### Unit Tests for Fallback Chain

**File**: `src/resilience/FallbackChain.test.ts`

```typescript
describe('FallbackChain', () => {
  describe('Constructor', () => {
    it('should accept strategies array');
    it('should accept optional default value');
    it('should throw on empty strategies');
  });

  describe('Execute', () => {
    it('should return first successful strategy');
    it('should try second strategy on first failure');
    it('should try all strategies in order');
    it('should return default value if all fail');
    it('should throw if no default and all fail');
    it('should skip strategies with shouldAttempt = false');
    it('should respect per-strategy timeouts');
  });

  describe('Strategy Management', () => {
    it('should add strategy at end');
    it('should add strategy at specific index');
    it('should remove strategy by name');
    it('should return false when removing non-existent strategy');
    it('should get strategy names in order');
  });

  describe('Result Metadata', () => {
    it('should include strategy index');
    it('should include strategy name');
    it('should collect all errors');
    it('should track total duration');
    it('should indicate success/failure');
  });

  describe('Edge Cases', () => {
    it('should handle single strategy');
    it('should handle all strategies timing out');
    it('should handle strategies that throw synchronously');
    it('should handle async shouldAttempt predicate');
  });
});
```

### 2.4 Bulkhead Manager

**File**: `src/resilience/BulkheadManager.ts`

```typescript
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
  constructor(config: Partial<BulkheadConfig>);

  /**
   * Executes an operation through the bulkhead
   * @template T - Return type
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws Error if queue is full or operation times out
   */
  async execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Gets current bulkhead statistics
   * @returns Current stats
   */
  getStats(): Readonly<BulkheadStats>;

  /**
   * Checks if bulkhead has capacity
   * @returns True if can accept more operations
   */
  hasCapacity(): boolean;

  /**
   * Clears the queue (cancels all waiting operations)
   */
  clearQueue(): void;

  /**
   * Attempts to dequeue and execute next operation
   * @private
   */
  private processQueue(): void;

  /**
   * Removes operation from queue
   * @param operation - Operation to remove
   * @private
   */
  private removeFromQueue(operation: QueuedOperation<any>): void;
}
```

### Unit Tests for Bulkhead Manager

**File**: `src/resilience/BulkheadManager.test.ts`

```typescript
describe('BulkheadManager', () => {
  describe('Constructor', () => {
    it('should initialize with default config');
    it('should accept partial config');
    it('should validate positive limits');
  });

  describe('Execute', () => {
    it('should execute immediately when under limit');
    it('should queue when at max concurrent');
    it('should reject when queue is full');
    it('should process queue as operations complete');
    it('should timeout queued operations');
    it('should update active count correctly');
  });

  describe('Capacity', () => {
    it('should report capacity when under limit');
    it('should report no capacity when full');
    it('should restore capacity after completion');
  });

  describe('Statistics', () => {
    it('should track active count');
    it('should track queued count');
    it('should track total executed');
    it('should track total rejected');
    it('should track total timed out');
    it('should calculate load percentage');
  });

  describe('Queue Management', () => {
    it('should clear queue');
    it('should cancel timeouts on clear');
    it('should reject cleared operations');
    it('should process FIFO');
  });

  describe('Concurrent Operations', () => {
    it('should handle max concurrent operations');
    it('should handle rapid operation completion');
    it('should maintain correct counts under load');
  });
});
```

### 2.5 Timeout Manager

**File**: `src/resilience/TimeoutManager.ts`

```typescript
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
  );
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
  constructor(config: Partial<TimeoutConfig>);

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
    operationName?: string
  ): Promise<T>;

  /**
   * Gets timeout duration for a specific level
   * @param level - Timeout level
   * @returns Timeout in milliseconds
   */
  getTimeout(level: TimeoutLevel): number;

  /**
   * Sets timeout duration for a specific level
   * @param level - Timeout level
   * @param ms - New timeout value
   */
  setTimeout(level: TimeoutLevel, ms: number): void;

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
  ): Promise<never>;

  /**
   * Validates timeout hierarchy (connection < request < operation < global)
   * @throws Error if hierarchy is violated
   * @private
   */
  private validateHierarchy(): void;
}
```

### Unit Tests for Timeout Manager

**File**: `src/resilience/TimeoutManager.test.ts`

```typescript
describe('TimeoutManager', () => {
  describe('Constructor', () => {
    it('should initialize with default config');
    it('should accept partial config');
    it('should validate timeout hierarchy');
    it('should throw on invalid hierarchy');
  });

  describe('Execute', () => {
    it('should complete operation within timeout');
    it('should throw TimeoutError on timeout');
    it('should include timeout level in error');
    it('should include operation name in error');
    it('should respect different timeout levels');
  });

  describe('Timeout Management', () => {
    it('should get timeout for level');
    it('should set timeout for level');
    it('should revalidate hierarchy on set');
    it('should throw on invalid hierarchy update');
  });

  describe('Timeout Levels', () => {
    it('should enforce CONNECTION timeout');
    it('should enforce REQUEST timeout');
    it('should enforce OPERATION timeout');
    it('should enforce GLOBAL timeout');
  });

  describe('Edge Cases', () => {
    it('should handle instant completion');
    it('should handle exactly timeout duration');
    it('should handle multiple concurrent operations');
    it('should clean up timeout timers on success');
  });
});
```

---

## 3. Performance Components

### 3.1 Cache Manager

**File**: `src/performance/CacheManager.ts`

```typescript
/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hitCount: number;
  lastAccessedAt: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  size: number;
  capacity: number;
}

/**
 * Cache layer configuration
 */
export interface CacheLayerConfig {
  /**
   * Maximum number of entries
   */
  capacity: number;

  /**
   * Default TTL in seconds
   */
  defaultTTL: number;

  /**
   * Enable LRU eviction
   */
  enableLRU: boolean;
}

/**
 * Multi-layer cache manager
 * Implements L1 (memory), L2 (IndexedDB), L3 (network) caching strategy
 */
export class CacheManager<T = any> {
  private l1Cache: Map<string, CacheEntry<T>>;
  private l1Config: CacheLayerConfig;
  private stats: CacheStats;
  private cleanupInterval: NodeJS.Timeout;

  /**
   * Creates a new cache manager
   * @param config - Cache layer configuration
   */
  constructor(config: Partial<CacheLayerConfig>);

  /**
   * Gets a value from cache
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  async get(key: string): Promise<T | undefined>;

  /**
   * Sets a value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (optional, uses default)
   */
  async set(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Checks if key exists in cache
   * @param key - Cache key
   * @returns True if key exists and not expired
   */
  async has(key: string): Promise<boolean>;

  /**
   * Deletes a value from cache
   * @param key - Cache key
   * @returns True if deleted
   */
  async delete(key: string): Promise<boolean>;

  /**
   * Clears all cache entries
   */
  async clear(): Promise<void>;

  /**
   * Gets cache statistics
   * @returns Current cache stats
   */
  getStats(): Readonly<CacheStats>;

  /**
   * Resets cache statistics
   */
  resetStats(): void;

  /**
   * Generates cache key from components
   * @param parts - Key components
   * @returns Generated cache key
   */
  static generateKey(...parts: (string | number)[]): string;

  /**
   * Promotes value to L1 cache
   * @param key - Cache key
   * @param value - Value to promote
   * @private
   */
  private promoteToL1(key: string, value: T): void;

  /**
   * Evicts least recently used entry
   * @private
   */
  private evictLRU(): void;

  /**
   * Checks if entry is expired
   * @param entry - Cache entry
   * @returns True if expired
   * @private
   */
  private isExpired(entry: CacheEntry<T>): boolean;

  /**
   * Removes expired entries
   * @private
   */
  private cleanup(): void;

  /**
   * Destroys cache manager and cleans up resources
   */
  destroy(): void;
}

/**
 * TTL strategy definitions
 */
export const TTL_STRATEGY = {
  // Static data
  TOKEN_METADATA: 86400,    // 24 hours
  CONTRACT_ABI: 604800,     // 7 days

  // Semi-dynamic data
  BALANCE: 60,              // 1 minute
  TRANSACTION: 300,         // 5 minutes

  // Dynamic data
  GAS_PRICE: 10,            // 10 seconds
  EXCHANGE_RATE: 30,        // 30 seconds

  // User-specific
  PORTFOLIO: 120,           // 2 minutes
} as const;
```

### Unit Tests for Cache Manager

**File**: `src/performance/CacheManager.test.ts`

```typescript
describe('CacheManager', () => {
  describe('Constructor', () => {
    it('should initialize with default config');
    it('should accept partial config');
    it('should start cleanup interval');
  });

  describe('Get/Set', () => {
    it('should set and get value');
    it('should return undefined for missing key');
    it('should return undefined for expired key');
    it('should use default TTL');
    it('should use custom TTL');
    it('should update last accessed time');
    it('should increment hit count');
  });

  describe('Has', () => {
    it('should return true for existing key');
    it('should return false for missing key');
    it('should return false for expired key');
  });

  describe('Delete', () => {
    it('should delete existing key');
    it('should return false for non-existent key');
    it('should update stats');
  });

  describe('Clear', () => {
    it('should remove all entries');
    it('should update stats');
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when full');
    it('should evict oldest if no access data');
    it('should update eviction stats');
    it('should maintain capacity');
  });

  describe('Expiration', () => {
    it('should expire entries after TTL');
    it('should cleanup expired entries periodically');
    it('should not return expired entries');
  });

  describe('Statistics', () => {
    it('should track hits');
    it('should track misses');
    it('should track sets');
    it('should track deletes');
    it('should track evictions');
    it('should calculate hit rate');
    it('should track size and capacity');
    it('should reset stats');
  });

  describe('Key Generation', () => {
    it('should generate consistent keys');
    it('should handle string parts');
    it('should handle number parts');
    it('should handle mixed types');
  });

  describe('Cleanup', () => {
    it('should destroy cache manager');
    it('should stop cleanup interval');
    it('should clear all entries on destroy');
  });
});
```

### 3.2 Batch Processor

**File**: `src/performance/BatchProcessor.ts`

```typescript
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
    config: Partial<BatchConfig>
  );

  /**
   * Adds a request to the batch
   * @param request - Request to add
   * @returns Promise that resolves with the response
   */
  async add(request: TRequest): Promise<TResponse>;

  /**
   * Manually flushes the current batch
   * @returns Number of requests flushed
   */
  async flush(): Promise<number>;

  /**
   * Gets batch statistics
   * @returns Current stats
   */
  getStats(): Readonly<BatchStats>;

  /**
   * Clears pending requests
   * @param error - Error to reject pending requests with
   */
  clear(error?: Error): void;

  /**
   * Starts the batch window timer
   * @private
   */
  private startTimer(): void;

  /**
   * Stops the batch window timer
   * @private
   */
  private stopTimer(): void;

  /**
   * Processes the current batch
   * @private
   */
  private async processBatch(): Promise<void>;

  /**
   * Updates batch statistics
   * @param batchSize - Size of processed batch
   * @private
   */
  private updateStats(batchSize: number): void;

  /**
   * Destroys batch processor
   */
  destroy(): void;
}
```

### Unit Tests for Batch Processor

**File**: `src/performance/BatchProcessor.test.ts`

```typescript
describe('BatchProcessor', () => {
  describe('Constructor', () => {
    it('should initialize with default config');
    it('should accept partial config');
    it('should require processor function');
  });

  describe('Add', () => {
    it('should add request to queue');
    it('should start timer on first request');
    it('should flush automatically after window');
    it('should flush automatically at max size');
    it('should return correct response for request');
  });

  describe('Flush', () => {
    it('should process all queued requests');
    it('should return number of flushed requests');
    it('should clear queue after flush');
    it('should handle empty queue');
    it('should stop timer after flush');
  });

  describe('Batching', () => {
    it('should combine requests in time window');
    it('should maintain request-response mapping');
    it('should handle max batch size');
    it('should create multiple batches if needed');
  });

  describe('Error Handling', () => {
    it('should reject all requests on processor error');
    it('should handle partial processor failures');
    it('should continue processing after error');
  });

  describe('Statistics', () => {
    it('should track total batches');
    it('should track total requests');
    it('should calculate average batch size');
    it('should track largest batch');
    it('should track smallest batch');
  });

  describe('Clear', () => {
    it('should clear pending requests');
    it('should reject with provided error');
    it('should stop timer');
  });

  describe('Destroy', () => {
    it('should stop timer');
    it('should clear queue');
    it('should reject pending requests');
  });
});
```

### 3.3 Request Coalescer

**File**: `src/performance/RequestCoalescer.ts`

```typescript
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
  constructor();

  /**
   * Executes a request with deduplication
   * If an identical request is in flight, returns the same promise
   * @template T - Return type
   * @param key - Unique key for this request
   * @param fn - Function to execute if not already in flight
   * @returns Result of the request
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T>;

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
  ): string;

  /**
   * Gets coalescer statistics
   * @returns Current stats
   */
  getStats(): Readonly<CoalescerStats>;

  /**
   * Clears all pending requests
   */
  clear(): void;

  /**
   * Checks if a request is in flight
   * @param key - Request key
   * @returns True if request is pending
   */
  isPending(key: string): boolean;

  /**
   * Removes completed request from pending map
   * @param key - Request key
   * @private
   */
  private cleanup(key: string): void;

  /**
   * Periodic cleanup of stale entries
   * @private
   */
  private periodicCleanup(): void;

  /**
   * Destroys coalescer and cleans up resources
   */
  destroy(): void;
}
```

### Unit Tests for Request Coalescer

**File**: `src/performance/RequestCoalescer.test.ts`

```typescript
describe('RequestCoalescer', () => {
  describe('Constructor', () => {
    it('should initialize with empty pending map');
    it('should start cleanup interval');
  });

  describe('Execute', () => {
    it('should execute function for new key');
    it('should return same promise for duplicate key');
    it('should coalesce concurrent identical requests');
    it('should execute function after first completes');
    it('should handle errors without affecting other requests');
  });

  describe('Key Generation', () => {
    it('should generate consistent keys');
    it('should include method in key');
    it('should include chainId in key');
    it('should include address in key');
    it('should hash params object');
    it('should generate different keys for different params');
  });

  describe('Statistics', () => {
    it('should track total requests');
    it('should track coalesced requests');
    it('should track unique requests');
    it('should calculate coalesce rate');
    it('should track active requests');
  });

  describe('Cleanup', () => {
    it('should remove completed requests');
    it('should allow new requests after cleanup');
    it('should clear all pending');
  });

  describe('IsPending', () => {
    it('should return true for pending request');
    it('should return false for completed request');
    it('should return false for non-existent key');
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent identical requests');
    it('should handle multiple different concurrent requests');
    it('should coalesce correctly under load');
  });

  describe('Destroy', () => {
    it('should stop cleanup interval');
    it('should clear pending map');
  });
});
```

### 3.4 Connection Pool

**File**: `src/performance/ConnectionPool.ts`

```typescript
/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  /**
   * Minimum number of connections to maintain
   * @default 2
   */
  minConnections: number;

  /**
   * Maximum number of connections
   * @default 10
   */
  maxConnections: number;

  /**
   * Idle connection timeout (ms)
   * @default 30000
   */
  idleTimeout: number;

  /**
   * Connection establishment timeout (ms)
   * @default 5000
   */
  connectionTimeout: number;

  /**
   * Health check interval (ms)
   * @default 60000
   */
  healthCheckInterval: number;

  /**
   * Strategy for connection selection
   * @default 'LIFO'
   */
  strategy: 'LIFO' | 'FIFO' | 'ROUND_ROBIN';
}

/**
 * Connection wrapper with metadata
 * @private
 */
interface PooledConnection<T> {
  connection: T;
  id: string;
  createdAt: number;
  lastUsedAt: number;
  isHealthy: boolean;
  useCount: number;
}

/**
 * Connection pool statistics
 */
export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalCreated: number;
  totalDestroyed: number;
  totalReused: number;
  healthChecksFailed: number;
}

/**
 * Connection factory interface
 */
export interface ConnectionFactory<T> {
  /**
   * Creates a new connection
   * @returns New connection instance
   */
  create(): Promise<T>;

  /**
   * Destroys a connection
   * @param connection - Connection to destroy
   */
  destroy(connection: T): Promise<void>;

  /**
   * Checks if connection is healthy
   * @param connection - Connection to check
   * @returns True if healthy
   */
  isHealthy(connection: T): Promise<boolean>;
}

/**
 * Connection pool for efficient resource management
 * Maintains pool of reusable connections with health checking
 */
export class ConnectionPool<T> {
  private config: ConnectionPoolConfig;
  private factory: ConnectionFactory<T>;
  private available: PooledConnection<T>[];
  private active: Set<string>;
  private stats: PoolStats;
  private healthCheckInterval: NodeJS.Timeout;
  private roundRobinIndex: number;

  /**
   * Creates a new connection pool
   * @param factory - Connection factory
   * @param config - Pool configuration
   */
  constructor(
    factory: ConnectionFactory<T>,
    config: Partial<ConnectionPoolConfig>
  );

  /**
   * Acquires a connection from the pool
   * @returns Connection instance
   * @throws Error if pool is exhausted and cannot create more
   */
  async acquire(): Promise<T>;

  /**
   * Returns a connection to the pool
   * @param connection - Connection to return
   */
  async release(connection: T): Promise<void>;

  /**
   * Executes a function with a pooled connection
   * Automatically acquires and releases connection
   * @template R - Return type
   * @param fn - Function to execute with connection
   * @returns Result of function
   */
  async execute<R>(fn: (connection: T) => Promise<R>): Promise<R>;

  /**
   * Gets pool statistics
   * @returns Current stats
   */
  getStats(): Readonly<PoolStats>;

  /**
   * Drains the pool (closes all connections)
   * @param force - If true, closes active connections immediately
   */
  async drain(force?: boolean): Promise<void>;

  /**
   * Ensures minimum connections are available
   * @private
   */
  private async ensureMinConnections(): Promise<void>;

  /**
   * Creates a new connection
   * @private
   */
  private async createConnection(): Promise<PooledConnection<T>>;

  /**
   * Selects next connection based on strategy
   * @private
   */
  private selectConnection(): PooledConnection<T> | undefined;

  /**
   * Removes idle connections exceeding timeout
   * @private
   */
  private removeIdleConnections(): void;

  /**
   * Performs health checks on idle connections
   * @private
   */
  private async performHealthChecks(): Promise<void>;

  /**
   * Finds pooled connection by instance
   * @param connection - Connection instance
   * @private
   */
  private findPooledConnection(connection: T): PooledConnection<T> | undefined;

  /**
   * Destroys connection pool
   */
  async destroy(): Promise<void>;
}
```

### Unit Tests for Connection Pool

**File**: `src/performance/ConnectionPool.test.ts`

```typescript
describe('ConnectionPool', () => {
  describe('Constructor', () => {
    it('should initialize with default config');
    it('should accept partial config');
    it('should create minimum connections');
    it('should start health check interval');
  });

  describe('Acquire/Release', () => {
    it('should acquire available connection');
    it('should create new connection if none available');
    it('should respect max connections limit');
    it('should reuse released connections');
    it('should update last used time on release');
  });

  describe('Execute', () => {
    it('should execute function with connection');
    it('should release connection after execution');
    it('should release connection on error');
    it('should propagate function result');
    it('should propagate function error');
  });

  describe('Connection Strategy', () => {
    it('should use LIFO strategy');
    it('should use FIFO strategy');
    it('should use ROUND_ROBIN strategy');
  });

  describe('Idle Timeout', () => {
    it('should remove idle connections after timeout');
    it('should maintain minimum connections');
    it('should not remove active connections');
  });

  describe('Health Checks', () => {
    it('should perform periodic health checks');
    it('should remove unhealthy connections');
    it('should replace unhealthy connections to maintain min');
    it('should update health check stats');
  });

  describe('Statistics', () => {
    it('should track total connections');
    it('should track active connections');
    it('should track idle connections');
    it('should track total created');
    it('should track total destroyed');
    it('should track total reused');
    it('should track health check failures');
  });

  describe('Drain', () => {
    it('should close all idle connections');
    it('should wait for active connections');
    it('should force close active if specified');
    it('should prevent new acquisitions after drain');
  });

  describe('Destroy', () => {
    it('should drain pool');
    it('should stop health checks');
    it('should clear all resources');
  });
});
```

---

## 4. Service Layer

### 4.1 Balance Service

**File**: `src/services/BalanceService.ts`

```typescript
import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';
import { IChainAdapter } from '../types/IChainAdapter';
import { CacheManager } from '../performance/CacheManager';
import { BatchProcessor } from '../performance/BatchProcessor';
import { RequestCoalescer } from '../performance/RequestCoalescer';
import { CircuitBreaker } from '../resilience/CircuitBreaker';
import { RetryPolicy } from '../resilience/RetryPolicy';

/**
 * Balance query options
 */
export interface BalanceQueryOptions {
  /**
   * Force fresh fetch (bypass cache)
   * @default false
   */
  forceFresh?: boolean;

  /**
   * Include token balances
   * @default false
   */
  includeTokens?: boolean;

  /**
   * Specific token addresses to query
   */
  tokenAddresses?: Address[];

  /**
   * Custom cache TTL (seconds)
   */
  cacheTTL?: number;
}

/**
 * Multi-chain balance query
 */
export interface MultiChainBalanceQuery {
  address: Address;
  chainIds: number[];
  options?: BalanceQueryOptions;
}

/**
 * Balance result with metadata
 */
export interface BalanceResult {
  balance: Balance;
  chainId: number;
  cached: boolean;
  fetchedAt: Date;
  latency: number;
}

/**
 * Aggregated multi-chain balance
 */
export interface AggregatedBalance {
  address: Address;
  results: BalanceResult[];
  totalValueUSD: number;
  errors: Map<number, Error>;
}

/**
 * Balance service configuration
 */
export interface BalanceServiceConfig {
  /**
   * Enable caching
   * @default true
   */
  enableCache: boolean;

  /**
   * Enable batching
   * @default true
   */
  enableBatching: boolean;

  /**
   * Enable request coalescing
   * @default true
   */
  enableCoalescing: boolean;

  /**
   * Default cache TTL (seconds)
   * @default 60
   */
  defaultCacheTTL: number;
}

/**
 * Balance service for fetching and managing balance data
 * Implements caching, batching, and resilience patterns
 */
export class BalanceService {
  private adapters: Map<number, IChainAdapter>;
  private cache: CacheManager<Balance>;
  private batchProcessor: BatchProcessor<BalanceRequest, Balance>;
  private coalescer: RequestCoalescer;
  private circuitBreakers: Map<number, CircuitBreaker>;
  private retryPolicy: RetryPolicy;
  private config: BalanceServiceConfig;

  /**
   * Creates a new balance service
   * @param adapters - Map of chain ID to adapter instances
   * @param config - Service configuration
   */
  constructor(
    adapters: Map<number, IChainAdapter>,
    config?: Partial<BalanceServiceConfig>
  );

  /**
   * Fetches native balance for an address on a specific chain
   * @param address - Wallet address
   * @param chainId - Chain ID
   * @param options - Query options
   * @returns Balance data
   * @throws ValidationError if address or chainId invalid
   * @throws ConnectionError if RPC fails
   */
  async getBalance(
    address: Address,
    chainId: number,
    options?: BalanceQueryOptions
  ): Promise<Balance>;

  /**
   * Fetches token balances for an address
   * @param address - Wallet address
   * @param chainId - Chain ID
   * @param tokenAddresses - Specific tokens (optional, uses popular if empty)
   * @param options - Query options
   * @returns Array of token balances
   */
  async getTokenBalances(
    address: Address,
    chainId: number,
    tokenAddresses?: Address[],
    options?: BalanceQueryOptions
  ): Promise<Balance[]>;

  /**
   * Fetches balances across multiple chains
   * @param query - Multi-chain balance query
   * @returns Aggregated balance results
   */
  async getMultiChainBalance(
    query: MultiChainBalanceQuery
  ): Promise<AggregatedBalance>;

  /**
   * Batch fetches balances for multiple addresses on single chain
   * @param addresses - Array of addresses
   * @param chainId - Chain ID
   * @param options - Query options
   * @returns Map of address to balance
   */
  async getBatchBalances(
    addresses: Address[],
    chainId: number,
    options?: BalanceQueryOptions
  ): Promise<Map<Address, Balance>>;

  /**
   * Subscribes to balance updates for an address
   * @param address - Address to monitor
   * @param chainId - Chain ID
   * @param callback - Callback invoked on balance change
   * @returns Unsubscribe function
   */
  async subscribeToBalance(
    address: Address,
    chainId: number,
    callback: (balance: Balance) => void
  ): Promise<() => void>;

  /**
   * Invalidates cache for specific address/chain
   * @param address - Address
   * @param chainId - Chain ID
   */
  invalidateCache(address: Address, chainId: number): void;

  /**
   * Clears all cached balances
   */
  clearCache(): void;

  /**
   * Gets service statistics
   * @returns Combined stats from all components
   */
  getStats(): {
    cache: ReturnType<CacheManager['getStats']>;
    batch: ReturnType<BatchProcessor<any, any>['getStats']>;
    coalescer: ReturnType<RequestCoalescer['getStats']>;
  };

  /**
   * Fetches balance from chain (internal)
   * @param address - Address
   * @param chainId - Chain ID
   * @returns Balance data
   * @private
   */
  private async fetchFromChain(
    address: Address,
    chainId: number
  ): Promise<Balance>;

  /**
   * Gets adapter for chain
   * @param chainId - Chain ID
   * @returns Chain adapter
   * @throws ValidationError if chain not supported
   * @private
   */
  private getAdapter(chainId: number): IChainAdapter;

  /**
   * Generates cache key for balance
   * @param address - Address
   * @param chainId - Chain ID
   * @param isToken - Whether this is a token balance
   * @param tokenAddress - Token contract address
   * @private
   */
  private getCacheKey(
    address: Address,
    chainId: number,
    isToken: boolean,
    tokenAddress?: Address
  ): string;
}

/**
 * Internal balance request type
 * @private
 */
interface BalanceRequest {
  address: Address;
  chainId: number;
  isToken: boolean;
  tokenAddress?: Address;
}
```

### Unit Tests for Balance Service

**File**: `src/services/BalanceService.test.ts`

```typescript
describe('BalanceService', () => {
  describe('Constructor', () => {
    it('should initialize with adapters');
    it('should accept partial config');
    it('should create cache manager');
    it('should create batch processor');
    it('should create coalescer');
    it('should create circuit breakers per chain');
  });

  describe('getBalance', () => {
    it('should fetch native balance');
    it('should return cached balance');
    it('should force fresh fetch when requested');
    it('should use custom cache TTL');
    it('should throw on invalid address');
    it('should throw on unsupported chain');
    it('should retry on transient errors');
    it('should use circuit breaker');
  });

  describe('getTokenBalances', () => {
    it('should fetch token balances');
    it('should use popular tokens if none specified');
    it('should filter zero balances');
    it('should cache token balances separately');
    it('should batch token requests');
  });

  describe('getMultiChainBalance', () => {
    it('should fetch from multiple chains');
    it('should aggregate results');
    it('should calculate total USD value');
    it('should collect errors per chain');
    it('should continue on partial failures');
  });

  describe('getBatchBalances', () => {
    it('should batch multiple addresses');
    it('should return map of results');
    it('should use request coalescing');
  });

  describe('subscribeToBalance', () => {
    it('should subscribe to balance updates');
    it('should invoke callback on change');
    it('should return unsubscribe function');
    it('should update cache on change');
  });

  describe('Cache Management', () => {
    it('should invalidate specific cache entry');
    it('should clear all cache');
    it('should respect cache TTL');
  });

  describe('Statistics', () => {
    it('should return cache stats');
    it('should return batch stats');
    it('should return coalescer stats');
  });

  describe('Error Handling', () => {
    it('should handle adapter errors');
    it('should handle circuit breaker open');
    it('should handle rate limit errors');
    it('should handle timeout errors');
  });
});
```

### 4.2 Transaction Service

**File**: `src/services/TransactionService.ts`

```typescript
import { Address } from 'viem';
import { Transaction, TransactionType, TransactionStatus } from '@cygnus-wealth/data-models';
import { IChainAdapter, TransactionOptions } from '../types/IChainAdapter';
import { CacheManager } from '../performance/CacheManager';

/**
 * Transaction query options
 */
export interface TransactionQueryOptions extends TransactionOptions {
  /**
   * Filter by transaction type
   */
  types?: TransactionType[];

  /**
   * Filter by status
   */
  statuses?: TransactionStatus[];

  /**
   * Filter by date range
   */
  dateRange?: {
    from: Date;
    to: Date;
  };

  /**
   * Include pending transactions
   * @default true
   */
  includePending?: boolean;

  /**
   * Force fresh fetch (bypass cache)
   * @default false
   */
  forceFresh?: boolean;
}

/**
 * Paginated transaction result
 */
export interface PaginatedTransactions {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Transaction subscription options
 */
export interface TransactionSubscriptionOptions {
  /**
   * Filter by transaction types
   */
  types?: TransactionType[];

  /**
   * Include pending transactions
   * @default true
   */
  includePending?: boolean;
}

/**
 * Transaction service configuration
 */
export interface TransactionServiceConfig {
  /**
   * Enable caching
   * @default true
   */
  enableCache: boolean;

  /**
   * Default page size
   * @default 50
   */
  defaultPageSize: number;

  /**
   * Cache TTL for transactions (seconds)
   * @default 300
   */
  cacheTTL: number;

  /**
   * Maximum transactions per request
   * @default 1000
   */
  maxTransactions: number;
}

/**
 * Transaction service for fetching and monitoring transactions
 * Implements pagination, filtering, and real-time monitoring
 */
export class TransactionService {
  private adapters: Map<number, IChainAdapter>;
  private cache: CacheManager<Transaction[]>;
  private config: TransactionServiceConfig;
  private subscriptions: Map<string, () => void>;

  /**
   * Creates a new transaction service
   * @param adapters - Map of chain ID to adapter instances
   * @param config - Service configuration
   */
  constructor(
    adapters: Map<number, IChainAdapter>,
    config?: Partial<TransactionServiceConfig>
  );

  /**
   * Fetches transaction history for an address
   * @param address - Wallet address
   * @param chainId - Chain ID
   * @param options - Query options
   * @returns Paginated transaction results
   */
  async getTransactions(
    address: Address,
    chainId: number,
    options?: TransactionQueryOptions
  ): Promise<PaginatedTransactions>;

  /**
   * Fetches a specific transaction by hash
   * @param txHash - Transaction hash
   * @param chainId - Chain ID
   * @returns Transaction data
   * @throws DataError if transaction not found
   */
  async getTransaction(
    txHash: string,
    chainId: number
  ): Promise<Transaction>;

  /**
   * Fetches pending transactions for an address
   * @param address - Wallet address
   * @param chainId - Chain ID
   * @returns Array of pending transactions
   */
  async getPendingTransactions(
    address: Address,
    chainId: number
  ): Promise<Transaction[]>;

  /**
   * Subscribes to new transactions for an address
   * @param address - Address to monitor
   * @param chainId - Chain ID
   * @param callback - Callback invoked on new transaction
   * @param options - Subscription options
   * @returns Unsubscribe function
   */
  async subscribeToTransactions(
    address: Address,
    chainId: number,
    callback: (transaction: Transaction) => void,
    options?: TransactionSubscriptionOptions
  ): Promise<() => void>;

  /**
   * Unsubscribes from all transaction monitoring
   * @param address - Address (optional, unsubscribes all if not provided)
   * @param chainId - Chain ID (optional)
   */
  unsubscribeAll(address?: Address, chainId?: number): void;

  /**
   * Filters transactions by criteria
   * @param transactions - Transactions to filter
   * @param options - Filter options
   * @returns Filtered transactions
   * @private
   */
  private filterTransactions(
    transactions: Transaction[],
    options: TransactionQueryOptions
  ): Transaction[];

  /**
   * Applies pagination to transactions
   * @param transactions - Transactions to paginate
   * @param page - Page number (1-indexed)
   * @param pageSize - Items per page
   * @returns Paginated result
   * @private
   */
  private paginateTransactions(
    transactions: Transaction[],
    page: number,
    pageSize: number
  ): PaginatedTransactions;

  /**
   * Generates cache key for transaction query
   * @param address - Address
   * @param chainId - Chain ID
   * @param options - Query options
   * @private
   */
  private getCacheKey(
    address: Address,
    chainId: number,
    options?: TransactionQueryOptions
  ): string;
}
```

### Unit Tests for Transaction Service

**File**: `src/services/TransactionService.test.ts`

```typescript
describe('TransactionService', () => {
  describe('Constructor', () => {
    it('should initialize with adapters');
    it('should accept partial config');
    it('should create cache manager');
  });

  describe('getTransactions', () => {
    it('should fetch transaction history');
    it('should paginate results');
    it('should filter by type');
    it('should filter by status');
    it('should filter by date range');
    it('should exclude pending if requested');
    it('should use cache');
    it('should force fresh fetch when requested');
  });

  describe('getTransaction', () => {
    it('should fetch specific transaction');
    it('should throw if not found');
    it('should use cache');
  });

  describe('getPendingTransactions', () => {
    it('should fetch pending transactions');
    it('should filter completed transactions');
  });

  describe('subscribeToTransactions', () => {
    it('should subscribe to new transactions');
    it('should invoke callback on new transaction');
    it('should filter by type if specified');
    it('should include/exclude pending based on option');
    it('should return unsubscribe function');
  });

  describe('Filtering', () => {
    it('should filter by single type');
    it('should filter by multiple types');
    it('should filter by status');
    it('should filter by date range');
    it('should combine multiple filters');
  });

  describe('Pagination', () => {
    it('should paginate results');
    it('should calculate total pages');
    it('should indicate hasMore correctly');
    it('should handle empty results');
    it('should handle partial last page');
  });

  describe('Subscription Management', () => {
    it('should unsubscribe specific address');
    it('should unsubscribe specific chain');
    it('should unsubscribe all');
  });
});
```

### 4.3 Tracking Service

**File**: `src/services/TrackingService.ts`

```typescript
import { Address } from 'viem';
import { Balance, Transaction } from '@cygnus-wealth/data-models';

/**
 * Tracking configuration for an address
 */
export interface AddressTrackingConfig {
  /**
   * Address to track
   */
  address: Address;

  /**
   * Chain IDs to track on
   */
  chainIds: number[];

  /**
   * Polling interval (ms)
   * @default 30000
   */
  pollingInterval?: number;

  /**
   * Track balance changes
   * @default true
   */
  trackBalances?: boolean;

  /**
   * Track new transactions
   * @default true
   */
  trackTransactions?: boolean;

  /**
   * Track token balances
   * @default false
   */
  trackTokens?: boolean;

  /**
   * Specific token addresses to track
   */
  tokenAddresses?: Address[];

  /**
   * Custom label for this address
   */
  label?: string;
}

/**
 * Balance change event
 */
export interface BalanceChangeEvent {
  address: Address;
  chainId: number;
  oldBalance: Balance;
  newBalance: Balance;
  timestamp: Date;
}

/**
 * New transaction event
 */
export interface NewTransactionEvent {
  address: Address;
  chainId: number;
  transaction: Transaction;
  timestamp: Date;
}

/**
 * Event handlers for tracking
 */
export interface TrackingEventHandlers {
  onBalanceChange?: (event: BalanceChangeEvent) => void;
  onNewTransaction?: (event: NewTransactionEvent) => void;
  onError?: (error: Error, address: Address, chainId: number) => void;
}

/**
 * Tracking status for an address
 */
export interface TrackingStatus {
  address: Address;
  chainIds: number[];
  isActive: boolean;
  lastUpdate: Date;
  errorCount: number;
  lastError?: Error;
}

/**
 * Tracking service for monitoring multiple addresses across chains
 * Coordinates balance and transaction monitoring
 */
export class TrackingService {
  private configs: Map<Address, AddressTrackingConfig>;
  private intervals: Map<string, NodeJS.Timeout>;
  private handlers: TrackingEventHandlers;
  private status: Map<Address, Map<number, TrackingStatus>>;
  private balanceCache: Map<string, Balance>;
  private balanceService: BalanceService;
  private transactionService: TransactionService;

  /**
   * Creates a new tracking service
   * @param balanceService - Balance service instance
   * @param transactionService - Transaction service instance
   * @param handlers - Event handlers
   */
  constructor(
    balanceService: BalanceService,
    transactionService: TransactionService,
    handlers: TrackingEventHandlers
  );

  /**
   * Starts tracking an address
   * @param config - Tracking configuration
   */
  startTracking(config: AddressTrackingConfig): void;

  /**
   * Stops tracking an address
   * @param address - Address to stop tracking
   * @param chainId - Specific chain (optional, stops all if not provided)
   */
  stopTracking(address: Address, chainId?: number): void;

  /**
   * Updates tracking configuration for an address
   * @param address - Address to update
   * @param updates - Partial configuration updates
   */
  updateTrackingConfig(
    address: Address,
    updates: Partial<AddressTrackingConfig>
  ): void;

  /**
   * Gets tracking status for an address
   * @param address - Address
   * @returns Tracking status per chain
   */
  getTrackingStatus(address: Address): Map<number, TrackingStatus> | undefined;

  /**
   * Gets all tracked addresses
   * @returns Array of tracked addresses
   */
  getTrackedAddresses(): Address[];

  /**
   * Checks if an address is being tracked
   * @param address - Address to check
   * @param chainId - Specific chain (optional)
   * @returns True if being tracked
   */
  isTracking(address: Address, chainId?: number): boolean;

  /**
   * Stops tracking all addresses
   */
  stopAll(): void;

  /**
   * Gets service statistics
   * @returns Tracking statistics
   */
  getStats(): {
    totalAddresses: number;
    totalChains: number;
    activeTracking: number;
    totalErrors: number;
  };

  /**
   * Polls for updates on a specific address/chain
   * @param address - Address
   * @param chainId - Chain ID
   * @param config - Tracking config
   * @private
   */
  private async pollUpdates(
    address: Address,
    chainId: number,
    config: AddressTrackingConfig
  ): Promise<void>;

  /**
   * Checks for balance changes
   * @param address - Address
   * @param chainId - Chain ID
   * @param config - Tracking config
   * @private
   */
  private async checkBalanceChanges(
    address: Address,
    chainId: number,
    config: AddressTrackingConfig
  ): Promise<void>;

  /**
   * Checks for new transactions
   * @param address - Address
   * @param chainId - Chain ID
   * @private
   */
  private async checkNewTransactions(
    address: Address,
    chainId: number
  ): Promise<void>;

  /**
   * Generates interval key for address/chain
   * @param address - Address
   * @param chainId - Chain ID
   * @private
   */
  private getIntervalKey(address: Address, chainId: number): string;

  /**
   * Handles tracking error
   * @param error - Error that occurred
   * @param address - Address
   * @param chainId - Chain ID
   * @private
   */
  private handleError(error: Error, address: Address, chainId: number): void;
}
```

### Unit Tests for Tracking Service

**File**: `src/services/TrackingService.test.ts`

```typescript
describe('TrackingService', () => {
  describe('Constructor', () => {
    it('should initialize with services and handlers');
  });

  describe('startTracking', () => {
    it('should start tracking address on specified chains');
    it('should set up polling intervals');
    it('should create status entries');
    it('should not duplicate tracking');
  });

  describe('stopTracking', () => {
    it('should stop tracking specific chain');
    it('should stop tracking all chains for address');
    it('should clear intervals');
    it('should update status');
  });

  describe('updateTrackingConfig', () => {
    it('should update configuration');
    it('should restart tracking with new config');
    it('should throw if address not tracked');
  });

  describe('Balance Tracking', () => {
    it('should detect balance changes');
    it('should invoke onBalanceChange handler');
    it('should track token balances if enabled');
    it('should cache last known balance');
  });

  describe('Transaction Tracking', () => {
    it('should detect new transactions');
    it('should invoke onNewTransaction handler');
    it('should not duplicate transaction events');
  });

  describe('Polling', () => {
    it('should poll at configured interval');
    it('should continue polling on errors');
    it('should update last update timestamp');
  });

  describe('Status Management', () => {
    it('should track active status');
    it('should track error count');
    it('should track last error');
    it('should track last update time');
  });

  describe('Error Handling', () => {
    it('should invoke onError handler');
    it('should increment error count');
    it('should continue tracking after errors');
  });

  describe('Multiple Addresses', () => {
    it('should track multiple addresses simultaneously');
    it('should track same address on multiple chains');
    it('should maintain separate intervals');
  });

  describe('Statistics', () => {
    it('should count total addresses');
    it('should count total chains');
    it('should count active tracking');
    it('should count total errors');
  });

  describe('stopAll', () => {
    it('should stop all tracking');
    it('should clear all intervals');
    it('should update all statuses');
  });
});
```

---

## 5. Observability Components

### 5.1 Health Monitor

**File**: `src/observability/HealthMonitor.ts`

```typescript
/**
 * Health status levels
 */
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY'
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /**
   * Component name
   */
  component: string;

  /**
   * Health status
   */
  status: HealthStatus;

  /**
   * Check timestamp
   */
  timestamp: Date;

  /**
   * Response time (ms)
   */
  responseTime: number;

  /**
   * Additional details
   */
  details?: Record<string, any>;

  /**
   * Error if check failed
   */
  error?: Error;
}

/**
 * System health summary
 */
export interface SystemHealth {
  /**
   * Overall system status
   */
  status: HealthStatus;

  /**
   * Individual component results
   */
  components: HealthCheckResult[];

  /**
   * Check timestamp
   */
  timestamp: Date;

  /**
   * System uptime (ms)
   */
  uptime: number;
}

/**
 * Health check function
 */
export type HealthCheckFn = () => Promise<HealthCheckResult>;

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /**
   * Component name
   */
  component: string;

  /**
   * Check function
   */
  check: HealthCheckFn;

  /**
   * Check interval (ms)
   * @default 60000
   */
  interval?: number;

  /**
   * Check timeout (ms)
   * @default 5000
   */
  timeout?: number;

  /**
   * Whether this is a critical check
   * @default false
   */
  critical?: boolean;
}

/**
 * Health monitor for continuous system health assessment
 * Aggregates health checks from all components
 */
export class HealthMonitor {
  private checks: Map<string, HealthCheckConfig>;
  private results: Map<string, HealthCheckResult>;
  private intervals: Map<string, NodeJS.Timeout>;
  private startTime: number;

  /**
   * Creates a new health monitor
   */
  constructor();

  /**
   * Registers a health check
   * @param config - Health check configuration
   */
  registerCheck(config: HealthCheckConfig): void;

  /**
   * Unregisters a health check
   * @param component - Component name
   * @returns True if unregistered
   */
  unregisterCheck(component: string): boolean;

  /**
   * Runs all health checks immediately
   * @returns System health summary
   */
  async runHealthChecks(): Promise<SystemHealth>;

  /**
   * Gets status for a specific component
   * @param component - Component name
   * @returns Latest health check result
   */
  getStatus(component: string): HealthCheckResult | undefined;

  /**
   * Gets overall system status
   * @returns Current system health
   */
  getSystemHealth(): SystemHealth;

  /**
   * Starts periodic health checks
   */
  start(): void;

  /**
   * Stops all health checks
   */
  stop(): void;

  /**
   * Runs a single health check
   * @param config - Check configuration
   * @returns Health check result
   * @private
   */
  private async runCheck(config: HealthCheckConfig): Promise<HealthCheckResult>;

  /**
   * Determines overall status from component statuses
   * @param results - Component results
   * @returns Aggregated status
   * @private
   */
  private determineOverallStatus(results: HealthCheckResult[]): HealthStatus;

  /**
   * Creates RPC endpoint health check
   * @param chainId - Chain ID
   * @param adapter - Chain adapter
   * @returns Health check config
   */
  static createRpcHealthCheck(
    chainId: number,
    adapter: IChainAdapter
  ): HealthCheckConfig;

  /**
   * Creates circuit breaker health check
   * @param name - Circuit name
   * @param breaker - Circuit breaker instance
   * @returns Health check config
   */
  static createCircuitBreakerCheck(
    name: string,
    breaker: CircuitBreaker
  ): HealthCheckConfig;

  /**
   * Creates cache health check
   * @param cache - Cache manager instance
   * @returns Health check config
   */
  static createCacheHealthCheck(
    cache: CacheManager<any>
  ): HealthCheckConfig;
}
```

### Unit Tests for Health Monitor

**File**: `src/observability/HealthMonitor.test.ts`

```typescript
describe('HealthMonitor', () => {
  describe('registerCheck', () => {
    it('should register health check');
    it('should start periodic checks');
    it('should not duplicate checks');
  });

  describe('unregisterCheck', () => {
    it('should unregister check');
    it('should stop periodic checks');
    it('should return false for non-existent component');
  });

  describe('runHealthChecks', () => {
    it('should run all registered checks');
    it('should collect all results');
    it('should determine overall status');
    it('should handle check timeouts');
    it('should handle check errors');
  });

  describe('getStatus', () => {
    it('should return latest result');
    it('should return undefined for unknown component');
  });

  describe('getSystemHealth', () => {
    it('should return overall health');
    it('should include all component results');
    it('should calculate uptime');
  });

  describe('Status Determination', () => {
    it('should be HEALTHY if all healthy');
    it('should be DEGRADED if non-critical unhealthy');
    it('should be UNHEALTHY if critical unhealthy');
  });

  describe('Start/Stop', () => {
    it('should start periodic checks');
    it('should stop all checks');
    it('should clear intervals on stop');
  });

  describe('Factory Methods', () => {
    it('should create RPC health check');
    it('should create circuit breaker check');
    it('should create cache health check');
  });
});
```

### 5.2 Metrics Collector

**File**: `src/observability/MetricsCollector.ts`

```typescript
/**
 * Metric types
 */
export enum MetricType {
  COUNTER = 'COUNTER',
  GAUGE = 'GAUGE',
  HISTOGRAM = 'HISTOGRAM',
  SUMMARY = 'SUMMARY'
}

/**
 * Metric labels for categorization
 */
export interface MetricLabels {
  [key: string]: string | number;
}

/**
 * Counter metric
 */
export interface Counter {
  name: string;
  value: number;
  labels: MetricLabels;
}

/**
 * Gauge metric
 */
export interface Gauge {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: Date;
}

/**
 * Histogram bucket
 */
export interface HistogramBucket {
  le: number;
  count: number;
}

/**
 * Histogram metric
 */
export interface Histogram {
  name: string;
  sum: number;
  count: number;
  buckets: HistogramBucket[];
  labels: MetricLabels;
}

/**
 * Summary quantile
 */
export interface SummaryQuantile {
  quantile: number;
  value: number;
}

/**
 * Summary metric
 */
export interface Summary {
  name: string;
  sum: number;
  count: number;
  quantiles: SummaryQuantile[];
  labels: MetricLabels;
}

/**
 * Metrics collector for performance tracking
 * Collects counters, gauges, histograms, and summaries
 */
export class MetricsCollector {
  private counters: Map<string, Counter>;
  private gauges: Map<string, Gauge>;
  private histograms: Map<string, Histogram>;
  private summaries: Map<string, Summary>;

  /**
   * Creates a new metrics collector
   */
  constructor();

  /**
   * Increments a counter
   * @param name - Metric name
   * @param value - Value to add (default 1)
   * @param labels - Metric labels
   */
  incrementCounter(name: string, value?: number, labels?: MetricLabels): void;

  /**
   * Sets a gauge value
   * @param name - Metric name
   * @param value - Current value
   * @param labels - Metric labels
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Records a histogram observation
   * @param name - Metric name
   * @param value - Observed value
   * @param labels - Metric labels
   */
  observeHistogram(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Records a summary observation
   * @param name - Metric name
   * @param value - Observed value
   * @param labels - Metric labels
   */
  observeSummary(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Measures duration of an operation
   * @param name - Metric name
   * @param fn - Function to measure
   * @param labels - Metric labels
   * @returns Result of function
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    labels?: MetricLabels
  ): Promise<T>;

  /**
   * Gets all counters
   * @returns Map of counter name to value
   */
  getCounters(): Map<string, Counter>;

  /**
   * Gets all gauges
   * @returns Map of gauge name to value
   */
  getGauges(): Map<string, Gauge>;

  /**
   * Gets all histograms
   * @returns Map of histogram name to data
   */
  getHistograms(): Map<string, Histogram>;

  /**
   * Gets all summaries
   * @returns Map of summary name to data
   */
  getSummaries(): Map<string, Summary>;

  /**
   * Resets all metrics
   */
  reset(): void;

  /**
   * Exports metrics in Prometheus format
   * @returns Prometheus-formatted metrics string
   */
  exportPrometheus(): string;

  /**
   * Generates metric key from name and labels
   * @param name - Metric name
   * @param labels - Metric labels
   * @returns Unique metric key
   * @private
   */
  private getMetricKey(name: string, labels?: MetricLabels): string;

  /**
   * Calculates histogram percentile
   * @param histogram - Histogram data
   * @param percentile - Percentile (0-100)
   * @returns Percentile value
   * @private
   */
  private calculatePercentile(histogram: Histogram, percentile: number): number;
}

/**
 * Predefined metric names
 */
export const METRICS = {
  // Request metrics
  REQUESTS_TOTAL: 'evm_integration_requests_total',
  REQUESTS_FAILED: 'evm_integration_requests_failed',
  REQUEST_DURATION: 'evm_integration_request_duration_ms',

  // Cache metrics
  CACHE_HITS: 'evm_integration_cache_hits',
  CACHE_MISSES: 'evm_integration_cache_misses',
  CACHE_SIZE: 'evm_integration_cache_size',

  // Circuit breaker metrics
  CIRCUIT_BREAKER_STATE: 'evm_integration_circuit_breaker_state',
  CIRCUIT_BREAKER_TRANSITIONS: 'evm_integration_circuit_breaker_transitions',

  // Connection metrics
  ACTIVE_CONNECTIONS: 'evm_integration_active_connections',
  CONNECTION_POOL_SIZE: 'evm_integration_connection_pool_size',

  // Error metrics
  ERROR_RATE: 'evm_integration_error_rate',
  ERRORS_BY_TYPE: 'evm_integration_errors_by_type',
} as const;
```

### Unit Tests for Metrics Collector

**File**: `src/observability/MetricsCollector.test.ts`

```typescript
describe('MetricsCollector', () => {
  describe('Counter', () => {
    it('should increment counter');
    it('should increment by custom value');
    it('should support labels');
    it('should maintain separate counters for different labels');
  });

  describe('Gauge', () => {
    it('should set gauge value');
    it('should update timestamp');
    it('should support labels');
  });

  describe('Histogram', () => {
    it('should observe values');
    it('should distribute into buckets');
    it('should calculate sum and count');
    it('should support labels');
  });

  describe('Summary', () => {
    it('should observe values');
    it('should calculate quantiles');
    it('should calculate sum and count');
    it('should support labels');
  });

  describe('measure', () => {
    it('should measure async function duration');
    it('should record duration in histogram');
    it('should propagate function result');
    it('should propagate function error');
  });

  describe('Export', () => {
    it('should export Prometheus format');
    it('should include all metric types');
    it('should include labels');
  });

  describe('Reset', () => {
    it('should clear all metrics');
    it('should allow new metrics after reset');
  });
});
```

### 5.3 Correlation Context

**File**: `src/observability/CorrelationContext.ts`

```typescript
/**
 * Correlation context for distributed tracing
 * Tracks request flow across components
 */
export interface CorrelationContext {
  /**
   * Unique correlation ID for this request chain
   */
  correlationId: string;

  /**
   * Parent span ID (if this is a child operation)
   */
  parentSpanId?: string;

  /**
   * Current span ID
   */
  spanId: string;

  /**
   * Trace ID (groups related requests)
   */
  traceId: string;

  /**
   * Operation name
   */
  operation: string;

  /**
   * Start timestamp
   */
  startTime: number;

  /**
   * Additional metadata
   */
  metadata: Record<string, any>;
}

/**
 * Span for tracking operation execution
 */
export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'success' | 'error';
  error?: Error;
  metadata: Record<string, any>;
}

/**
 * Correlation context manager for distributed tracing
 */
export class CorrelationContextManager {
  private contexts: Map<string, CorrelationContext>;
  private spans: Map<string, Span>;
  private currentContext: CorrelationContext | null;

  /**
   * Creates a new correlation context manager
   */
  constructor();

  /**
   * Creates a new correlation context
   * @param operation - Operation name
   * @param metadata - Additional metadata
   * @returns New context
   */
  createContext(
    operation: string,
    metadata?: Record<string, any>
  ): CorrelationContext;

  /**
   * Creates a child context
   * @param parent - Parent context
   * @param operation - Child operation name
   * @param metadata - Additional metadata
   * @returns Child context
   */
  createChildContext(
    parent: CorrelationContext,
    operation: string,
    metadata?: Record<string, any>
  ): CorrelationContext;

  /**
   * Sets current context for async operations
   * @param context - Context to set
   */
  setCurrentContext(context: CorrelationContext | null): void;

  /**
   * Gets current context
   * @returns Current context or null
   */
  getCurrentContext(): CorrelationContext | null;

  /**
   * Starts a new span
   * @param operation - Operation name
   * @param context - Correlation context (uses current if not provided)
   * @returns Span
   */
  startSpan(operation: string, context?: CorrelationContext): Span;

  /**
   * Ends a span
   * @param spanId - Span ID to end
   * @param error - Error if operation failed
   */
  endSpan(spanId: string, error?: Error): void;

  /**
   * Gets a span by ID
   * @param spanId - Span ID
   * @returns Span or undefined
   */
  getSpan(spanId: string): Span | undefined;

  /**
   * Gets all spans for a trace
   * @param traceId - Trace ID
   * @returns Array of spans
   */
  getTraceSpans(traceId: string): Span[];

  /**
   * Wraps an async function with span tracking
   * @template T - Return type
   * @param operation - Operation name
   * @param fn - Function to wrap
   * @param context - Correlation context
   * @returns Wrapped function result
   */
  async withSpan<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: CorrelationContext
  ): Promise<T>;

  /**
   * Generates unique ID
   * @returns UUID v4
   * @private
   */
  private generateId(): string;

  /**
   * Cleans up old spans (older than 1 hour)
   * @private
   */
  private cleanup(): void;
}

/**
 * Singleton instance for global access
 */
export const correlationContext = new CorrelationContextManager();
```

### Unit Tests for Correlation Context

**File**: `src/observability/CorrelationContext.test.ts`

```typescript
describe('CorrelationContextManager', () => {
  describe('createContext', () => {
    it('should create new context');
    it('should generate unique IDs');
    it('should include operation name');
    it('should include metadata');
  });

  describe('createChildContext', () => {
    it('should create child context');
    it('should link to parent');
    it('should inherit trace ID');
    it('should have unique span ID');
  });

  describe('Context Management', () => {
    it('should set current context');
    it('should get current context');
    it('should clear current context');
  });

  describe('Span Tracking', () => {
    it('should start span');
    it('should end span');
    it('should calculate duration');
    it('should mark success status');
    it('should mark error status');
    it('should include error details');
  });

  describe('withSpan', () => {
    it('should wrap function with span');
    it('should track duration');
    it('should propagate result');
    it('should propagate error');
    it('should always end span');
  });

  describe('Trace Queries', () => {
    it('should get span by ID');
    it('should get all trace spans');
    it('should return spans in order');
  });

  describe('Cleanup', () => {
    it('should remove old spans');
    it('should keep recent spans');
  });
});
```

---

## 6. Validation & Security

### 6.1 Input Validators

**File**: `src/utils/validators.ts`

```typescript
import { Address } from 'viem';
import { ValidationError } from './errors';

/**
 * Input validation utilities
 */
export class Validators {
  /**
   * Validates Ethereum address format
   * @param address - Address to validate
   * @throws ValidationError if invalid
   */
  static validateAddress(address: string): asserts address is Address {
    if (!address) {
      throw ValidationError.invalidAddress(address);
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw ValidationError.invalidAddress(address);
    }
  }

  /**
   * Validates address with checksum (EIP-55)
   * @param address - Address to validate
   * @returns True if checksum valid
   */
  static validateAddressChecksum(address: Address): boolean;

  /**
   * Validates chain ID
   * @param chainId - Chain ID to validate
   * @param supportedChains - Array of supported chain IDs
   * @throws ValidationError if invalid
   */
  static validateChainId(chainId: number, supportedChains: number[]): void;

  /**
   * Validates transaction hash
   * @param hash - Transaction hash
   * @throws ValidationError if invalid
   */
  static validateTxHash(hash: string): void;

  /**
   * Validates block number
   * @param blockNumber - Block number
   * @throws ValidationError if invalid
   */
  static validateBlockNumber(blockNumber: bigint | number): void;

  /**
   * Validates pagination parameters
   * @param page - Page number
   * @param pageSize - Page size
   * @param maxPageSize - Maximum allowed page size
   * @throws ValidationError if invalid
   */
  static validatePagination(
    page: number,
    pageSize: number,
    maxPageSize: number
  ): void;

  /**
   * Validates timeout value
   * @param timeout - Timeout in milliseconds
   * @param min - Minimum allowed value
   * @param max - Maximum allowed value
   * @throws ValidationError if invalid
   */
  static validateTimeout(timeout: number, min: number, max: number): void;

  /**
   * Validates RPC URL format
   * @param url - RPC URL
   * @throws ValidationError if invalid
   */
  static validateRpcUrl(url: string): void;

  /**
   * Sanitizes user input string
   * @param input - Input string
   * @param maxLength - Maximum length
   * @returns Sanitized string
   */
  static sanitizeString(input: string, maxLength?: number): string;

  /**
   * Validates date range
   * @param from - Start date
   * @param to - End date
   * @throws ValidationError if invalid
   */
  static validateDateRange(from: Date, to: Date): void;
}
```

### 6.2 Rate Limiter

**File**: `src/security/RateLimiter.ts`

```typescript
/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /**
   * Maximum tokens (requests) in bucket
   */
  capacity: number;

  /**
   * Tokens added per second
   */
  refillRate: number;

  /**
   * Maximum time to wait for token (ms)
   * @default 5000
   */
  maxWait: number;

  /**
   * Limiter name for metrics
   */
  name?: string;
}

/**
 * Token bucket rate limiter
 * Implements token bucket algorithm for rate limiting
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private tokens: number;
  private lastRefill: number;
  private waiting: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;

  /**
   * Creates a new rate limiter
   * @param config - Rate limiter configuration
   */
  constructor(config: RateLimiterConfig);

  /**
   * Acquires a token (waits if necessary)
   * @returns Promise that resolves when token acquired
   * @throws RateLimitError if max wait exceeded
   */
  async acquire(): Promise<void>;

  /**
   * Tries to acquire a token without waiting
   * @returns True if token acquired
   */
  tryAcquire(): boolean;

  /**
   * Executes a function with rate limiting
   * @template T - Return type
   * @param fn - Function to execute
   * @returns Function result
   */
  async execute<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Gets current token count
   * @returns Available tokens
   */
  getAvailableTokens(): number;

  /**
   * Refills tokens based on elapsed time
   * @private
   */
  private refill(): void;

  /**
   * Processes waiting queue
   * @private
   */
  private processQueue(): void;
}
```

### Unit Tests for Validators

**File**: `src/utils/validators.test.ts`

```typescript
describe('Validators', () => {
  describe('validateAddress', () => {
    it('should accept valid address');
    it('should throw on empty address');
    it('should throw on invalid format');
    it('should throw on wrong length');
    it('should throw on missing 0x prefix');
  });

  describe('validateAddressChecksum', () => {
    it('should validate correct checksum');
    it('should reject incorrect checksum');
  });

  describe('validateChainId', () => {
    it('should accept supported chain');
    it('should throw on unsupported chain');
    it('should throw on negative chain ID');
  });

  describe('validateTxHash', () => {
    it('should accept valid hash');
    it('should throw on invalid format');
  });

  describe('validateBlockNumber', () => {
    it('should accept valid bigint');
    it('should accept valid number');
    it('should throw on negative number');
  });

  describe('validatePagination', () => {
    it('should accept valid params');
    it('should throw on page < 1');
    it('should throw on pageSize < 1');
    it('should throw on pageSize > maxPageSize');
  });

  describe('validateTimeout', () => {
    it('should accept value in range');
    it('should throw on value < min');
    it('should throw on value > max');
  });

  describe('validateRpcUrl', () => {
    it('should accept valid HTTP URL');
    it('should accept valid WS URL');
    it('should throw on invalid URL');
  });

  describe('sanitizeString', () => {
    it('should remove special characters');
    it('should trim whitespace');
    it('should truncate to max length');
  });

  describe('validateDateRange', () => {
    it('should accept valid range');
    it('should throw if from > to');
  });
});
```

### Unit Tests for Rate Limiter

**File**: `src/security/RateLimiter.test.ts`

```typescript
describe('RateLimiter', () => {
  describe('Constructor', () => {
    it('should initialize with config');
    it('should start with full capacity');
  });

  describe('acquire', () => {
    it('should acquire token immediately when available');
    it('should wait for token refill');
    it('should throw on max wait exceeded');
    it('should handle concurrent acquires');
  });

  describe('tryAcquire', () => {
    it('should return true when token available');
    it('should return false when depleted');
    it('should not wait');
  });

  describe('execute', () => {
    it('should execute function after acquiring token');
    it('should propagate function result');
    it('should propagate function error');
  });

  describe('Refill', () => {
    it('should refill tokens over time');
    it('should respect capacity limit');
    it('should calculate refill correctly');
  });

  describe('Queue Processing', () => {
    it('should process waiting requests');
    it('should process in FIFO order');
    it('should reject on timeout');
  });

  describe('getAvailableTokens', () => {
    it('should return current token count');
    it('should include refilled tokens');
  });
});
```

---

## 7. Comprehensive Test Specifications Summary

### Test Coverage Requirements

**Overall Target**: 80% code coverage minimum

**By Component Type**:
- Utilities (errors, validators, mappers): 95%
- Core components (adapters, registry): 90%
- Resilience components: 85%
- Performance components: 85%
- Services: 80%
- Observability: 75%

### Test Categories

#### 1. Unit Tests (80% of test suite)
- Pure function testing
- Class method testing with mocks
- Error condition testing
- Edge case testing
- Type validation testing

#### 2. Integration Tests (15% of test suite)
- Component interaction testing
- Mock external services (RPC providers)
- State management across components
- Error propagation testing
- Resource cleanup testing

#### 3. Contract Tests (4% of test suite)
- Data model compliance
- Interface implementation verification
- Type constraint validation

#### 4. E2E Tests (1% of test suite)
- Complete balance fetch flow
- WebSocket subscription lifecycle
- Multi-chain operations
- Error recovery scenarios

### Test Utilities Needed

**File**: `src/test-utils/index.ts`

```typescript
/**
 * Test utilities for EVM integration testing
 */

/**
 * Creates a mock chain adapter
 */
export function createMockAdapter(chainId: number): IChainAdapter;

/**
 * Creates a mock balance response
 */
export function createMockBalance(params?: Partial<Balance>): Balance;

/**
 * Creates a mock transaction response
 */
export function createMockTransaction(params?: Partial<Transaction>): Transaction;

/**
 * Creates a mock RPC client
 */
export function createMockRpcClient(): MockedPublicClient;

/**
 * Advances fake timers and flushes promises
 */
export async function advanceTimersAndFlush(ms: number): Promise<void>;

/**
 * Waits for condition with timeout
 */
export async function waitFor(
  condition: () => boolean,
  timeout?: number
): Promise<void>;

/**
 * Creates test chain config
 */
export function createTestChainConfig(
  chainId: number,
  overrides?: Partial<ChainConfig>
): ChainConfig;
```

### Test Naming Conventions

**Pattern**: `describe('ComponentName', () => { describe('methodName', () => { it('should...') }) })`

**Examples**:
- `it('should return cached balance when available')`
- `it('should throw ValidationError on invalid address')`
- `it('should retry on transient connection error')`
- `it('should transition circuit from OPEN to HALF_OPEN after timeout')`

### Mock Strategy

**External Dependencies**:
- Mock viem clients and transports
- Mock WebSocket connections
- Mock browser APIs (IndexedDB if used)
- Use fake timers for time-based tests

**Internal Dependencies**:
- Use dependency injection for easy mocking
- Create test doubles for complex components
- Use interface-based mocking

### Continuous Integration

**Pre-commit**:
- Run affected unit tests
- Lint check
- Type check

**CI Pipeline**:
- Run all tests
- Generate coverage report
- Fail if coverage < 80%
- Run E2E tests on main branch only

---

## Implementation Checklist

### Phase 1: Foundation (Week 1)
- [ ] Error hierarchy implementation
- [ ] Validators implementation
- [ ] Test utilities setup
- [ ] Unit tests for errors and validators

### Phase 2: Resilience (Week 2)
- [ ] Timeout manager
- [ ] Circuit breaker
- [ ] Retry policy
- [ ] Unit tests for resilience components

### Phase 3: Performance (Week 2-3)
- [ ] Cache manager
- [ ] Request coalescer
- [ ] Batch processor
- [ ] Connection pool
- [ ] Unit tests for performance components

### Phase 4: Advanced Resilience (Week 3)
- [ ] Fallback chain
- [ ] Bulkhead manager
- [ ] Integration tests for resilience

### Phase 5: Services (Week 4)
- [ ] Balance service
- [ ] Transaction service
- [ ] Tracking service
- [ ] Unit tests for services
- [ ] Integration tests for services

### Phase 6: Observability (Week 5)
- [ ] Health monitor
- [ ] Metrics collector
- [ ] Correlation context
- [ ] Unit tests for observability

### Phase 7: Security (Week 5)
- [ ] Rate limiter
- [ ] Additional validators
- [ ] Security tests

### Phase 8: Integration & E2E (Week 6)
- [ ] Contract tests
- [ ] E2E test scenarios
- [ ] Performance testing
- [ ] Documentation updates

---

## Documentation Requirements

### JSDoc Requirements
- All public methods must have JSDoc
- Include @param with types and descriptions
- Include @returns with type and description
- Include @throws for expected errors
- Include @example for complex methods

### Code Comments
- Complex algorithms need explanation comments
- Non-obvious business logic needs comments
- Performance optimizations need rationale comments
- Security-sensitive code needs warning comments

### README Updates
- Update main README with new features
- Add API documentation
- Add usage examples
- Add troubleshooting guide

---

## Quality Gates

### Before PR Submission
- [ ] All unit tests pass
- [ ] Code coverage ≥ 80%
- [ ] No linting errors
- [ ] No type errors
- [ ] JSDoc complete for public API
- [ ] Manual testing completed

### PR Review Checklist
- [ ] Code follows architecture
- [ ] Error handling comprehensive
- [ ] Resource cleanup implemented
- [ ] Tests cover edge cases
- [ ] Performance considerations addressed
- [ ] Security review passed

---

## Notes for Implementation

### Key Principles
1. **Type Safety**: All components use strict TypeScript with no `any` types except where explicitly documented
2. **Immutability**: Return readonly/frozen objects from getters to prevent external mutation
3. **Error Handling**: All errors should extend IntegrationError hierarchy
4. **Resource Cleanup**: All components with intervals/timers must implement `destroy()` method
5. **Testing**: Aim for 80%+ unit test coverage with edge case testing

### Dependencies
- **viem**: Blockchain interactions
- **isows**: WebSocket support
- **@cygnus-wealth/data-models**: Unified type definitions

### Implementation Order Recommendation
1. Error hierarchy (foundation for everything)
2. Timeout manager (simple, useful for testing others)
3. Circuit breaker (core resilience)
4. Retry policy (core resilience)
5. Cache manager (core performance)
6. Request coalescer (performance)
7. Batch processor (performance)
8. Connection pool (complex, uses others)
9. Fallback chain (orchestration)
10. Bulkhead manager (resource management)
11. Service layer (uses resilience + performance)
12. Observability (uses all others)

### Testing Strategy
- Use `vitest` as test runner
- Mock external dependencies (viem, network calls)
- Use fake timers for time-based tests
- Parameterize tests for multiple scenarios
- Include integration tests for cross-component behavior

---

**END OF UNIT ARCHITECTURE**

**Status**: Ready for implementation by ddd-software-engineer agent

**Document Summary**:
- **Sections**: 7 complete sections covering all components
- **Total Lines**: ~4,500 lines of comprehensive specifications
- **Components**: 18 major components with complete JSDoc specifications
- **Test Specifications**: Comprehensive test outlines for all components
- **Implementation Phases**: 8 phases spanning 6 weeks

**Developer Quick Reference**:
- Start with Section 1 (Error Hierarchy) - foundation for all components
- JSDoc comments are authoritative - implement exactly as specified
- Follow the 8-phase implementation roadmap in the checklist
- Maintain 80%+ test coverage throughout implementation
- Use this document + JSDoc as single source of truth

**Next Steps**:
1. Review complete architecture specifications
2. Begin Phase 1 implementation (Error Hierarchy)
3. Write unit tests alongside implementation (TDD approach)
4. Validate against system architecture continuously
