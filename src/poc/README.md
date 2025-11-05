# POC (Proof of Concept) Testing

This directory contains POC implementations for testing the latest features of the EVM Integration library.

## Contents

### 1. `integration-poc.test.ts`
Comprehensive test suite covering:
- RateLimiter (Phase 7 security)
- BalanceService with resilience patterns
- HealthMonitor (observability)
- MetricsCollector (observability)
- E2E integration flows
- Data models compliance

**Status:** 13/23 tests passing
**Issue:** Address validation blocks 10 tests (see ../POC_FINDINGS.md)

```bash
npm test -- src/poc/integration-poc.test.ts
```

### 2. `demo-poc.ts`
Automated demonstration of all features:
- RateLimiter token bucket algorithm
- HealthMonitor with multi-component health checks
- MetricsCollector with Prometheus export
- CircuitBreaker state management
- RetryPolicy with exponential backoff
- CacheManager with LRU eviction

**Status:** ✓ All demos working
**Type:** Automated (runs all demos automatically)

```bash
npx tsx src/poc/demo-poc.ts
```

### 3. `manual-test.ts` ⭐ NEW
Interactive manual testing tool with menu-driven interface:
- Test each feature individually
- Control inputs and parameters
- View real-time stats and metrics
- Experiment with different scenarios
- Reset and retry as needed

**Status:** ✓ Interactive menu working
**Type:** Manual/Interactive (you control what runs)

```bash
npx tsx src/poc/manual-test.ts
```

**Features:**
- 13 interactive test commands
- Real-time feedback
- Customizable inputs
- View stats anytime
- Mock BalanceService for safe testing

## Quick Start

```bash
# Interactive manual testing (recommended - you control everything!)
npx tsx src/poc/manual-test.ts

# Or run automated demo (shows all features automatically)
npx tsx src/poc/demo-poc.ts

# Or run the comprehensive test suite
npm test -- src/poc/integration-poc.test.ts
```

## Expected Output

### Manual Test Tool (Interactive)
```
╔════════════════════════════════════════════╗
║   Interactive Manual Testing Tool         ║
╚════════════════════════════════════════════╝

1.  Test RateLimiter
2.  Test HealthMonitor
3.  Test MetricsCollector
4.  Test CircuitBreaker
5.  Test RetryPolicy
6.  Test CacheManager
7.  Test BalanceService
8.  View RateLimiter Stats
9.  View Health Status
10. View Metrics (Prometheus format)
11. View Cache Stats
12. View CircuitBreaker Stats
13. Reset All Components
0.  Exit

Enter your choice: _
```

You can:
- Test features individually
- Provide your own inputs
- View stats anytime
- Experiment with different scenarios
- Reset and start over

### Automated Demo Script
The demo shows live output for each feature:
```
╔════════════════════════════════════════════╗
║   EVM Integration POC Demonstration        ║
║   Testing Phase 7-8 Features               ║
╚════════════════════════════════════════════╝

=== Demo 1: RateLimiter ===
Initial tokens: 5
Token 1 acquired: true
...

All Demos Completed Successfully! ✓
```

### Test Suite
After address validation fix:
```
✓ POC: Integration of Latest Features (23 tests)
  ✓ Phase 7: RateLimiter Integration (4)
  ✓ Service Layer: BalanceService with Resilience (6)
  ✓ Observability: HealthMonitor (4)
  ✓ Observability: MetricsCollector (6)
  ✓ Full Integration: E2E Balance Fetch Flow (2)
  ✓ Data Models Compliance (1)
```

## Issues Found

See `../POC_FINDINGS.md` for detailed analysis. Key issues:

1. **Address validation too strict** - Blocks checksummed addresses (HIGH)
2. **Timer-based test timeout** - Async timing issue (LOW)
3. **Failed request stats** - May not track all errors (LOW)
4. **Missing RetryPolicy.getStats()** - API inconsistency (LOW)

## Features Demonstrated

### Security Layer
- ✓ Rate limiting with token bucket algorithm
- ✓ Request throttling and queueing
- ✓ Token refill over time

### Resilience Patterns
- ✓ Circuit breaker with state management
- ✓ Retry with exponential backoff
- ✓ Request coalescing and deduplication
- ✓ Fallback strategies

### Performance Optimization
- ✓ Multi-layer caching (L1 memory, L2 IndexedDB)
- ✓ Request batching
- ✓ LRU cache eviction
- ✓ Cache statistics

### Observability
- ✓ Health monitoring with aggregation
- ✓ Metrics collection (counters, gauges, histograms, summaries)
- ✓ Prometheus-compatible export
- ✓ Async operation measurement

### Service Layer
- ✓ Balance fetching with caching
- ✓ Multi-chain balance aggregation
- ✓ Error collection without failing
- ✓ Service statistics tracking

## Architecture Verification

The POC validates:
- [x] DDD service layer pattern
- [x] Cross-cutting concerns separation
- [x] Data models compliance (@cygnus-wealth/data-models)
- [x] Resilience pattern implementation
- [x] Observability instrumentation
- [x] Type safety and TypeScript usage

## Usage in Development

### As Reference Implementation
The POC files serve as working examples of:
- How to use BalanceService
- How to configure rate limiters
- How to set up health monitoring
- How to collect and export metrics

### For Testing New Features
1. Copy test patterns from `integration-poc.test.ts`
2. Use test utilities from `../test-utils/index.ts`
3. Follow the setup/teardown patterns
4. Verify with both unit tests and demo script

### For Debugging
Run the demo script to verify:
- Rate limiting behavior
- Circuit breaker state transitions
- Retry policy execution
- Cache hit/miss ratios
- Health check aggregation

## Related Documentation

- [POC_FINDINGS.md](../../POC_FINDINGS.md) - Detailed issues and recommendations
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - System architecture
- [test-utils](../test-utils/index.ts) - Testing utilities

---

**Last Updated:** 2025-10-20
**Status:** Active Development
**Maintainer:** EVM Integration Team
