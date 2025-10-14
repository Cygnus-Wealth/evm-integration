/**
 * Unit tests for CorrelationContextManager
 *
 * @module observability/CorrelationContextManager.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CorrelationContextManager } from './CorrelationContextManager';
import { CorrelationContext, Span } from './interfaces';

describe('CorrelationContextManager', () => {
  let manager: CorrelationContextManager;

  beforeEach(() => {
    manager = new CorrelationContextManager();
  });

  describe('createContext', () => {
    it('should create root context with unique IDs', () => {
      const context1 = manager.createContext('operation1');
      const context2 = manager.createContext('operation2');

      expect(context1.correlationId).toBeDefined();
      expect(context1.traceId).toBeDefined();
      expect(context1.spanId).toBeDefined();

      // IDs should be unique
      expect(context1.correlationId).not.toBe(context2.correlationId);
      expect(context1.traceId).not.toBe(context2.traceId);
      expect(context1.spanId).not.toBe(context2.spanId);
    });

    it('should set operation name', () => {
      const context = manager.createContext('test-operation');

      expect(context.operation).toBe('test-operation');
    });

    it('should set metadata', () => {
      const metadata = { userId: '123', action: 'fetch' };
      const context = manager.createContext('operation', metadata);

      expect(context.metadata).toEqual(metadata);
    });

    it('should default to empty metadata', () => {
      const context = manager.createContext('operation');

      expect(context.metadata).toEqual({});
    });

    it('should set startTime', () => {
      const before = Date.now();
      const context = manager.createContext('operation');
      const after = Date.now();

      expect(context.startTime).toBeGreaterThanOrEqual(before);
      expect(context.startTime).toBeLessThanOrEqual(after);
    });

    it('should have no parent span', () => {
      const context = manager.createContext('operation');

      expect(context.parentSpanId).toBeUndefined();
    });
  });

  describe('createChildContext', () => {
    it('should inherit correlationId from parent', () => {
      const parent = manager.createContext('parent');
      const child = manager.createChildContext(parent, 'child');

      expect(child.correlationId).toBe(parent.correlationId);
    });

    it('should inherit traceId from parent', () => {
      const parent = manager.createContext('parent');
      const child = manager.createChildContext(parent, 'child');

      expect(child.traceId).toBe(parent.traceId);
    });

    it('should set parentSpanId to parent spanId', () => {
      const parent = manager.createContext('parent');
      const child = manager.createChildContext(parent, 'child');

      expect(child.parentSpanId).toBe(parent.spanId);
    });

    it('should generate new spanId', () => {
      const parent = manager.createContext('parent');
      const child = manager.createChildContext(parent, 'child');

      expect(child.spanId).not.toBe(parent.spanId);
      expect(child.spanId).toBeDefined();
    });

    it('should set child operation name', () => {
      const parent = manager.createContext('parent');
      const child = manager.createChildContext(parent, 'child-operation');

      expect(child.operation).toBe('child-operation');
    });

    it('should merge parent and child metadata', () => {
      const parent = manager.createContext('parent', { a: '1', b: '2' });
      const child = manager.createChildContext(parent, 'child', { b: '3', c: '4' });

      expect(child.metadata).toEqual({ a: '1', b: '3', c: '4' });
    });

    it('should create nested child contexts', () => {
      const root = manager.createContext('root');
      const child1 = manager.createChildContext(root, 'child1');
      const child2 = manager.createChildContext(child1, 'child2');

      expect(child2.correlationId).toBe(root.correlationId);
      expect(child2.traceId).toBe(root.traceId);
      expect(child2.parentSpanId).toBe(child1.spanId);
    });
  });

  describe('setCurrentContext / getCurrentContext', () => {
    it('should set and get current context', () => {
      const context = manager.createContext('operation');

      manager.setCurrentContext(context);

      expect(manager.getCurrentContext()).toBe(context);
    });

    it('should initially have no current context', () => {
      expect(manager.getCurrentContext()).toBeNull();
    });

    it('should clear current context with null', () => {
      const context = manager.createContext('operation');
      manager.setCurrentContext(context);

      manager.setCurrentContext(null);

      expect(manager.getCurrentContext()).toBeNull();
    });

    it('should overwrite previous context', () => {
      const context1 = manager.createContext('operation1');
      const context2 = manager.createContext('operation2');

      manager.setCurrentContext(context1);
      manager.setCurrentContext(context2);

      expect(manager.getCurrentContext()).toBe(context2);
    });
  });

  describe('startSpan', () => {
    it('should create span from explicit context', () => {
      const context = manager.createContext('operation');
      const span = manager.startSpan('test-operation', context);

      expect(span.spanId).toBeDefined();
      expect(span.traceId).toBe(context.traceId);
      expect(span.operation).toBe('test-operation');
      expect(span.status).toBe('pending');
    });

    it('should use current context if not provided', () => {
      const context = manager.createContext('operation');
      manager.setCurrentContext(context);

      const span = manager.startSpan('test-operation');

      expect(span.traceId).toBe(context.traceId);
    });

    it('should create implicit context if none exists', () => {
      const span = manager.startSpan('operation');

      expect(span.spanId).toBeDefined();
      expect(span.traceId).toBeDefined();
      expect(span.operation).toBe('operation');
      expect(manager.getCurrentContext()).not.toBeNull();
    });

    it('should store span in map', () => {
      const context = manager.createContext('operation');
      const span = manager.startSpan('test-operation', context);

      const retrieved = manager.getSpan(span.spanId);

      expect(retrieved).toBe(span);
    });

    it('should copy context metadata to span', () => {
      const context = manager.createContext('operation', { key: 'value' });
      const span = manager.startSpan('test-operation', context);

      expect(span.metadata).toEqual({ key: 'value' });
    });

    it('should set span startTime', () => {
      const before = Date.now();
      const span = manager.startSpan('operation');
      const after = Date.now();

      expect(span.startTime).toBeGreaterThanOrEqual(before);
      expect(span.startTime).toBeLessThanOrEqual(after);
    });
  });

  describe('endSpan', () => {
    it('should set endTime and duration', () => {
      const context = manager.createContext('operation');
      const span = manager.startSpan('test-operation', context);

      const before = Date.now();
      manager.endSpan(span.spanId);
      const after = Date.now();

      const updatedSpan = manager.getSpan(span.spanId);

      expect(updatedSpan?.endTime).toBeDefined();
      expect(updatedSpan?.endTime).toBeGreaterThanOrEqual(before);
      expect(updatedSpan?.endTime).toBeLessThanOrEqual(after);
      expect(updatedSpan?.duration).toBeDefined();
      expect(updatedSpan?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should set status to success without error', () => {
      const context = manager.createContext('operation');
      const span = manager.startSpan('test-operation', context);

      manager.endSpan(span.spanId);

      const updatedSpan = manager.getSpan(span.spanId);
      expect(updatedSpan?.status).toBe('success');
    });

    it('should set status to error with error', () => {
      const context = manager.createContext('operation');
      const span = manager.startSpan('test-operation', context);
      const error = new Error('Test error');

      manager.endSpan(span.spanId, error);

      const updatedSpan = manager.getSpan(span.spanId);
      expect(updatedSpan?.status).toBe('error');
      expect(updatedSpan?.error).toBe(error);
    });

    it('should handle non-existent span gracefully', () => {
      expect(() => manager.endSpan('nonexistent-id')).not.toThrow();
    });

    it('should calculate duration correctly', () => {
      const context = manager.createContext('operation');
      const span = manager.startSpan('test-operation', context);

      // Wait a bit
      const wait = new Promise(resolve => setTimeout(resolve, 10));
      return wait.then(() => {
        manager.endSpan(span.spanId);

        const updatedSpan = manager.getSpan(span.spanId);
        expect(updatedSpan?.duration).toBeGreaterThan(0);
      });
    });
  });

  describe('getSpan', () => {
    it('should return span by ID', () => {
      const context = manager.createContext('operation');
      const span = manager.startSpan('test-operation', context);

      const retrieved = manager.getSpan(span.spanId);

      expect(retrieved).toBe(span);
    });

    it('should return undefined for non-existent span', () => {
      const retrieved = manager.getSpan('nonexistent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('getTraceSpans', () => {
    it('should return all spans for a trace', () => {
      const context = manager.createContext('operation');
      const span1 = manager.startSpan('op1', context);
      const span2 = manager.startSpan('op2', context);

      const spans = manager.getTraceSpans(context.traceId);

      expect(spans).toHaveLength(2);
      expect(spans).toContainEqual(span1);
      expect(spans).toContainEqual(span2);
    });

    it('should return empty array for unknown trace', () => {
      const spans = manager.getTraceSpans('unknown-trace-id');

      expect(spans).toEqual([]);
    });

    it('should only return spans from specified trace', () => {
      const context1 = manager.createContext('operation1');
      const context2 = manager.createContext('operation2');

      manager.startSpan('op1', context1);
      manager.startSpan('op2', context1);
      manager.startSpan('op3', context2);

      const spans = manager.getTraceSpans(context1.traceId);

      expect(spans).toHaveLength(2);
    });
  });

  describe('withSpan', () => {
    it('should wrap function with span tracking', async () => {
      const fn = vi.fn(async () => 'result');

      const result = await manager.withSpan('operation', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should record success status', async () => {
      const fn = async () => 'success';
      const context = manager.createContext('operation');

      await manager.withSpan('test-operation', fn, context);

      const spans = manager.getTraceSpans(context.traceId);
      expect(spans).toHaveLength(1);
      expect(spans[0].status).toBe('success');
    });

    it('should record error status on failure', async () => {
      const error = new Error('Test error');
      const fn = async () => {
        throw error;
      };
      const context = manager.createContext('operation');

      await expect(manager.withSpan('test-operation', fn, context)).rejects.toThrow(
        'Test error'
      );

      const spans = manager.getTraceSpans(context.traceId);
      expect(spans).toHaveLength(1);
      expect(spans[0].status).toBe('error');
      expect(spans[0].error).toBe(error);
    });

    it('should propagate function result', async () => {
      const fn = async () => ({ data: 'value' });

      const result = await manager.withSpan('operation', fn);

      expect(result).toEqual({ data: 'value' });
    });

    it('should propagate function error', async () => {
      const fn = async () => {
        throw new Error('Failure');
      };

      await expect(manager.withSpan('operation', fn)).rejects.toThrow('Failure');
    });

    it('should create implicit context if none provided', async () => {
      const fn = async () => 'result';

      await manager.withSpan('operation', fn);

      expect(manager.getCurrentContext()).not.toBeNull();
    });

    it('should use provided context', async () => {
      const context = manager.createContext('root');
      const fn = async () => 'result';

      await manager.withSpan('child-operation', fn, context);

      const spans = manager.getTraceSpans(context.traceId);
      expect(spans).toHaveLength(1);
      expect(spans[0].traceId).toBe(context.traceId);
    });

    it('should set span duration', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'result';
      };

      const context = manager.createContext('operation');
      await manager.withSpan('test-operation', fn, context);

      const spans = manager.getTraceSpans(context.traceId);
      expect(spans[0].duration).toBeGreaterThan(0);
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      const context1 = manager.createContext('op1');
      const context2 = manager.createContext('op2');
      const context3 = manager.createContext('op3');

      const ids = [
        context1.correlationId,
        context1.traceId,
        context1.spanId,
        context2.correlationId,
        context2.traceId,
        context2.spanId,
        context3.correlationId,
        context3.traceId,
        context3.spanId,
      ];

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Trace Hierarchy', () => {
    it('should maintain parent-child relationships', () => {
      const root = manager.createContext('root');
      const child1 = manager.createChildContext(root, 'child1');
      const child2 = manager.createChildContext(child1, 'child2');

      const span1 = manager.startSpan('op1', root);
      const span2 = manager.startSpan('op2', child1);
      const span3 = manager.startSpan('op3', child2);

      expect(span1.parentSpanId).toBeUndefined();
      expect(span2.parentSpanId).toBe(root.spanId);
      expect(span3.parentSpanId).toBe(child1.spanId);
    });

    it('should group related spans by traceId', () => {
      const root = manager.createContext('root');
      const child1 = manager.createChildContext(root, 'child1');
      const child2 = manager.createChildContext(root, 'child2');

      manager.startSpan('op1', root);
      manager.startSpan('op2', child1);
      manager.startSpan('op3', child2);

      const spans = manager.getTraceSpans(root.traceId);
      expect(spans).toHaveLength(3);
      expect(spans.every(s => s.traceId === root.traceId)).toBe(true);
    });
  });
});
