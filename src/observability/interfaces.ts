/**
 * Observability component interfaces and types
 *
 * @module observability/interfaces
 * @see UNIT_ARCHITECTURE.md Section 5: Observability Components
 */

/**
 * Health status levels for system components
 */
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY'
}

/**
 * Result of a health check operation
 */
export interface HealthCheckResult {
  /**
   * Component name being checked
   */
  component: string;

  /**
   * Health status of the component
   */
  status: HealthStatus;

  /**
   * Timestamp when check was performed
   */
  timestamp: Date;

  /**
   * Response time in milliseconds
   */
  responseTime: number;

  /**
   * Additional details about health status
   * Should not contain sensitive information
   */
  details?: Record<string, any>;

  /**
   * Error if health check failed
   */
  error?: Error;
}

/**
 * Overall system health summary
 */
export interface SystemHealth {
  /**
   * Aggregated system status
   */
  status: HealthStatus;

  /**
   * Individual component health results
   */
  components: HealthCheckResult[];

  /**
   * Timestamp of system health check
   */
  timestamp: Date;

  /**
   * System uptime in milliseconds
   */
  uptime: number;
}

/**
 * Function signature for health check implementations
 *
 * @returns Promise resolving to health check result
 */
export type HealthCheckFn = () => Promise<HealthCheckResult>;

/**
 * Configuration for a health check
 */
export interface HealthCheckConfig {
  /**
   * Unique component name
   */
  component: string;

  /**
   * Health check function to execute
   */
  check: HealthCheckFn;

  /**
   * Check interval in milliseconds
   * @default 60000
   */
  interval?: number;

  /**
   * Check timeout in milliseconds
   * @default 5000
   */
  timeout?: number;

  /**
   * Whether this check is critical to system health
   * If true, failure marks entire system as UNHEALTHY
   * @default false
   */
  critical?: boolean;
}

/**
 * Health monitor interface
 * Continuously assesses system health through registered checks
 */
export interface IHealthMonitor {
  /**
   * Registers a new health check
   *
   * @param config - Health check configuration
   */
  registerCheck(config: HealthCheckConfig): void;

  /**
   * Unregisters a health check
   *
   * @param component - Component name to unregister
   * @returns True if check was unregistered
   */
  unregisterCheck(component: string): boolean;

  /**
   * Executes all health checks immediately
   *
   * @returns Promise resolving to system health summary
   */
  runHealthChecks(): Promise<SystemHealth>;

  /**
   * Gets cached status for a specific component
   *
   * @param component - Component name
   * @returns Latest health check result or undefined
   */
  getStatus(component: string): HealthCheckResult | undefined;

  /**
   * Gets overall system health from cached results
   *
   * @returns Current system health
   */
  getSystemHealth(): SystemHealth;

  /**
   * Starts periodic health checks
   */
  start(): void;

  /**
   * Stops all periodic health checks
   */
  stop(): void;
}

/**
 * Metric types supported by the collector
 */
export enum MetricType {
  COUNTER = 'COUNTER',
  GAUGE = 'GAUGE',
  HISTOGRAM = 'HISTOGRAM',
  SUMMARY = 'SUMMARY'
}

/**
 * Labels for metric categorization
 */
export interface MetricLabels {
  [key: string]: string | number;
}

/**
 * Counter metric - monotonically increasing value
 */
export interface Counter {
  name: string;
  value: number;
  labels: MetricLabels;
}

/**
 * Gauge metric - arbitrary value that can increase or decrease
 */
export interface Gauge {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: Date;
}

/**
 * Histogram bucket for distribution tracking
 */
export interface HistogramBucket {
  /**
   * Upper bound for this bucket (less than or equal)
   */
  le: number;

  /**
   * Count of observations in this bucket
   */
  count: number;
}

/**
 * Histogram metric - tracks distribution of values
 */
export interface Histogram {
  name: string;
  sum: number;
  count: number;
  buckets: HistogramBucket[];
  labels: MetricLabels;
}

/**
 * Summary quantile definition
 */
export interface SummaryQuantile {
  /**
   * Quantile (0-1, e.g., 0.95 for 95th percentile)
   */
  quantile: number;

  /**
   * Quantile value
   */
  value: number;
}

/**
 * Summary metric - tracks quantiles over time
 */
