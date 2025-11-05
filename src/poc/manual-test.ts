#!/usr/bin/env tsx
/**
 * Interactive Manual Testing Tool
 *
 * Allows you to manually test and explore the latest features:
 * - RateLimiter
 * - HealthMonitor
 * - MetricsCollector
 * - CircuitBreaker
 * - RetryPolicy
 * - CacheManager
 * - BalanceService (mocked)
 *
 * Run with: npx tsx src/poc/manual-test.ts
 */

import * as readline from 'readline';
import { RateLimiter } from '../security/RateLimiter';
import { HealthMonitor } from '../observability/HealthMonitor';
import { MetricsCollector, METRICS } from '../observability/MetricsCollector';
import { HealthStatus } from '../observability/interfaces';
import { CircuitBreaker } from '../resilience/CircuitBreaker';
import { RetryPolicy } from '../resilience/RetryPolicy';
import { CacheManager } from '../performance/CacheManager';
import { BalanceService } from '../services/BalanceService';
import { IChainAdapter } from '../types/IChainAdapter';
import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';

// Global state
let rateLimiter: RateLimiter;
let healthMonitor: HealthMonitor;
let metricsCollector: MetricsCollector;
let circuitBreaker: CircuitBreaker;
let retryPolicy: RetryPolicy;
let cacheManager: CacheManager<string>;
let balanceService: BalanceService;

// Mock adapter for testing
function createMockBalanceAdapter(): IChainAdapter {
  return {
    chainId: 1,
    getBalance: async (address: Address): Promise<Balance> => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
      return {
        address,
        chainId: 1,
        balance: '1500000000000000000',
        balanceFormatted: '1.5',
        symbol: 'ETH',
        decimals: 18,
        blockNumber: 12345678n,
        timestamp: new Date(),
      };
    },
    getTokenBalances: async () => [],
    getTransactions: async () => [],
    getTransaction: async () => ({
      hash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      from: '0x742d35cc6634c0532925a3f844fc9e7595f0fefa' as Address,
      to: '0x742d35cc6634c0532925a3f844fc9e7595f0fefa' as Address,
      value: '1000000000000000000',
      blockNumber: 12345678n,
      timestamp: new Date(),
      status: 'success',
      type: 'SEND',
      chainId: 1,
      gasUsed: '21000',
      gasPrice: '50000000000',
    }),
    subscribeToBlocks: async () => () => {},
    subscribeToBalance: async () => () => {},
    unsubscribe: () => {},
    getChainInfo: () => ({
      chainId: 1,
      name: 'Ethereum',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    }),
    isHealthy: async () => true,
  };
}

// Initialize components
function initializeComponents() {
  console.log('Initializing components...\n');

  rateLimiter = new RateLimiter({
    capacity: 10,
    refillRate: 2, // 2 tokens per second
    maxWait: 5000,
    name: 'manual-test-limiter',
  });

  healthMonitor = new HealthMonitor();
  metricsCollector = new MetricsCollector();

  circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    timeout: 5000,
    name: 'manual-test-breaker',
  });

  retryPolicy = new RetryPolicy({
    maxAttempts: 3,
    baseDelay: 100,
    maxDelay: 1000,
    multiplier: 2,
  });

  cacheManager = new CacheManager<string>({
    capacity: 100,
    defaultTTL: 30, // 30 seconds
    enableLRU: true,
  });

  // Setup BalanceService with mock adapter
  const mockAdapter = createMockBalanceAdapter();
  const adapters = new Map<number, IChainAdapter>();
  adapters.set(1, mockAdapter);

  balanceService = new BalanceService(adapters, {
    enableCache: true,
    cacheTTL: 60,
    enableBatching: true,
    enableCircuitBreaker: true,
    enableRetry: true,
  });

  // Register sample health checks
  healthMonitor.registerCheck({
    component: 'ethereum-rpc',
    check: async () => ({
      component: 'ethereum-rpc',
      status: HealthStatus.HEALTHY,
      timestamp: new Date(),
      message: 'RPC endpoint responding normally',
    }),
    critical: true,
  });

  healthMonitor.registerCheck({
    component: 'cache-system',
    check: async () => ({
      component: 'cache-system',
      status: HealthStatus.HEALTHY,
      timestamp: new Date(),
      message: 'Cache operational',
    }),
    critical: false,
  });

  console.log('✓ All components initialized\n');
}

