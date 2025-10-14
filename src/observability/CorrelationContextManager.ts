/**
 * Correlation context manager implementation
 *
 * @module observability/CorrelationContextManager
 * @see interfaces.ts for ICorrelationContextManager contract
 */

import {
  ICorrelationContextManager,
  CorrelationContext,
  Span,
} from './interfaces';

/**
 * Correlation context manager implementation
 * Manages distributed tracing contexts and spans for request flow tracking
 */
export class CorrelationContextManager implements ICorrelationContextManager {
  private currentContext: CorrelationContext | null;
  private spans: Map<string, Span>;

  constructor() {
    this.currentContext = null;
    this.spans = new Map();
  }

  /**
   * Creates a new root correlation context
   *
   * @param operation - Operation name
   * @param metadata - Optional metadata
   * @returns New correlation context
   */
  createContext(
    operation: string,
    metadata: Record<string, any> = {}
  ): CorrelationContext {
    const correlationId = this.generateId();
    const traceId = this.generateId();
    const spanId = this.generateId();

    return {
      correlationId,
      traceId,
      spanId,
      operation,
      startTime: Date.now(),
      metadata,
    };
  }

  /**
   * Creates a child context from a parent
   *
   * @param parent - Parent correlation context
   * @param operation - Child operation name
   * @param metadata - Optional metadata
   * @returns Child correlation context
   */
  createChildContext(
    parent: CorrelationContext,
    operation: string,
    metadata: Record<string, any> = {}
  ): CorrelationContext {
    const spanId = this.generateId();

    return {
      correlationId: parent.correlationId,
      traceId: parent.traceId,
      parentSpanId: parent.spanId,
      spanId,
      operation,
      startTime: Date.now(),
      metadata: { ...parent.metadata, ...metadata },
    };
  }

  /**
   * Sets the current active context
   *
   * @param context - Context to set as active, or null to clear
   */
  setCurrentContext(context: CorrelationContext | null): void {
    this.currentContext = context;
  }

  /**
   * Gets the currently active context
   *
   * @returns Current context or null
   */
  getCurrentContext(): CorrelationContext | null {
    return this.currentContext;
  }

  /**
   * Starts a new span for tracking
   *
   * @param operation - Operation name
   * @param context - Optional context (uses current if not provided)
   * @returns Created span
   */
  startSpan(operation: string, context?: CorrelationContext): Span {
    const effectiveContext = context || this.currentContext;

    if (!effectiveContext) {
      // Create implicit context if none exists
      const newContext = this.createContext(operation);
      this.setCurrentContext(newContext);
      return this.createSpanFromContext(newContext);
    }

    const span = this.createSpanFromContext(effectiveContext, operation);
    this.spans.set(span.spanId, span);

    return span;
  }

  /**
   * Ends a span and records its completion
   *
   * @param spanId - Span ID to end
   * @param error - Optional error if span failed
   */
  endSpan(spanId: string, error?: Error): void {
    const span = this.spans.get(spanId);

    if (!span) {
      return; // Silently ignore non-existent spans
    }

    const endTime = Date.now();
    const duration = endTime - span.startTime;

    span.endTime = endTime;
    span.duration = duration;
    span.status = error ? 'error' : 'success';

    if (error) {
      span.error = error;
    }
  }

  /**
   * Gets a specific span by ID
   *
   * @param spanId - Span ID
   * @returns Span or undefined if not found
   */
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Gets all spans for a trace
   *
   * @param traceId - Trace ID
   * @returns Array of spans in the trace
   */
  getTraceSpans(traceId: string): Span[] {
    const traceSpans: Span[] = [];

    for (const span of this.spans.values()) {
      if (span.traceId === traceId) {
        traceSpans.push(span);
      }
    }

    return traceSpans;
  }

  /**
   * Wraps an async function with automatic span tracking
   *
   * @template T - Return type
   * @param operation - Operation name
   * @param fn - Function to wrap
   * @param context - Optional context
   * @returns Promise resolving to function result
   */
  async withSpan<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: CorrelationContext
  ): Promise<T> {
    const span = this.startSpan(operation, context);

    try {
      const result = await fn();
      this.endSpan(span.spanId);
      return result;
    } catch (error) {
      this.endSpan(span.spanId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Creates a span from a correlation context
   *
   * @param context - Correlation context
   * @param operation - Optional operation name override
   * @returns New span
   * @private
   */
  private createSpanFromContext(
    context: CorrelationContext,
    operation?: string
  ): Span {
    const spanId = operation ? this.generateId() : context.spanId;

    return {
      spanId,
      traceId: context.traceId,
      parentSpanId: context.parentSpanId,
      operation: operation || context.operation,
      startTime: Date.now(),
      status: 'pending',
      metadata: { ...context.metadata },
    };
  }

  /**
   * Generates a unique identifier
   *
   * @returns Unique ID string
   * @private
   */
  private generateId(): string {
    // Use crypto.randomUUID if available (Node 14.17+, modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback to timestamp + random
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}
