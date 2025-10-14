/**
 * Unit tests for MetricsCollector
 *
 * @module observability/MetricsCollector.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsCollector, METRICS } from './MetricsCollector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('Constructor', () => {
    it('should initialize with empty metrics', () => {
      expect(collector.getCounters().size).toBe(0);
      expect(collector.getGauges().size).toBe(0);
      expect(collector.getHistograms().size).toBe(0);
      expect(collector.getSummaries().size).toBe(0);
    });
  });

  describe('Counter', () => {
    it('should increment counter', () => {
      collector.incrementCounter('test_counter', 1);

      const counters = collector.getCounters();
      expect(counters.size).toBe(1);

      const counter = Array.from(counters.values())[0];
      expect(counter.name).toBe('test_counter');
      expect(counter.value).toBe(1);
    });

    it('should increment by custom value', () => {
      collector.incrementCounter('test_counter', 5);

      const counter = Array.from(collector.getCounters().values())[0];
      expect(counter.value).toBe(5);
    });

    it('should accumulate multiple increments', () => {
      collector.incrementCounter('test_counter', 1);
      collector.incrementCounter('test_counter', 2);
      collector.incrementCounter('test_counter', 3);

      const counter = Array.from(collector.getCounters().values())[0];
      expect(counter.value).toBe(6);
    });

    it('should support labels', () => {
      collector.incrementCounter('test_counter', 1, { method: 'GET', status: '200' });

      const counter = Array.from(collector.getCounters().values())[0];
      expect(counter.labels).toEqual({ method: 'GET', status: '200' });
    });

    it('should maintain separate counters for different labels', () => {
      collector.incrementCounter('requests', 1, { status: '200' });
      collector.incrementCounter('requests', 1, { status: '404' });

      expect(collector.getCounters().size).toBe(2);
    });
  });

  describe('Gauge', () => {
    it('should set gauge value', () => {
      collector.setGauge('test_gauge', 42);

      const gauges = collector.getGauges();
      expect(gauges.size).toBe(1);

      const gauge = Array.from(gauges.values())[0];
      expect(gauge.name).toBe('test_gauge');
      expect(gauge.value).toBe(42);
    });

    it('should update timestamp', () => {
      collector.setGauge('test_gauge', 42);

      const gauge = Array.from(collector.getGauges().values())[0];
      expect(gauge.timestamp).toBeInstanceOf(Date);
    });

    it('should overwrite previous value', () => {
      collector.setGauge('test_gauge', 10);
      collector.setGauge('test_gauge', 20);

      const gauge = Array.from(collector.getGauges().values())[0];
      expect(gauge.value).toBe(20);
    });

    it('should support labels', () => {
      collector.setGauge('memory_usage', 1024, { process: 'worker' });

      const gauge = Array.from(collector.getGauges().values())[0];
      expect(gauge.labels).toEqual({ process: 'worker' });
    });
  });

  describe('Histogram', () => {
    it('should observe values', () => {
      collector.observeHistogram('response_time', 100);
      collector.observeHistogram('response_time', 200);

      const histograms = collector.getHistograms();
      expect(histograms.size).toBe(1);

      const histogram = Array.from(histograms.values())[0];
      expect(histogram.name).toBe('response_time');
      expect(histogram.count).toBe(2);
      expect(histogram.sum).toBe(300);
    });

    it('should distribute into buckets', () => {
      collector.observeHistogram('duration', 10);
      collector.observeHistogram('duration', 50);
      collector.observeHistogram('duration', 500);

      const histogram = Array.from(collector.getHistograms().values())[0];

      // Check that buckets contain correct counts
      const bucket25 = histogram.buckets.find(b => b.le === 25);
      const bucket100 = histogram.buckets.find(b => b.le === 100);
      const bucket1000 = histogram.buckets.find(b => b.le === 1000);

      expect(bucket25?.count).toBe(1);  // Only 10ms value
      expect(bucket100?.count).toBe(2); // 10ms and 50ms values
      expect(bucket1000?.count).toBe(3); // All values
    });

    it('should calculate sum and count', () => {
      collector.observeHistogram('latency', 100);
      collector.observeHistogram('latency', 200);
      collector.observeHistogram('latency', 300);

      const histogram = Array.from(collector.getHistograms().values())[0];
      expect(histogram.sum).toBe(600);
      expect(histogram.count).toBe(3);
    });

    it('should support labels', () => {
      collector.observeHistogram('request_duration', 100, { endpoint: '/api/balance' });

      const histogram = Array.from(collector.getHistograms().values())[0];
      expect(histogram.labels).toEqual({ endpoint: '/api/balance' });
    });
  });

  describe('Summary', () => {
    it('should observe values', () => {
      collector.observeSummary('response_size', 1024);
      collector.observeSummary('response_size', 2048);

      const summaries = collector.getSummaries();
      expect(summaries.size).toBe(1);

      const summary = Array.from(summaries.values())[0];
      expect(summary.name).toBe('response_size');
      expect(summary.count).toBe(2);
      expect(summary.sum).toBe(3072);
    });

    it('should calculate quantiles', () => {
      // Generate test data
      for (let i = 1; i <= 100; i++) {
        collector.observeSummary('test_metric', i);
      }

      const summary = Array.from(collector.getSummaries().values())[0];
      expect(summary.quantiles.length).toBeGreaterThan(0);

      // Check that quantiles exist
      const p50 = summary.quantiles.find(q => q.quantile === 0.5);
      const p99 = summary.quantiles.find(q => q.quantile === 0.99);

      expect(p50).toBeDefined();
      expect(p99).toBeDefined();
      expect(p50!.value).toBeLessThanOrEqual(p99!.value);
    });

    it('should calculate sum and count', () => {
      collector.observeSummary('bytes_transferred', 100);
      collector.observeSummary('bytes_transferred', 200);
      collector.observeSummary('bytes_transferred', 300);

      const summary = Array.from(collector.getSummaries().values())[0];
      expect(summary.sum).toBe(600);
      expect(summary.count).toBe(3);
    });

    it('should support labels', () => {
      collector.observeSummary('payload_size', 512, { direction: 'inbound' });

      const summary = Array.from(collector.getSummaries().values())[0];
      expect(summary.labels).toEqual({ direction: 'inbound' });
    });
  });

  describe('measure', () => {
    it('should measure async function duration', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'result';
      };

      const result = await collector.measure('operation_duration', fn);

      expect(result).toBe('result');
      expect(collector.getHistograms().size).toBe(1);

      const histogram = Array.from(collector.getHistograms().values())[0];
      expect(histogram.name).toBe('operation_duration');
      expect(histogram.count).toBe(1);
      expect(histogram.sum).toBeGreaterThan(0);
    });

    it('should record duration in histogram', async () => {
      const fn = async () => 'test';

      await collector.measure('test_operation', fn);

      const histogram = Array.from(collector.getHistograms().values())[0];
      expect(histogram.name).toBe('test_operation');
      expect(histogram.count).toBe(1);
    });

    it('should propagate function result', async () => {
      const fn = async () => ({ data: 'value' });

      const result = await collector.measure('fetch_data', fn);

      expect(result).toEqual({ data: 'value' });
    });

    it('should propagate function error', async () => {
      const fn = async () => {
        throw new Error('Test error');
      };

      await expect(collector.measure('failing_operation', fn)).rejects.toThrow(
        'Test error'
      );
    });

    it('should record error status in labels', async () => {
      const fn = async () => {
        throw new Error('Failure');
      };

      try {
        await collector.measure('error_operation', fn);
      } catch {
        // Expected
      }

      const histogram = Array.from(collector.getHistograms().values())[0];
      expect(histogram.labels.status).toBe('error');
    });

    it('should record success status in labels', async () => {
      const fn = async () => 'success';

      await collector.measure('success_operation', fn);

      const histogram = Array.from(collector.getHistograms().values())[0];
      expect(histogram.labels.status).toBe('success');
    });
  });

  describe('Export', () => {
    it('should export Prometheus format', () => {
      collector.incrementCounter('test_counter', 5);
      collector.setGauge('test_gauge', 42);

      const output = collector.exportPrometheus();

      expect(output).toContain('# TYPE test_counter counter');
      expect(output).toContain('test_counter 5');
      expect(output).toContain('# TYPE test_gauge gauge');
      expect(output).toContain('test_gauge 42');
    });

    it('should include all metric types', () => {
      collector.incrementCounter('counter_metric', 1);
      collector.setGauge('gauge_metric', 10);
      collector.observeHistogram('histogram_metric', 100);
      collector.observeSummary('summary_metric', 50);

      const output = collector.exportPrometheus();

      expect(output).toContain('# TYPE counter_metric counter');
      expect(output).toContain('# TYPE gauge_metric gauge');
      expect(output).toContain('# TYPE histogram_metric histogram');
      expect(output).toContain('# TYPE summary_metric summary');
    });

    it('should include labels', () => {
      collector.incrementCounter('requests', 10, { method: 'GET', status: '200' });

      const output = collector.exportPrometheus();

      expect(output).toContain('requests{method="GET",status="200"} 10');
    });

    it('should format histogram buckets', () => {
      collector.observeHistogram('duration', 50);

      const output = collector.exportPrometheus();

      expect(output).toContain('duration_bucket{le="100"}');
      expect(output).toContain('duration_bucket{le="+Inf"}');
      expect(output).toContain('duration_sum');
      expect(output).toContain('duration_count');
    });

    it('should format summary quantiles', () => {
      for (let i = 1; i <= 100; i++) {
        collector.observeSummary('response_time', i);
      }

      const output = collector.exportPrometheus();

      expect(output).toContain('response_time{quantile="0.5"}');
      expect(output).toContain('response_time{quantile="0.99"}');
      expect(output).toContain('response_time_sum');
      expect(output).toContain('response_time_count');
    });
  });

  describe('Reset', () => {
    it('should clear all metrics', () => {
      collector.incrementCounter('counter', 1);
      collector.setGauge('gauge', 10);
      collector.observeHistogram('histogram', 100);
      collector.observeSummary('summary', 50);

      collector.reset();

      expect(collector.getCounters().size).toBe(0);
      expect(collector.getGauges().size).toBe(0);
      expect(collector.getHistograms().size).toBe(0);
      expect(collector.getSummaries().size).toBe(0);
    });

    it('should allow new metrics after reset', () => {
      collector.incrementCounter('counter', 5);
      collector.reset();
      collector.incrementCounter('counter', 3);

      const counter = Array.from(collector.getCounters().values())[0];
      expect(counter.value).toBe(3);
    });
  });

  describe('METRICS Constants', () => {
    it('should define request metrics', () => {
      expect(METRICS.REQUESTS_TOTAL).toBe('evm_integration_requests_total');
      expect(METRICS.REQUESTS_FAILED).toBe('evm_integration_requests_failed');
      expect(METRICS.REQUEST_DURATION).toBe('evm_integration_request_duration_ms');
    });

    it('should define cache metrics', () => {
      expect(METRICS.CACHE_HITS).toBe('evm_integration_cache_hits');
      expect(METRICS.CACHE_MISSES).toBe('evm_integration_cache_misses');
      expect(METRICS.CACHE_SIZE).toBe('evm_integration_cache_size');
    });

    it('should define circuit breaker metrics', () => {
      expect(METRICS.CIRCUIT_BREAKER_STATE).toBe('evm_integration_circuit_breaker_state');
      expect(METRICS.CIRCUIT_BREAKER_TRANSITIONS).toBe('evm_integration_circuit_breaker_transitions');
    });

    it('should define connection metrics', () => {
      expect(METRICS.ACTIVE_CONNECTIONS).toBe('evm_integration_active_connections');
      expect(METRICS.CONNECTION_POOL_SIZE).toBe('evm_integration_connection_pool_size');
    });

    it('should define error metrics', () => {
      expect(METRICS.ERROR_RATE).toBe('evm_integration_error_rate');
      expect(METRICS.ERRORS_BY_TYPE).toBe('evm_integration_errors_by_type');
    });
  });

  describe('Label Handling', () => {
    it('should generate consistent keys', () => {
      collector.incrementCounter('test', 1, { a: '1', b: '2' });
      collector.incrementCounter('test', 1, { b: '2', a: '1' }); // Different order

      // Should be same counter (accumulated)
      expect(collector.getCounters().size).toBe(1);
      const counter = Array.from(collector.getCounters().values())[0];
      expect(counter.value).toBe(2);
    });

    it('should handle numeric label values', () => {
      collector.incrementCounter('test', 1, { code: 200 });

      const counter = Array.from(collector.getCounters().values())[0];
      expect(counter.labels.code).toBe(200);
    });

    it('should handle empty labels', () => {
      collector.incrementCounter('test', 1);

      const counter = Array.from(collector.getCounters().values())[0];
      expect(counter.labels).toEqual({});
    });
  });
});
