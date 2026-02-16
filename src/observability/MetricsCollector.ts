/**
 * Metrics collector implementation
 *
 * @module observability/MetricsCollector
 * @see interfaces.ts for IMetricsCollector contract
 */

import {
  IMetricsCollector,
  MetricLabels,
  Counter,
  Gauge,
  Histogram,
  HistogramBucket,
  Summary,
  SummaryQuantile,
} from './interfaces.js';

/**
 * Default histogram buckets (in milliseconds for duration tracking)
 */
const DEFAULT_HISTOGRAM_BUCKETS = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];

/**
 * Default summary quantiles
 */
const DEFAULT_SUMMARY_QUANTILES = [0.5, 0.9, 0.95, 0.99];

/**
 * Metrics collector implementation
 * Collects counters, gauges, histograms, and summaries for observability
 */
export class MetricsCollector implements IMetricsCollector {
  private counters: Map<string, Counter>;
  private gauges: Map<string, Gauge>;
  private histograms: Map<string, Histogram>;
  private summaries: Map<string, Summary>;

  // Storage for histogram/summary raw values
  private histogramValues: Map<string, number[]>;
  private summaryValues: Map<string, number[]>;

  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.summaries = new Map();
    this.histogramValues = new Map();
    this.summaryValues = new Map();
  }

  /**
   * Increments a counter metric
   *
   * @param name - Metric name
   * @param value - Value to add (default 1)
   * @param labels - Optional labels
   */
  incrementCounter(name: string, value: number = 1, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, {
        name,
        value,
        labels,
      });
    }
  }

  /**
   * Sets a gauge metric value
   *
   * @param name - Metric name
   * @param value - Current value
   * @param labels - Optional labels
   */
  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);

    this.gauges.set(key, {
      name,
      value,
      labels,
      timestamp: new Date(),
    });
  }

  /**
   * Records a histogram observation
   *
   * @param name - Metric name
   * @param value - Observed value
   * @param labels - Optional labels
   */
  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);

    // Store raw value for later calculation
    const values = this.histogramValues.get(key) || [];
    values.push(value);
    this.histogramValues.set(key, values);

    // Calculate histogram statistics
    const sum = values.reduce((acc, v) => acc + v, 0);
    const count = values.length;
    const buckets = this.calculateHistogramBuckets(values);

    this.histograms.set(key, {
      name,
      sum,
      count,
      buckets,
      labels,
    });
  }

  /**
   * Records a summary observation
   *
   * @param name - Metric name
   * @param value - Observed value
   * @param labels - Optional labels
   */
  observeSummary(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);

    // Store raw value for later calculation
    const values = this.summaryValues.get(key) || [];
    values.push(value);
    this.summaryValues.set(key, values);

    // Calculate summary statistics
    const sum = values.reduce((acc, v) => acc + v, 0);
    const count = values.length;
    const quantiles = this.calculateQuantiles(values);

    this.summaries.set(key, {
      name,
      sum,
      count,
      quantiles,
      labels,
    });
  }

  /**
   * Measures and records duration of an async operation
   *
   * @template T - Return type of operation
   * @param name - Metric name
   * @param fn - Async function to measure
   * @param labels - Optional labels
   * @returns Promise resolving to function result
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    labels: MetricLabels = {}
  ): Promise<T> {
    const startTime = performance.now();

    try {
      const result = await fn();
      const duration = performance.now() - startTime;

      // Record as histogram for duration distribution
      this.observeHistogram(name, duration, { ...labels, status: 'success' });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;

      // Record failed operation
      this.observeHistogram(name, duration, { ...labels, status: 'error' });

      throw error;
    }
  }

  /**
   * Gets all counter metrics
   *
   * @returns Map of metric key to counter
   */
  getCounters(): Map<string, Counter> {
    return new Map(this.counters);
  }

  /**
   * Gets all gauge metrics
   *
   * @returns Map of metric key to gauge
   */
  getGauges(): Map<string, Gauge> {
    return new Map(this.gauges);
  }

  /**
   * Gets all histogram metrics
   *
   * @returns Map of metric key to histogram
   */
  getHistograms(): Map<string, Histogram> {
    return new Map(this.histograms);
  }

  /**
   * Gets all summary metrics
   *
   * @returns Map of metric key to summary
   */
  getSummaries(): Map<string, Summary> {
    return new Map(this.summaries);
  }

  /**
   * Resets all metrics to initial state
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
    this.histogramValues.clear();
    this.summaryValues.clear();
  }

  /**
   * Exports metrics in Prometheus format
   *
   * @returns Prometheus-formatted metrics string
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Export counters
    for (const [_, counter] of this.counters) {
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(
        `${counter.name}${this.formatLabels(counter.labels)} ${counter.value}`
      );
    }

    // Export gauges
    for (const [_, gauge] of this.gauges) {
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(
        `${gauge.name}${this.formatLabels(gauge.labels)} ${gauge.value}`
      );
    }

    // Export histograms
    for (const [_, histogram] of this.histograms) {
      lines.push(`# TYPE ${histogram.name} histogram`);

      // Bucket counts
      for (const bucket of histogram.buckets) {
        const bucketLabels = { ...histogram.labels, le: bucket.le.toString() };
        lines.push(
          `${histogram.name}_bucket${this.formatLabels(bucketLabels)} ${bucket.count}`
        );
      }

      // +Inf bucket
      const infLabels = { ...histogram.labels, le: '+Inf' };
      lines.push(
        `${histogram.name}_bucket${this.formatLabels(infLabels)} ${histogram.count}`
      );

      // Sum and count
      lines.push(
        `${histogram.name}_sum${this.formatLabels(histogram.labels)} ${histogram.sum}`
      );
      lines.push(
        `${histogram.name}_count${this.formatLabels(histogram.labels)} ${histogram.count}`
      );
    }

    // Export summaries
    for (const [_, summary] of this.summaries) {
      lines.push(`# TYPE ${summary.name} summary`);

      // Quantiles
      for (const quantile of summary.quantiles) {
        const quantileLabels = { ...summary.labels, quantile: quantile.quantile.toString() };
        lines.push(
          `${summary.name}${this.formatLabels(quantileLabels)} ${quantile.value}`
        );
      }

      // Sum and count
      lines.push(
        `${summary.name}_sum${this.formatLabels(summary.labels)} ${summary.sum}`
      );
      lines.push(
        `${summary.name}_count${this.formatLabels(summary.labels)} ${summary.count}`
      );
    }

    return lines.join('\n');
  }

  /**
   * Generates unique metric key from name and labels
   *
   * @param name - Metric name
   * @param labels - Metric labels
   * @returns Unique key string
   * @private
   */
  private getMetricKey(name: string, labels: MetricLabels): string {
    const sortedLabels = Object.keys(labels)
      .sort()
      .map((key) => `${key}="${labels[key]}"`)
      .join(',');

    return sortedLabels ? `${name}{${sortedLabels}}` : name;
  }

  /**
   * Formats labels for Prometheus export
   *
   * @param labels - Metric labels
   * @returns Formatted label string
   * @private
   */
  private formatLabels(labels: MetricLabels): string {
    const entries = Object.entries(labels);

    if (entries.length === 0) {
      return '';
    }

    const formatted = entries
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');

    return `{${formatted}}`;
  }

  /**
   * Calculates histogram buckets from observed values
   *
   * @param values - Array of observed values
   * @returns Array of histogram buckets
   * @private
   */
  private calculateHistogramBuckets(values: number[]): HistogramBucket[] {
    const buckets: HistogramBucket[] = [];

    for (const le of DEFAULT_HISTOGRAM_BUCKETS) {
      const count = values.filter((v) => v <= le).length;
      buckets.push({ le, count });
    }

    return buckets;
  }

  /**
   * Calculates quantiles from observed values
   *
   * @param values - Array of observed values
   * @returns Array of summary quantiles
   * @private
   */
  private calculateQuantiles(values: number[]): SummaryQuantile[] {
    if (values.length === 0) {
      return [];
    }

    // Sort values for quantile calculation
    const sorted = [...values].sort((a, b) => a - b);
    const quantiles: SummaryQuantile[] = [];

    for (const q of DEFAULT_SUMMARY_QUANTILES) {
      const index = Math.ceil(sorted.length * q) - 1;
      const value = sorted[Math.max(0, index)];

      quantiles.push({ quantile: q, value });
    }

    return quantiles;
  }
}

/**
 * Predefined metric names for EVM integration
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
  CACHE_EVICTIONS: 'evm_integration_cache_evictions',

  // Circuit breaker metrics
  CIRCUIT_BREAKER_STATE: 'evm_integration_circuit_breaker_state',
  CIRCUIT_BREAKER_TRANSITIONS: 'evm_integration_circuit_breaker_transitions',
  CIRCUIT_BREAKER_FAILURES: 'evm_integration_circuit_breaker_failures',

  // Connection metrics
  ACTIVE_CONNECTIONS: 'evm_integration_active_connections',
  CONNECTION_POOL_SIZE: 'evm_integration_connection_pool_size',
  CONNECTION_ERRORS: 'evm_integration_connection_errors',

  // Service metrics
  BALANCE_FETCHES: 'evm_integration_balance_fetches',
  TRANSACTION_FETCHES: 'evm_integration_transaction_fetches',
  SUBSCRIPTION_ACTIVE: 'evm_integration_subscriptions_active',

  // Error metrics
  ERROR_RATE: 'evm_integration_error_rate',
  ERRORS_BY_TYPE: 'evm_integration_errors_by_type',
  RETRY_ATTEMPTS: 'evm_integration_retry_attempts',
} as const;
