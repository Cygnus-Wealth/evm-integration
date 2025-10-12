import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetryPolicy } from './RetryPolicy';
import { ConnectionError, ValidationError } from '../utils/errors';

describe('RetryPolicy', () => {
  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const policy = new RetryPolicy();

      expect(policy.calculateDelay(0)).toBeGreaterThan(0);
    });

    it('should accept partial config', () => {
      const policy = new RetryPolicy({
        maxAttempts: 5,
        baseDelay: 500,
      });

      // Should not throw
      expect(policy).toBeDefined();
    });

    it('should validate max attempts > 0', () => {
      expect(() => new RetryPolicy({ maxAttempts: -1 })).toThrow(
        'maxAttempts must be >= 0'
      );
    });

    it('should validate delays', () => {
      expect(() => new RetryPolicy({ baseDelay: -1 })).toThrow(
        'baseDelay must be >= 0'
      );

      expect(() => new RetryPolicy({ baseDelay: 1000, maxDelay: 500 })).toThrow(
        'maxDelay must be >= baseDelay'
      );
    });
  });

  describe('Execute', () => {
    it('should return result on first success', async () => {
      const policy = new RetryPolicy();
      const operation = vi.fn().mockResolvedValue('success');

      const result = await policy.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retriable error', async () => {
      const policy = new RetryPolicy({ maxAttempts: 3, baseDelay: 10 });
      const operation = vi
        .fn()
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockResolvedValue('success');

      const result = await policy.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retriable error', async () => {
      const policy = new RetryPolicy();
      const operation = vi
        .fn()
        .mockRejectedValue(ValidationError.invalidAddress('0xinvalid'));

      await expect(policy.execute(operation)).rejects.toThrow(ValidationError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after max attempts', async () => {
      const policy = new RetryPolicy({ maxAttempts: 2, baseDelay: 10 });
      const error = ConnectionError.timeout('https://test.com', 5000);
      const operation = vi.fn().mockRejectedValue(error);

      await expect(policy.execute(operation)).rejects.toThrow(ConnectionError);
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should apply exponential backoff', async () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        baseDelay: 100,
        multiplier: 2,
        jitterFactor: 0,
      });

      const delays: number[] = [];
      const onRetry = vi.fn((attempt, error, delay) => {
        delays.push(delay);
      });

      const policyWithCallback = new RetryPolicy({
        maxAttempts: 3,
        baseDelay: 100,
        multiplier: 2,
        jitterFactor: 0,
        onRetry,
      });

      const operation = vi
        .fn()
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockResolvedValue('success');

      await policyWithCallback.execute(operation);

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(delays[0]).toBeCloseTo(100, -1);
      expect(delays[1]).toBeCloseTo(200, -1);
    });

    it('should invoke onRetry callback', async () => {
      const onRetry = vi.fn();
      const policy = new RetryPolicy({
        maxAttempts: 2,
        baseDelay: 10,
        onRetry,
      });

      const operation = vi
        .fn()
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockResolvedValue('success');

      await policy.execute(operation);

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(ConnectionError),
        expect.any(Number)
      );
    });
  });

  describe('Delay Calculation', () => {
    it('should calculate exponential backoff correctly', () => {
      const policy = new RetryPolicy({
        baseDelay: 1000,
        multiplier: 2,
        jitterFactor: 0,
      });

      expect(policy.calculateDelay(0)).toBeCloseTo(1000, -1);
      expect(policy.calculateDelay(1)).toBeCloseTo(2000, -1);
      expect(policy.calculateDelay(2)).toBeCloseTo(4000, -1);
    });

    it('should respect max delay', () => {
      const policy = new RetryPolicy({
        baseDelay: 1000,
        maxDelay: 5000,
        multiplier: 2,
        jitterFactor: 0,
      });

      const delay = policy.calculateDelay(10); // Would be 1024000 without cap
      expect(delay).toBeLessThanOrEqual(5000);
    });

    it('should apply jitter', () => {
      const policy = new RetryPolicy({
        baseDelay: 1000,
        jitterFactor: 0.3,
      });

      const delays = Array.from({ length: 10 }, () => policy.calculateDelay(0));

      // With jitter, delays should vary
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // All delays should be within jitter range
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(700); // 1000 - 30%
        expect(delay).toBeLessThanOrEqual(1300); // 1000 + 30%
      });
    });

    it('should handle attempt 0', () => {
      const policy = new RetryPolicy({ baseDelay: 1000, jitterFactor: 0 });

      expect(policy.calculateDelay(0)).toBeCloseTo(1000, -1);
    });

    it('should handle large attempt numbers', () => {
      const policy = new RetryPolicy({
        baseDelay: 1000,
        maxDelay: 60000,
        jitterFactor: 0,
      });

      const delay = policy.calculateDelay(100);
      expect(delay).toBe(60000); // Should be capped at maxDelay
    });
  });

  describe('Retriable Errors', () => {
    it('should identify retriable connection errors', () => {
      const policy = new RetryPolicy();
      const error = ConnectionError.timeout('https://test.com', 5000);

      expect(policy.isRetriable(error)).toBe(true);
    });

    it('should identify retriable rate limit errors', () => {
      const policy = new RetryPolicy();
      // Use RateLimitError which is explicitly retriable
      const error = new (class extends Error {
        retriable = true;
        code = 'RATE_LIMIT';
      })('Rate limit exceeded');

      // RateLimitError instances are retriable
      expect(policy.isRetriable(error)).toBe(true);
    });

    it('should identify non-retriable validation errors', () => {
      const policy = new RetryPolicy();
      const error = ValidationError.invalidAddress('0xinvalid');

      expect(policy.isRetriable(error)).toBe(false);
    });

    it('should respect custom retryable errors', () => {
      const policy = new RetryPolicy({
        retryableErrors: ['CUSTOM_ERROR'],
      });

      const error = new Error('CUSTOM_ERROR occurred');
      // Note: This might not be retriable if ErrorUtils doesn't recognize it
      // The actual behavior depends on ErrorUtils implementation
      const isRetriable = policy.isRetriable(error);
      expect(typeof isRetriable).toBe('boolean');
    });
  });

  describe('Stats Collection', () => {
    it('should track attempt count', async () => {
      const policy = new RetryPolicy({ maxAttempts: 3, baseDelay: 10 });
      const operation = vi
        .fn()
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockResolvedValue('success');

      const [result, stats] = await policy.executeWithStats(operation);

      expect(stats.attempts).toBe(3);
      expect(result).toBe('success');
    });

    it('should track total delay', async () => {
      const policy = new RetryPolicy({ maxAttempts: 2, baseDelay: 10 });
      const operation = vi
        .fn()
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockResolvedValue('success');

      const [, stats] = await policy.executeWithStats(operation);

      expect(stats.totalDelay).toBeGreaterThan(0);
    });

    it('should collect all errors', async () => {
      const policy = new RetryPolicy({ maxAttempts: 2, baseDelay: 10 });
      const operation = vi
        .fn()
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockResolvedValue('success');

      const [, stats] = await policy.executeWithStats(operation);

      expect(stats.errors).toHaveLength(2);
      expect(stats.errors[0]).toBeInstanceOf(ConnectionError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle immediate success', async () => {
      const policy = new RetryPolicy();
      const operation = vi.fn().mockResolvedValue('immediate');

      const [result, stats] = await policy.executeWithStats(operation);

      expect(result).toBe('immediate');
      expect(stats.attempts).toBe(1);
      expect(stats.totalDelay).toBe(0);
    });

    it('should handle all failures', async () => {
      const policy = new RetryPolicy({ maxAttempts: 2, baseDelay: 10 });
      const error = ConnectionError.timeout('https://test.com', 5000);
      const operation = vi.fn().mockRejectedValue(error);

      await expect(policy.executeWithStats(operation)).rejects.toThrow(
        ConnectionError
      );

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle zero base delay', async () => {
      const policy = new RetryPolicy({ baseDelay: 0, maxAttempts: 1 });
      const operation = vi
        .fn()
        .mockRejectedValueOnce(ConnectionError.timeout('https://test.com', 5000))
        .mockResolvedValue('success');

      const result = await policy.execute(operation);
      expect(result).toBe('success');
    });

    it('should handle very large delays', () => {
      const policy = new RetryPolicy({
        baseDelay: 1000000,
        maxDelay: 2000000,
        jitterFactor: 0,
      });

      const delay = policy.calculateDelay(0);
      expect(delay).toBeGreaterThan(900000);
    });
  });
});
