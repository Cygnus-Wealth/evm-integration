#!/usr/bin/env tsx
/**
 * POC Demo Script
 *
 * Demonstrates the latest features without depending on address validation.
 * This script can be run directly to test the functionality.
 *
 * Run with: npm run verify:balance (or tsx src/poc/demo-poc.ts)
 */

import { RateLimiter } from '../security/RateLimiter';
import { HealthMonitor } from '../observability/HealthMonitor';
import { MetricsCollector, METRICS } from '../observability/MetricsCollector';
import { HealthStatus } from '../observability/interfaces';
import { CircuitBreaker } from '../resilience/CircuitBreaker';
import { RetryPolicy } from '../resilience/RetryPolicy';
import { CacheManager } from '../performance/CacheManager';

/**
 * Demo 1: RateLimiter
 */
async function demoRateLimiter() {
  console.log('\n=== Demo 1: RateLimiter ===');

  const rateLimiter = new RateLimiter({
    capacity: 5,
    refillRate: 1, // 1 token per second
    maxWait: 5000,
    name: 'demo-limiter',
  });

  console.log(`Initial tokens: ${rateLimiter.getAvailableTokens()}`);

  // Acquire 3 tokens
  for (let i = 0; i < 3; i++) {
    const acquired = rateLimiter.tryAcquire();
    console.log(`Token ${i + 1} acquired: ${acquired}`);
  }

  console.log(`Remaining tokens: ${rateLimiter.getAvailableTokens()}`);

  // Try to execute a function with rate limiting
  const result = await rateLimiter.execute(async () => {
    console.log('Executing rate-limited function...');
    return 'Success!';
  });

  console.log(`Function result: ${result}`);
  console.log(`Final tokens: ${rateLimiter.getAvailableTokens()}`);
}

/**
 * Demo 2: HealthMonitor
 */
async function demoHealthMonitor() {
  console.log('\n=== Demo 2: HealthMonitor ===');

  const healthMonitor = new HealthMonitor();

  // Register health checks
  healthMonitor.registerCheck({
    component: 'database',
    check: async () => ({
      component: 'database',
      status: HealthStatus.HEALTHY,
      timestamp: new Date(),
      message: 'Database connection is healthy',
    }),
    critical: true,
    interval: 60000,
    timeout: 5000,
  });

  healthMonitor.registerCheck({
    component: 'cache',
    check: async () => ({
      component: 'cache',
      status: HealthStatus.HEALTHY,
      timestamp: new Date(),
      message: 'Cache is operational',
    }),
    critical: false,
    interval: 30000,
  });

  healthMonitor.registerCheck({
    component: 'backup-service',
    check: async () => ({
      component: 'backup-service',
      status: HealthStatus.DEGRADED,
      timestamp: new Date(),
      message: 'Backup service responding slowly',
    }),
    critical: false,
  });

  // Run health checks
  const systemHealth = await healthMonitor.runHealthChecks();

  console.log(`Overall Status: ${systemHealth.status}`);
  console.log(`Uptime: ${systemHealth.uptime}ms`);
  console.log(`Components Checked: ${systemHealth.components.length}`);

  for (const component of systemHealth.components) {
    console.log(
      `  - ${component.component}: ${component.status} (${component.responseTime?.toFixed(2)}ms)`
    );
    if (component.message) {
      console.log(`    ${component.message}`);
    }
  }

  // Get cached status
  const dbStatus = healthMonitor.getStatus('database');
  console.log(`\nCached DB Status: ${dbStatus?.status}`);
}

/**
 * Demo 3: MetricsCollector
 */
async function demoMetricsCollector() {
  console.log('\n=== Demo 3: MetricsCollector ===');

  const metricsCollector = new MetricsCollector();

  // Counter metrics
  console.log('\nRecording counter metrics...');
  metricsCollector.incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
    chain: 'ethereum',
    method: 'getBalance',
  });
  metricsCollector.incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
    chain: 'ethereum',
    method: 'getBalance',
  });
  metricsCollector.incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
    chain: 'polygon',
    method: 'getTransactions',
  });

  // Gauge metrics
  console.log('Recording gauge metrics...');
  metricsCollector.setGauge(METRICS.ACTIVE_CONNECTIONS, 5, { chain: 'ethereum' });
  metricsCollector.setGauge(METRICS.CACHE_SIZE, 1024, { layer: 'L1' });

  // Histogram metrics
  console.log('Recording histogram metrics...');
  metricsCollector.observeHistogram(METRICS.REQUEST_DURATION, 50);
  metricsCollector.observeHistogram(METRICS.REQUEST_DURATION, 150);
  metricsCollector.observeHistogram(METRICS.REQUEST_DURATION, 250);
  metricsCollector.observeHistogram(METRICS.REQUEST_DURATION, 75);
  metricsCollector.observeHistogram(METRICS.REQUEST_DURATION, 125);

  // Measure async operation
  console.log('Measuring async operation...');
  await metricsCollector.measure(
    'demo_operation',
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return 'completed';
    },
    { type: 'async' }
  );

  // Display metrics
  console.log('\n--- Collected Metrics ---');

  const counters = metricsCollector.getCounters();
  console.log(`\nCounters (${counters.size}):`);
  for (const [key, counter] of counters) {
    console.log(`  ${key}: ${counter.value}`);
  }

  const gauges = metricsCollector.getGauges();
  console.log(`\nGauges (${gauges.size}):`);
  for (const [key, gauge] of gauges) {
    console.log(`  ${key}: ${gauge.value}`);
  }

  const histograms = metricsCollector.getHistograms();
  console.log(`\nHistograms (${histograms.size}):`);
  for (const [key, histogram] of histograms) {
    console.log(
      `  ${key}: count=${histogram.count}, sum=${histogram.sum}, avg=${(
        histogram.sum / histogram.count
      ).toFixed(2)}`
    );
  }

  // Export Prometheus format
  console.log('\n--- Prometheus Export (sample) ---');
  const prometheus = metricsCollector.exportPrometheus();
  console.log(prometheus.split('\n').slice(0, 10).join('\n'));
  console.log('...');
}

