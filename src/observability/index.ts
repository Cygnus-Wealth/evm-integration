/**
 * Observability module exports
 *
 * @module observability
 */

// Interfaces and types
export {
  HealthStatus,
  HealthCheckResult,
  SystemHealth,
  HealthCheckFn,
  HealthCheckConfig,
  IHealthMonitor,
  MetricType,
  MetricLabels,
  Counter,
  Gauge,
  Histogram,
  HistogramBucket,
  Summary,
  SummaryQuantile,
  IMetricsCollector,
  CorrelationContext,
  Span,
  ICorrelationContextManager,
} from './interfaces';

// Implementations
export { HealthMonitor } from './HealthMonitor';
export { MetricsCollector, METRICS } from './MetricsCollector';
export { CorrelationContextManager } from './CorrelationContextManager';
