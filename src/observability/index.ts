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
} from './interfaces.js';

// Implementations
export { HealthMonitor } from './HealthMonitor.js';
export { MetricsCollector, METRICS } from './MetricsCollector.js';
export { CorrelationContextManager } from './CorrelationContextManager.js';
