import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntegrationError,
  ConnectionError,
  RateLimitError,
  ValidationError,
  DataError,
  CircuitBreakerError,
  ErrorUtils,
} from './errors';

describe('Error Hierarchy', () => {
  describe('IntegrationError', () => {
    it('should create error with all properties', () => {
      const error = new IntegrationError(
        'Test error',
        'TEST_ERROR',
        true,
        { foo: 'bar' }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.retriable).toBe(true);
      expect(error.context).toEqual({ foo: 'bar' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should serialize to JSON correctly', () => {
      const error = new IntegrationError(
        'Test error',
        'TEST_ERROR',
        false,
        { data: 'value' }
      );

      const json = error.toJSON();

      expect(json.name).toBe('IntegrationError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_ERROR');
      expect(json.retriable).toBe(false);
      expect(json.context).toEqual({ data: 'value' });
      expect(json.timestamp).toBeDefined();
    });

    it('should preserve error chain with cause', () => {
      const cause = new Error('Original error');
      const error = new IntegrationError(
        'Wrapper error',
        'WRAPPER',
        true,
        {},
        cause
      );

      expect(error.cause).toBe(cause);

      const json = error.toJSON();
      expect(json.cause).toEqual({
        name: 'Error',
        message: 'Original error',
      });
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const error = new IntegrationError('Test', 'TEST', false);
      const after = Date.now();

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after);
    });

    it('should sanitize context in toJSON', () => {
      const error = new IntegrationError('Test', 'TEST', false, {
        apiKey: 'secret123',
        publicData: 'visible',
      });

      const json = error.toJSON();
      expect(json.context.apiKey).toBe('[REDACTED]');
      expect(json.context.publicData).toBe('visible');
    });
  });

  describe('ConnectionError', () => {
    it('should be retriable by default', () => {
      const error = new ConnectionError(
        'Connection failed',
        'CONNECTION_ERROR',
        'https://rpc.example.com',
        'TIMEOUT'
      );

      expect(error.retriable).toBe(true);
    });

    it('should create timeout error with factory', () => {
      const error = ConnectionError.timeout('https://rpc.example.com', 5000);

      expect(error.code).toBe('CONNECTION_TIMEOUT');
      expect(error.connectionType).toBe('TIMEOUT');
      expect(error.endpoint).toBe('https://rpc.example.com');
      expect(error.context.timeoutMs).toBe(5000);
    });

    it('should create refused error with factory', () => {
      const error = ConnectionError.refused('https://rpc.example.com');

      expect(error.code).toBe('CONNECTION_REFUSED');
      expect(error.connectionType).toBe('REFUSED');
    });

    it('should include endpoint in context', () => {
      const error = new ConnectionError(
        'Failed',
        'ERROR',
        'https://rpc.example.com',
        'RESET'
      );

      expect(error.endpoint).toBe('https://rpc.example.com');
    });

    it('should categorize connection types correctly', () => {
      const timeout = new ConnectionError('', '', '', 'TIMEOUT');
      const refused = new ConnectionError('', '', '', 'REFUSED');
      const reset = new ConnectionError('', '', '', 'RESET');
      const dnsFailed = new ConnectionError('', '', '', 'DNS_FAILED');
      const unknown = new ConnectionError('', '', '', 'UNKNOWN');

      expect(timeout.connectionType).toBe('TIMEOUT');
      expect(refused.connectionType).toBe('REFUSED');
      expect(reset.connectionType).toBe('RESET');
      expect(dnsFailed.connectionType).toBe('DNS_FAILED');
      expect(unknown.connectionType).toBe('UNKNOWN');
    });
  });

  describe('RateLimitError', () => {
    it('should be retriable', () => {
      const error = new RateLimitError('Rate limited', Date.now() + 5000, 10, 60, 'provider');
      expect(error.retriable).toBe(true);
    });

    it('should calculate wait time correctly', () => {
      const resetAt = Date.now() + 5000;
      const error = new RateLimitError('Rate limited', resetAt, 10, 60, 'provider');

      const waitTime = error.getWaitTime();
      expect(waitTime).toBeGreaterThan(4000);
      expect(waitTime).toBeLessThanOrEqual(5000);
    });

    it('should handle past reset times', () => {
      const resetAt = Date.now() - 5000;
      const error = new RateLimitError('Rate limited', resetAt, 10, 60, 'provider');

      expect(error.getWaitTime()).toBe(0);
    });

    it('should include provider information', () => {
      const error = new RateLimitError('Rate limited', Date.now(), 10, 60, 'Alchemy');

      expect(error.provider).toBe('Alchemy');
      expect(error.limit).toBe(10);
      expect(error.period).toBe(60);
    });
  });

  describe('ValidationError', () => {
    it('should not be retriable', () => {
      const error = ValidationError.invalidAddress('0xinvalid');
      expect(error.retriable).toBe(false);
    });

    it('should create address validation error', () => {
      const error = ValidationError.invalidAddress('0xinvalid');

      expect(error.code).toBe('VALIDATION_ADDRESS_INVALID');
      expect(error.field).toBe('address');
      expect(error.received).toBe('0xinvalid');
    });

    it('should create chain ID validation error', () => {
      const error = ValidationError.invalidChainId(999999);

      expect(error.code).toBe('VALIDATION_CHAINID_INVALID');
      expect(error.field).toBe('chainId');
      expect(error.received).toBe('999999');
    });

    it('should sanitize received values', () => {
      const error = ValidationError.invalidParameter('test', 'string', { complex: 'object' });

      expect(typeof error.received).toBe('string');
    });
  });

  describe('DataError', () => {
    it('should not be retriable', () => {
      const error = new DataError('Invalid data', 'BALANCE', 'Schema mismatch');
      expect(error.retriable).toBe(false);
    });

    it('should categorize data types', () => {
      const balance = new DataError('', 'BALANCE', '');
      const transaction = new DataError('', 'TRANSACTION', '');
      const block = new DataError('', 'BLOCK', '');
      const token = new DataError('', 'TOKEN', '');
      const other = new DataError('', 'OTHER', '');

      expect(balance.dataType).toBe('BALANCE');
      expect(transaction.dataType).toBe('TRANSACTION');
      expect(block.dataType).toBe('BLOCK');
      expect(token.dataType).toBe('TOKEN');
      expect(other.dataType).toBe('OTHER');
    });

    it('should include reason for invalidity', () => {
      const error = new DataError('Invalid', 'BALANCE', 'Missing required field');

      expect(error.reason).toBe('Missing required field');
    });
  });

  describe('CircuitBreakerError', () => {
    it('should be retriable', () => {
      const error = new CircuitBreakerError('test-circuit', Date.now() + 5000, 5);
      expect(error.retriable).toBe(true);
    });

    it('should calculate wait time until reset', () => {
      const resetAt = Date.now() + 10000;
      const error = new CircuitBreakerError('test-circuit', resetAt, 5);

      const waitTime = error.getWaitTime();
      expect(waitTime).toBeGreaterThan(9000);
      expect(waitTime).toBeLessThanOrEqual(10000);
    });

    it('should include failure count', () => {
      const error = new CircuitBreakerError('test-circuit', Date.now(), 10);

      expect(error.failureCount).toBe(10);
      expect(error.circuitName).toBe('test-circuit');
    });
  });

  describe('ErrorUtils', () => {
    it('should identify retriable errors', () => {
      const retriable = new ConnectionError('', '', '', 'TIMEOUT');
      const nonRetriable = new ValidationError('', '', '', '');

      expect(ErrorUtils.isRetriable(retriable)).toBe(true);
      expect(ErrorUtils.isRetriable(nonRetriable)).toBe(false);
    });

    it('should identify non-retriable errors', () => {
      const validationError = ValidationError.invalidAddress('0xinvalid');
      const dataError = new DataError('', 'BALANCE', '');

      expect(ErrorUtils.isRetriable(validationError)).toBe(false);
      expect(ErrorUtils.isRetriable(dataError)).toBe(false);
    });

    it('should extract error codes', () => {
      const error = new ConnectionError('', 'CONNECTION_TIMEOUT', '', 'TIMEOUT');

      expect(ErrorUtils.getErrorCode(error)).toBe('CONNECTION_TIMEOUT');
    });

    it('should convert unknown errors to IntegrationError', () => {
      const unknownError = new Error('Unknown error');
      const converted = ErrorUtils.toIntegrationError(unknownError);

      expect(converted).toBeInstanceOf(IntegrationError);
      expect(converted.message).toBe('Unknown error');
      expect(converted.cause).toBe(unknownError);
    });

    it('should sanitize sensitive data from context', () => {
      const context = {
        apiKey: 'secret123',
        api_key: 'secret456',
        secret: 'shhh',
        password: 'pass123',
        token: 'token123',
        publicData: 'visible',
        nested: {
          privateKey: 'key123',
          normalData: 'ok',
        },
      };

      const sanitized = ErrorUtils.sanitizeContext(context);

      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.publicData).toBe('visible');
      expect(sanitized.nested.privateKey).toBe('[REDACTED]');
      expect(sanitized.nested.normalData).toBe('ok');
    });

    it('should remove API keys from context', () => {
      const context = { apiKey: 'secret', data: 'public' };
      const sanitized = ErrorUtils.sanitizeContext(context);

      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.data).toBe('public');
    });

    it('should remove private keys from context', () => {
      const context = { privateKey: 'secret', data: 'public' };
      const sanitized = ErrorUtils.sanitizeContext(context);

      expect(sanitized.privateKey).toBe('[REDACTED]');
    });

    it('should create user-friendly messages', () => {
      const validation = ValidationError.invalidAddress('0xinvalid');
      const connection = ConnectionError.timeout('https://rpc.example.com', 5000);
      const rateLimit = new RateLimitError('', Date.now() + 5000, 10, 60, 'provider');
      const circuit = new CircuitBreakerError('test', Date.now(), 5);

      expect(ErrorUtils.toUserMessage(validation)).toContain('Invalid address');
      expect(ErrorUtils.toUserMessage(connection)).toContain('Unable to connect');
      expect(ErrorUtils.toUserMessage(rateLimit)).toContain('Rate limit exceeded');
      expect(ErrorUtils.toUserMessage(circuit)).toContain('temporarily unavailable');
    });
  });
});