// Interactive menu
function displayMenu() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   Interactive Manual Testing Tool         ║');
  console.log('╚════════════════════════════════════════════╝\n');
  console.log('1.  Test RateLimiter');
  console.log('2.  Test HealthMonitor');
  console.log('3.  Test MetricsCollector');
  console.log('4.  Test CircuitBreaker');
  console.log('5.  Test RetryPolicy');
  console.log('6.  Test CacheManager');
  console.log('7.  Test BalanceService');
  console.log('8.  View RateLimiter Stats');
  console.log('9.  View Health Status');
  console.log('10. View Metrics (Prometheus format)');
  console.log('11. View Cache Stats');
  console.log('12. View CircuitBreaker Stats');
  console.log('13. Reset All Components');
  console.log('0.  Exit');
  console.log('\n');
}

// Test functions
async function testRateLimiter(rl: readline.Interface): Promise<void> {
  console.log('\n=== RateLimiter Test ===\n');
  console.log(`Current tokens: ${rateLimiter.getAvailableTokens()}`);

  const answer = await question(rl, 'How many tokens to acquire? (1-10): ');
  const count = parseInt(answer, 10);

  if (isNaN(count) || count < 1 || count > 10) {
    console.log('Invalid number. Please enter 1-10.');
    return;
  }

  console.log(`\nAttempting to acquire ${count} tokens...`);

  for (let i = 0; i < count; i++) {
    const acquired = rateLimiter.tryAcquire();
    console.log(`Token ${i + 1}: ${acquired ? '✓ Acquired' : '✗ Denied'}`);
  }

  console.log(`\nRemaining tokens: ${rateLimiter.getAvailableTokens()}`);
  console.log('Note: Tokens refill at 2 per second');
}

async function testHealthMonitor(): Promise<void> {
  console.log('\n=== HealthMonitor Test ===\n');
  console.log('Running health checks...\n');

  const systemHealth = await healthMonitor.runHealthChecks();

  console.log(`Overall Status: ${systemHealth.status}`);
  console.log(`Uptime: ${systemHealth.uptime}ms`);
  console.log(`Components Checked: ${systemHealth.components.length}\n`);

  for (const component of systemHealth.components) {
    const icon = component.status === HealthStatus.HEALTHY ? '✓' :
                 component.status === HealthStatus.DEGRADED ? '⚠' : '✗';
    console.log(`${icon} ${component.component}: ${component.status}`);
    if (component.message) {
      console.log(`  ${component.message}`);
    }
    if (component.responseTime) {
      console.log(`  Response time: ${component.responseTime.toFixed(2)}ms`);
    }
  }
}

async function testMetricsCollector(rl: readline.Interface): Promise<void> {
  console.log('\n=== MetricsCollector Test ===\n');
  console.log('Choose metric type:');
  console.log('1. Increment counter');
  console.log('2. Set gauge');
  console.log('3. Observe histogram');
  console.log('4. Observe summary');

  const choice = await question(rl, '\nChoice (1-4): ');

  switch (choice) {
    case '1': {
      const value = await question(rl, 'Value to increment by: ');
      const label = await question(rl, 'Label (e.g., "ethereum"): ');
      metricsCollector.incrementCounter('test_counter', parseInt(value, 10) || 1, {
        chain: label || 'test',
      });
      console.log('✓ Counter incremented');
      break;
    }
    case '2': {
      const value = await question(rl, 'Gauge value: ');
      const label = await question(rl, 'Label (e.g., "connections"): ');
      metricsCollector.setGauge('test_gauge', parseInt(value, 10) || 0, {
        type: label || 'test',
      });
      console.log('✓ Gauge set');
      break;
    }
    case '3': {
      const value = await question(rl, 'Duration in ms: ');
      metricsCollector.observeHistogram('test_histogram', parseInt(value, 10) || 100);
      console.log('✓ Histogram observation recorded');
      break;
    }
    case '4': {
      const value = await question(rl, 'Value to observe: ');
      metricsCollector.observeSummary('test_summary', parseInt(value, 10) || 50);
      console.log('✓ Summary observation recorded');
      break;
    }
    default:
      console.log('Invalid choice');
  }
}