export interface Summary {
  name: string;
  sum: number;
  count: number;
  quantiles: SummaryQuantile[];
  labels: MetricLabels;
}

/**
 * Metrics collector interface
 * Collects and exports performance metrics
 */
export interface IMetricsCollector {
  /**
   * Increments a counter metric
   *
   * @param name - Metric name
   * @param value - Value to add (default 1)
   * @param labels - Optional labels
   */
  incrementCounter(name: string, value?: number, labels?: MetricLabels): void;

  /**
   * Sets a gauge metric value
   *
   * @param name - Metric name
   * @param value - Current value
   * @param labels - Optional labels
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Records a histogram observation
   *
   * @param name - Metric name
   * @param value - Observed value
   * @param labels - Optional labels
   */
  observeHistogram(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Records a summary observation
   *
   * @param name - Metric name
   * @param value - Observed value
   * @param labels - Optional labels
   */
  observeSummary(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Measures and records duration of an async operation
   *
   * @template T - Return type of operation
   * @param name - Metric name
   * @param fn - Async function to measure
   * @param labels - Optional labels
   * @returns Promise resolving to function result
   */
  measure<T>(
    name: string,
    fn: () => Promise<T>,
    labels?: MetricLabels
  ): Promise<T>;

  /**
   * Gets all counter metrics
   *
   * @returns Map of metric name to counter
   */
  getCounters(): Map<string, Counter>;

  /**
   * Gets all gauge metrics
   *
   * @returns Map of metric name to gauge
   */
  getGauges(): Map<string, Gauge>;

  /**
   * Gets all histogram metrics
   *
   * @returns Map of metric name to histogram
   */
  getHistograms(): Map<string, Histogram>;

  /**
   * Gets all summary metrics
   *
   * @returns Map of metric name to summary
   */
  getSummaries(): Map<string, Summary>;

  /**
   * Resets all metrics to initial state
   */
  reset(): void;

  /**
   * Exports metrics in Prometheus format
   *
   * @returns Prometheus-formatted metrics string
   */
  exportPrometheus(): string;
}

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
   * Parent span ID if this is a child operation
   */
  parentSpanId?: string;

  /**
   * Current span ID
   */
  spanId: string;

  /**
   * Trace ID that groups related requests
   */
  traceId: string;

  /**
   * Operation name being performed
   */
  operation: string;

  /**
   * Operation start timestamp (milliseconds)
   */
  startTime: number;

  /**
   * Additional metadata for the operation
   */
  metadata: Record<string, any>;
}

/**
 * Span representing a single operation in a trace
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
 * Correlation context manager interface
 * Manages distributed tracing contexts and spans
 */
export interface ICorrelationContextManager {
  /**
   * Creates a new root correlation context
   *
   * @param operation - Operation name
   * @param metadata - Optional metadata
   * @returns New correlation context
   */
  createContext(
    operation: string,
    metadata?: Record<string, any>
  ): CorrelationContext;

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
    metadata?: Record<string, any>
  ): CorrelationContext;

  /**
   * Sets the current active context
   *
   * @param context - Context to set as active, or null to clear
   */
  setCurrentContext(context: CorrelationContext | null): void;

  /**
   * Gets the currently active context
   *
   * @returns Current context or null
   */
  getCurrentContext(): CorrelationContext | null;

  /**
   * Starts a new span for tracking
   *
   * @param operation - Operation name
   * @param context - Optional context (uses current if not provided)
   * @returns Created span
   */
  startSpan(operation: string, context?: CorrelationContext): Span;

  /**
   * Ends a span and records its completion
   *
   * @param spanId - Span ID to end
   * @param error - Optional error if span failed
   */
  endSpan(spanId: string, error?: Error): void;

  /**
   * Gets a specific span by ID
   *
   * @param spanId - Span ID
   * @returns Span or undefined if not found
   */
  getSpan(spanId: string): Span | undefined;

  /**
   * Gets all spans for a trace
   *
   * @param traceId - Trace ID
   * @returns Array of spans in the trace
   */
  getTraceSpans(traceId: string): Span[];

  /**
   * Wraps an async function with automatic span tracking
   *
   * @template T - Return type
   * @param operation - Operation name
   * @param fn - Function to wrap
   * @param context - Optional context
   * @returns Promise resolving to function result
   */
  withSpan<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: CorrelationContext
  ): Promise<T>;
}