/**
 * Demo 4: Circuit Breaker
 */
async function demoCircuitBreaker() {
  console.log('\n=== Demo 4: Circuit Breaker ===');

  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    timeout: 5000,
    name: 'demo-breaker',
  });

  let callCount = 0;

  const unreliableOperation = async () => {
    callCount++;
    if (callCount <= 3) {
      throw new Error('Service unavailable');
    }
    return 'Success!';
  };

  console.log('Attempting operations with circuit breaker...');

  // First 3 calls will fail
  for (let i = 0; i < 3; i++) {
    try {
      await breaker.execute(unreliableOperation);
    } catch (error) {
      console.log(`  Call ${i + 1}: Failed - ${(error as Error).message}`);
    }
  }

  const stats = breaker.getStats();
  console.log(`\nCircuit Breaker Stats:`);
  console.log(`  State: ${stats.state}`);
  console.log(`  Failure Count: ${stats.failureCount}`);
  console.log(`  Success Count: ${stats.successCount}`);
  console.log(`  Last Failure: ${stats.lastFailureTime ? new Date(stats.lastFailureTime).toISOString() : 'N/A'}`);

  // Try when circuit is open
  try {
    await breaker.execute(unreliableOperation);
  } catch (error) {
    console.log(`\nCall with OPEN circuit: ${(error as Error).message}`);
  }
}

/**
 * Demo 5: Retry Policy
 */
async function demoRetryPolicy() {
  console.log('\n=== Demo 5: Retry Policy ===');

  const retryPolicy = new RetryPolicy({
    maxAttempts: 3,
    baseDelay: 100,
    maxDelay: 1000,
    multiplier: 2,
  });

  let attempts = 0;

  const flakeyOperation = async () => {
    attempts++;
    console.log(`  Attempt ${attempts}...`);

    if (attempts < 2) {
      throw new Error('Temporary failure');
    }

    return 'Success after retries!';
  };

  console.log('Executing operation with retry policy...');

  try {
    const result = await retryPolicy.execute(flakeyOperation);
    console.log(`Result: ${result}`);
  } catch (error) {
    console.log(`Failed after retries: ${(error as Error).message}`);
  }

  // Note: RetryPolicy doesn't expose getStats() method
  console.log(`\nRetry completed with ${attempts} attempts`);
}

/**
 * Demo 6: Cache Manager
 */
async function demoCacheManager() {
  console.log('\n=== Demo 6: Cache Manager ===');

  const cache = new CacheManager<string>({
    capacity: 100,
    defaultTTL: 5, // 5 seconds
    enableLRU: true,
  });

  console.log('Setting cache entries...');
  await cache.set('user:1', 'Alice');
  await cache.set('user:2', 'Bob');
  await cache.set('user:3', 'Charlie', 10); // Custom TTL

  console.log('Getting cache entries...');
  const user1 = await cache.get('user:1');
  const user2 = await cache.get('user:2');
  const user4 = await cache.get('user:4'); // Non-existent

  console.log(`  user:1 = ${user1}`);
  console.log(`  user:2 = ${user2}`);
  console.log(`  user:4 = ${user4}`);

  const stats = cache.getStats();
  console.log(`\nCache Stats:`);
  console.log(`  Size: ${stats.size}`);
  console.log(`  Hits: ${stats.hits}`);
  console.log(`  Misses: ${stats.misses}`);
  console.log(`  Hit Rate: ${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)}%`);
  console.log(`  Evictions: ${stats.evictions}`);

  // Check if key exists
  const hasUser1 = await cache.has('user:1');
  console.log(`\nCache has user:1: ${hasUser1}`);

  // Clear cache
  await cache.clear();
  console.log('Cache cleared');
  console.log(`Final size: ${cache.getStats().size}`);
}

/**
 * Main demo runner
 */
async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   EVM Integration POC Demonstration        ║');
  console.log('║   Testing Phase 7-8 Features               ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    await demoRateLimiter();
    await demoHealthMonitor();
    await demoMetricsCollector();
    await demoCircuitBreaker();
    await demoRetryPolicy();
    await demoCacheManager();

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   All Demos Completed Successfully! ✓     ║');
    console.log('╚════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as runPocDemo };