async function testCircuitBreaker(rl: readline.Interface): Promise<void> {
  console.log('\n=== CircuitBreaker Test ===\n');
  console.log('Choose operation:');
  console.log('1. Execute successful operation');
  console.log('2. Execute failing operation (to trigger breaker)');

  const choice = await question(rl, '\nChoice (1-2): ');

  const operation = choice === '2'
    ? async () => { throw new Error('Simulated failure'); }
    : async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'Success!';
      };

  try {
    console.log('\nExecuting operation...');
    const result = await circuitBreaker.execute(operation);
    console.log(`✓ Result: ${result}`);
  } catch (error) {
    console.log(`✗ Error: ${(error as Error).message}`);
  }

  const stats = circuitBreaker.getStats();
  console.log(`\nCircuit State: ${stats.state}`);
  console.log(`Failures: ${stats.failureCount}`);
  console.log(`Successes: ${stats.successCount}`);
}

async function testRetryPolicy(rl: readline.Interface): Promise<void> {
  console.log('\n=== RetryPolicy Test ===\n');
  console.log('Choose scenario:');
  console.log('1. Operation succeeds on first try');
  console.log('2. Operation succeeds on second try');
  console.log('3. Operation fails all attempts');

  const choice = await question(rl, '\nChoice (1-3): ');

  let attemptCount = 0;
  const maxAttempts = choice === '1' ? 0 : choice === '2' ? 1 : 999;

  const operation = async () => {
    attemptCount++;
    console.log(`  Attempt ${attemptCount}...`);

    if (attemptCount <= maxAttempts) {
      throw new Error('Temporary failure');
    }

    return 'Success!';
  };

  try {
    console.log('\nExecuting with retry policy...');
    const result = await retryPolicy.execute(operation);
    console.log(`✓ Result: ${result}`);
    console.log(`Total attempts: ${attemptCount}`);
  } catch (error) {
    console.log(`✗ Failed after ${attemptCount} attempts`);
    console.log(`Error: ${(error as Error).message}`);
  }
}

async function testCacheManager(rl: readline.Interface): Promise<void> {
  console.log('\n=== CacheManager Test ===\n');
  console.log('Choose operation:');
  console.log('1. Set value');
  console.log('2. Get value');
  console.log('3. Delete value');
  console.log('4. Check if key exists');

  const choice = await question(rl, '\nChoice (1-4): ');

  switch (choice) {
    case '1': {
      const key = await question(rl, 'Key: ');
      const value = await question(rl, 'Value: ');
      const ttl = await question(rl, 'TTL in seconds (default 30): ');
      await cacheManager.set(key, value, ttl ? parseInt(ttl, 10) : undefined);
      console.log('✓ Value cached');
      break;
    }
    case '2': {
      const key = await question(rl, 'Key: ');
      const value = await cacheManager.get(key);
      console.log(value ? `✓ Value: ${value}` : '✗ Key not found');
      break;
    }
    case '3': {
      const key = await question(rl, 'Key: ');
      await cacheManager.delete(key);
      console.log('✓ Key deleted');
      break;
    }
    case '4': {
      const key = await question(rl, 'Key: ');
      const exists = await cacheManager.has(key);
      console.log(exists ? '✓ Key exists' : '✗ Key does not exist');
      break;
    }
    default:
      console.log('Invalid choice');
  }
}

async function testBalanceService(rl: readline.Interface): Promise<void> {
  console.log('\n=== BalanceService Test ===\n');
  console.log('This uses a mock adapter for demonstration.\n');

  const address = await question(rl, 'Enter address (or press Enter for default): ');
  const testAddress = (address || '0x742d35cc6634c0532925a3f844fc9e7595f0fefa') as Address;

  console.log('\nFetching balance...');
  const startTime = Date.now();

  try {
    const balance = await balanceService.getBalance(testAddress, 1);
    const duration = Date.now() - startTime;

    console.log('\n✓ Balance fetched successfully!');
    console.log(`  Address: ${balance.address}`);
    console.log(`  Balance: ${balance.balanceFormatted} ${balance.symbol}`);
    console.log(`  Chain ID: ${balance.chainId}`);
    console.log(`  Block: ${balance.blockNumber}`);
    console.log(`  Fetch time: ${duration}ms`);

    const stats = balanceService.getStats();
    console.log(`\n  Cache hits: ${stats.cacheHits}`);
    console.log(`  Cache misses: ${stats.cacheMisses}`);
    console.log(`  Hit rate: ${((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100).toFixed(1)}%`);
  } catch (error) {
    console.log(`✗ Error: ${(error as Error).message}`);
  }
}

function viewRateLimiterStats(): void {
  console.log('\n=== RateLimiter Stats ===\n');
  console.log(`Available tokens: ${rateLimiter.getAvailableTokens()}`);
  console.log('Capacity: 10');
  console.log('Refill rate: 2 tokens/second');
  console.log('Max wait: 5000ms');
}

function viewHealthStatus(): void {
  console.log('\n=== System Health Status ===\n');
  const systemHealth = healthMonitor.getSystemHealth();

  console.log(`Overall Status: ${systemHealth.status}`);
  console.log(`Components: ${systemHealth.components.length}`);
  console.log(`Uptime: ${systemHealth.uptime}ms\n`);

  for (const component of systemHealth.components) {
    const icon = component.status === HealthStatus.HEALTHY ? '✓' :
                 component.status === HealthStatus.DEGRADED ? '⚠' : '✗';
    console.log(`${icon} ${component.component}: ${component.status}`);
  }
}

function viewMetrics(): void {
  console.log('\n=== Metrics (Prometheus Format) ===\n');
  const prometheus = metricsCollector.exportPrometheus();

  if (prometheus) {
    console.log(prometheus);
  } else {
    console.log('No metrics collected yet.');
  }
}

function viewCacheStats(): void {
  console.log('\n=== Cache Stats ===\n');
  const stats = cacheManager.getStats();

  console.log(`Size: ${stats.size} entries`);
  console.log(`Capacity: 100 entries`);
  console.log(`Hits: ${stats.hits}`);
  console.log(`Misses: ${stats.misses}`);
  console.log(`Hit rate: ${stats.hits + stats.misses > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) : 0}%`);
  console.log(`Evictions: ${stats.evictions}`);
}

function viewCircuitBreakerStats(): void {
  console.log('\n=== CircuitBreaker Stats ===\n');
  const stats = circuitBreaker.getStats();

  console.log(`State: ${stats.state}`);
  console.log(`Failure count: ${stats.failureCount}`);
  console.log(`Success count: ${stats.successCount}`);
  console.log(`Last failure: ${stats.lastFailureTime ? new Date(stats.lastFailureTime).toISOString() : 'N/A'}`);
}

function resetAllComponents(): void {
  console.log('\n=== Resetting All Components ===\n');
  initializeComponents();
  metricsCollector.reset();
  console.log('✓ All components reset');
}

// Helper function for readline questions
function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

// Main interactive loop
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.clear();
  initializeComponents();

  let running = true;

  while (running) {
    displayMenu();
    const choice = await question(rl, 'Enter your choice: ');

    switch (choice.trim()) {
      case '1':
        await testRateLimiter(rl);
        break;
      case '2':
        await testHealthMonitor();
        break;
      case '3':
        await testMetricsCollector(rl);
        break;
      case '4':
        await testCircuitBreaker(rl);
        break;
      case '5':
        await testRetryPolicy(rl);
        break;
      case '6':
        await testCacheManager(rl);
        break;
      case '7':
        await testBalanceService(rl);
        break;
      case '8':
        viewRateLimiterStats();
        break;
      case '9':
        viewHealthStatus();
        break;
      case '10':
        viewMetrics();
        break;
      case '11':
        viewCacheStats();
        break;
      case '12':
        viewCircuitBreakerStats();
        break;
      case '13':
        resetAllComponents();
        break;
      case '0':
        console.log('\nExiting... Goodbye!\n');
        running = false;
        break;
      default:
        console.log('\nInvalid choice. Please try again.');
    }

    if (running) {
      await question(rl, '\nPress Enter to continue...');
      console.clear();
    }
  }

  rl.close();
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as runManualTest };
