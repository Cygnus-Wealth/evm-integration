# EVM Integration Unit Architecture

> **Navigation**: [Developer Guide](./DEVELOPERS.md) > [System Architecture](./ARCHITECTURE.md) > **Unit Architecture** (Root Document)
>
> **Document Type**: Unit Architecture Specification
> **Status**: Active - Phases 1-7 Complete, Phase 8 Pending
> **Version**: 2.2
> **Updated**: 2025-10-14
> **For**: Software Engineer (Implementation)

## Overview

This document serves as the **reference guide** to the unit-level architecture for the EVM Integration system.

**IMPORTANT**: This is NOT an implementation guide with code snippets. The authoritative contracts are defined in **actual TypeScript interface files with comprehensive JSDoc**. This document references those files and provides context on their usage.

### Architecture Principles

1. **Contracts in Code**: All interfaces, types, and contracts are defined in TypeScript files, not documentation
2. **JSDoc as Contract**: JSDoc comments are the authoritative specification for behavior
3. **Type Safety**: TypeScript compiler enforces architectural contracts
4. **No Documentation Drift**: Single source of truth in version-controlled code files

---

## Table of Contents

1. [Error Hierarchy](#1-error-hierarchy) - `src/utils/errors.ts`
2. [Resilience Components](#2-resilience-components) - `src/resilience/`
3. [Performance Components](#3-performance-components) - `src/performance/`
4. [Service Layer](#4-service-layer) - `src/services/`
5. [Observability Components](#5-observability-components) - `src/observability/` ✅ *Implemented*
6. [Validation & Security](#6-validation--security) - `src/utils/validators.ts`, `src/security/` ✅ *Implemented*
7. [Test Specifications](#7-test-specifications)

---

## Implementation Status

| Phase | Components | Status | Files |
|-------|-----------|---------|-------|
| **1** | Foundation | ✅ Complete | `src/utils/errors.ts`, `src/utils/validators.ts` |
| **2** | Resilience | ✅ Complete | `src/resilience/*.ts` |
| **3** | Performance | ✅ Complete | `src/performance/*.ts` |
| **4** | Advanced Resilience | ✅ Complete | `src/resilience/*.ts` |
| **5** | Services | ✅ Complete | `src/services/*.ts` |
| **6** | Observability | ✅ Complete | `src/observability/*.ts` |
| **7** | Security | ✅ Complete | `src/security/*.ts` |
| **8** | Integration/E2E | ⚠️ Minimal | `src/resilience/integration.test.ts` only |

---

## 1. Error Hierarchy

**Status**: ✅ Implemented

### Primary File
**`src/utils/errors.ts`**

Defines the complete error hierarchy for the integration layer:

```
IntegrationError (base)
├── ConnectionError (retriable)
├── RateLimitError (retriable after wait)
├── ValidationError (not retriable)
├── DataError (not retriable)
└── CircuitBreakerError (retriable after timeout)
```

### Key Contracts

See JSDoc in `src/utils/errors.ts` for:
- `IntegrationError` - Base error with context, retry guidance, timestamps
- `ConnectionError` - Network/RPC failures with static factories (`timeout()`, `refused()`, `reset()`)
- `RateLimitError` - Rate limit tracking with `getWaitTime()` helper
- `ValidationError` - Input validation with static factories (`invalidAddress()`, `invalidChainId()`)
- `DataError` - External data integrity issues
- `CircuitBreakerError` - Circuit open notification
- `ErrorUtils` - Helper functions (`isRetriable()`, `toIntegrationError()`, `sanitizeContext()`)

### Test Coverage
**`src/utils/errors.test.ts`** - 95% coverage achieved

---

## 2. Resilience Components

**Status**: ✅ Implemented

### Files

| Component | File | Purpose |
|-----------|------|---------|
| **Circuit Breaker** | `src/resilience/CircuitBreaker.ts` | Fail-fast pattern, prevents cascading failures |
| **Retry Policy** | `src/resilience/RetryPolicy.ts` | Exponential backoff with jitter |
| **Timeout Manager** | `src/resilience/TimeoutManager.ts` | Hierarchical timeout enforcement |
| **Fallback Chain** | `src/resilience/FallbackChain.ts` | Multi-strategy fallback orchestration |
| **Bulkhead Manager** | `src/resilience/BulkheadManager.ts` | Resource isolation and queueing |

### Usage Pattern

All resilience components follow a consistent pattern:

1. **Configure** with partial config (defaults provided)
2. **Execute** operations through the component
3. **Monitor** via `getStats()` or `getState()` methods
4. **Cleanup** with `destroy()` or `reset()` when needed

### Integration

See `src/resilience/integration.test.ts` for examples of combining multiple resilience patterns.

### Test Coverage
- `CircuitBreaker.test.ts` - 90% coverage
- `RetryPolicy.test.ts` - 92% coverage
- `TimeoutManager.test.ts` - 88% coverage
- `FallbackChain.test.ts` - 89% coverage
- `BulkheadManager.test.ts` - 87% coverage

---

## 3. Performance Components

**Status**: ✅ Implemented

### Files

| Component | File | Purpose |
|-----------|------|---------|
| **Cache Manager** | `src/performance/CacheManager.ts` | Multi-layer caching with LRU eviction |
| **Batch Processor** | `src/performance/BatchProcessor.ts` | Request batching within time windows |
| **Request Coalescer** | `src/performance/RequestCoalescer.ts` | Deduplication of concurrent identical requests |
| **Connection Pool** | `src/performance/ConnectionPool.ts` | Connection reuse with health checking |

### Key Concepts

**Cache Manager**:
- TTL-based expiration
- LRU eviction when capacity reached
- Statistics tracking (hit rate, evictions)
- See `TTL_STRATEGY` constant in source for recommended TTLs

**Batch Processor**:
- Time-window batching (default 50ms)
- Automatic flush on size limit or timeout
- Request-response mapping preservation

**Request Coalescer**:
- Returns same promise for duplicate in-flight requests
- Static `generateKey()` method for cache key creation
- Automatic cleanup of completed requests

**Connection Pool**:
- Min/max connection limits
- Idle timeout and health checking
- LIFO/FIFO/ROUND_ROBIN strategies
- Requires `ConnectionFactory<T>` interface implementation

### Test Coverage
- `CacheManager.test.ts` - 91% coverage
- `BatchProcessor.test.ts` - 89% coverage
- `RequestCoalescer.test.ts` - 93% coverage
- `ConnectionPool.test.ts` - 88% coverage

---

## 4. Service Layer

**Status**: ✅ Implemented

### Files

| Service | File | Purpose |
|---------|------|---------|
| **Balance Service** | `src/services/BalanceService.ts` | Balance fetching with caching, batching, resilience |
| **Transaction Service** | `src/services/TransactionService.ts` | Transaction history with pagination and filtering |
| **Tracking Service** | `src/services/TrackingService.ts` | Multi-address portfolio monitoring |

### Core Interface

**`src/types/IChainAdapter.ts`** - Contract that all chain adapters must implement

See comprehensive JSDoc in this file for:
- `IChainAdapter` interface with all required methods
- `TransactionOptions`, `ChainInfo`, `TokenConfig` types
- Method signatures with @param, @returns, @throws documentation

### Service Responsibilities

**BalanceService**:
- Integrates cache, batch processor, coalescer, circuit breakers
- Multi-chain balance aggregation
- Token balance fetching
- Real-time balance subscriptions

**TransactionService**:
- Paginated transaction history
- Type and status filtering
- Real-time transaction subscriptions
- Cache integration

**TrackingService**:
- Polls multiple addresses across chains
- Event-driven callbacks (`onBalanceChange`, `onNewTransaction`, `onError`)
- Configurable polling intervals
- Status tracking per address/chain

### Test Coverage
- `BalanceService.test.ts` - 87% coverage
- `TransactionService.test.ts` - 85% coverage
- `TrackingService.test.ts` - 84% coverage

---

## 5. Observability Components

**Status**: ✅ Implemented

### Files

| Component | File | Purpose |
|-----------|------|---------|
| **Interfaces** | `src/observability/interfaces.ts` | Complete interface definitions with JSDoc |
| **MetricsCollector** | `src/observability/MetricsCollector.ts` | Prometheus-compatible metrics collection |
| **HealthMonitor** | `src/observability/HealthMonitor.ts` | System health aggregation and monitoring |
| **CorrelationContextManager** | `src/observability/CorrelationContextManager.ts` | Distributed tracing context management |
| **Module Index** | `src/observability/index.ts` | Public API exports |

### Key Contracts

See JSDoc in `src/observability/interfaces.ts` for:
- `IHealthMonitor` - System health checks with periodic monitoring
- `IMetricsCollector` - Counter, Gauge, Histogram, Summary metrics with Prometheus export
- `ICorrelationContextManager` - Distributed tracing with correlation contexts and spans

### Types Defined

- `HealthStatus`, `HealthCheckResult`, `SystemHealth`, `HealthCheckConfig`
- `MetricType`, `Counter`, `Gauge`, `Histogram`, `Summary`, `MetricLabels`
- `CorrelationContext`, `Span`

### Implementation Highlights

**MetricsCollector**:
- All 4 metric types: Counter, Gauge, Histogram, Summary
- Prometheus text format export
- `measure()` helper for automatic duration tracking
- Histogram bucketing with customizable buckets
- Summary quantile calculation (p50, p90, p95, p99)
- Predefined `METRICS` constants for common metrics

**HealthMonitor**:
- Periodic health checks with configurable intervals
- Timeout handling for slow checks
- Status aggregation (HEALTHY/DEGRADED/UNHEALTHY)
- Critical vs non-critical component handling
- Start/stop lifecycle management

**CorrelationContextManager**:
- Root and child context creation
- Current context tracking
- Span lifecycle management (start/end)
- Automatic span tracking with `withSpan()`
- Trace querying by traceId
- UUID-based ID generation

### Test Coverage
- `MetricsCollector.test.ts` - 39 tests passing
- `HealthMonitor.test.ts` - 25 tests passing
- `CorrelationContextManager.test.ts` - 44 tests passing
- **Total**: 108 tests, 100% passing

---

## 6. Validation & Security

**Status**: ✅ Implemented

### Files

| Component | File | Purpose |
|-----------|------|---------|
| **Validators** | `src/utils/validators.ts` | Input validation utilities |
| **Rate Limiter** | `src/security/RateLimiter.ts` | Token bucket rate limiting |
| **Interfaces** | `src/security/interfaces.ts` | Security component contracts |
| **Module Index** | `src/security/index.ts` | Public API exports |

### Validators

Static methods in `Validators` class:
- `validateAddress()` - Ethereum address format with checksum
- `validateChainId()` - Chain ID against supported list
- `validateTxHash()` - Transaction hash format
- `validateBlockNumber()` - Block number validity
- `validatePagination()` - Page/pageSize bounds
- `validateTimeout()` - Timeout range checking
- `validateRpcUrl()` - RPC endpoint URL format
- `sanitizeString()` - Safe string sanitization
- `validateDateRange()` - Date range consistency

### Rate Limiter

Token bucket algorithm implementation:
- `acquire()` - Waits for token availability, throws `RateLimitError` if max wait exceeded
- `tryAcquire()` - Non-blocking token acquisition
- `execute<T>()` - Wraps async function execution with rate limiting
- `getAvailableTokens()` - Returns current token count

**Configuration**:
- `capacity` - Maximum tokens in bucket
- `refillRate` - Tokens added per second
- `maxWait` - Maximum wait time in milliseconds
- `name` - Optional limiter name for metrics/logging

**Implementation Highlights**:
- Token refill based on elapsed time
- Queue processing for waiting requests
- Timeout handling for max wait enforcement
- Automatic cleanup of completed requests

### Test Coverage
- `validators.test.ts` - 96% coverage
- `RateLimiter.test.ts` - 32 tests passing

---

## 7. Test Specifications

### Test Categories

#### Unit Tests (80% of test suite)
- Located alongside source files as `*.test.ts`
- Mock external dependencies (RPC, WebSocket)
- Use `vitest` with fake timers for time-based tests
- Target 85%+ coverage for core components

#### Integration Tests (15% of test suite)
- `src/resilience/integration.test.ts` - Example of resilience integration
- Services integration tests - **Missing**
- Cross-component behavior validation - **Needed**

#### Contract Tests (4% of test suite)
- `IChainAdapter` implementation validation - **Missing**
- Data model compliance - **Missing**
- Interface completeness checking - **Missing**

#### E2E Tests (1% of test suite)
- Complete user flows - **Missing**
- Real RPC interaction (testnet) - **Missing**
- WebSocket lifecycle - **Missing**

### Test Utilities

**`src/test-utils/index.ts`** - Mocks and helpers for testing

Provides:
- Mock adapter factories
- Mock balance/transaction generators
- Fake RPC client creation
- Timer and promise utilities

### Coverage Requirements

| Component Type | Target Coverage |
|----------------|-----------------|
| Utilities (errors, validators) | 95% |
| Core components (adapters) | 90% |
| Resilience components | 85% |
| Performance components | 85% |
| Services | 80% |
| Observability | 75% |

**Current Overall Coverage**: ~87% (Phases 1-5 only)

### Missing Test Specifications

**Integration Tests Needed**:
- BalanceService with full resilience stack
- TransactionService with cache invalidation
- Multi-chain tracking scenarios
- Error recovery workflows

**E2E Scenarios Needed**:
- Portfolio tracking from connection through updates
- Circuit breaker recovery flow
- Rate limit handling across services
- WebSocket reconnection handling

**Contract Tests Needed**:
- `IChainAdapter` implementation compliance
- Service constructor parameter validation
- Error type consistency across components

---

## Implementation Phases

### ✅ Completed (Phases 1-7)

**Week 1-2**: Foundation, resilience, performance layers
**Week 3-4**: Advanced resilience, services
**Week 5**: Initial service testing
**Week 6**: Observability implementation
**Week 7**: Security implementation

**Deliverables**:
- All error classes with comprehensive tests
- Complete resilience pattern library
- Performance optimization components
- Three production-ready services
- Complete observability system with metrics, health monitoring, and distributed tracing
- Token bucket rate limiter with comprehensive tests
- 140 total tests across observability and security, 100% passing
- 8,500+ lines of implementation code
- 89% test coverage

**Phase 6 - Observability** (Complete):
- [x] Implement `MetricsCollector` from `src/observability/interfaces.ts`
- [x] Implement `HealthMonitor` from `src/observability/interfaces.ts`
- [x] Implement `CorrelationContextManager` from `src/observability/interfaces.ts`
- [x] Unit tests for observability components (108 tests)
- [ ] Add metrics collection to all services (deferred to Phase 8)
- [ ] Create health check factories for adapters (deferred to Phase 8)

**Phase 7 - Security** (Complete):
- [x] Implement `RateLimiter` from `src/security/interfaces.ts`
- [x] Unit tests for RateLimiter (32 tests)
- [ ] Add rate limiting to service layer (deferred to Phase 8)
- [ ] Rate limit integration tests (deferred to Phase 8)

### ⏳ Pending (Phase 8)

**Phase 8 - Integration & E2E** (Est. 1 week):
- [ ] Service integration test suites
- [ ] Contract tests for `IChainAdapter` implementations
- [ ] E2E test scenarios with testnet
- [ ] Performance benchmarking
- [ ] Load testing

---

## Quality Gates

### Before Implementation (All Phases)
- [ ] Interface file exists with comprehensive JSDoc
- [ ] All method signatures defined with @param, @returns, @throws
- [ ] Test specification written
- [ ] Dependencies identified

### Before PR Submission
- [ ] All unit tests pass
- [ ] Code coverage ≥ target for component type
- [ ] No linting errors
- [ ] No type errors
- [ ] JSDoc complete for all public APIs
- [ ] Manual testing completed
- [ ] Integration tests added if cross-component

### PR Review Checklist
- [ ] Implementation matches JSDoc contract exactly
- [ ] Error handling comprehensive and typed
- [ ] Resource cleanup implemented (destroy methods)
- [ ] Tests cover edge cases and error paths
- [ ] Performance considerations addressed
- [ ] No regressions in existing tests

---

## Key Principles for Implementation

### 1. Follow the Contract
The JSDoc in interface files is **authoritative**. Implement exactly as specified:
- Parameter types and names must match
- Return types must match
- Documented errors must be thrown in specified conditions
- Default values must be respected

### 2. Type Safety First
- No `any` types except where explicitly documented
- Use strict TypeScript checking
- Leverage type guards for runtime validation
- Generic types where appropriate

### 3. Resource Management
All components with timers, intervals, or connections must:
- Implement `destroy()` method
- Clean up all resources
- Clear all timers/intervals
- Unsubscribe from all events

### 4. Immutability
- Return `Readonly<>` types from getters
- Use `Object.freeze()` for returned statistics
- Prevent external mutation of internal state

### 5. Error Handling
- All errors must extend `IntegrationError`
- Include meaningful context in errors
- Sanitize sensitive data from error context
- Document error conditions in JSDoc with @throws

---

## Dependencies

### Required External Packages
- **viem** - Ethereum interactions, types
- **isows** - WebSocket support for browser
- **@cygnus-wealth/data-models** - Unified type definitions

### Internal Dependencies
```
validators.ts (no deps)
  ↓
errors.ts (uses validators)
  ↓
resilience/* (uses errors)
  ↓
performance/* (uses errors, resilience)
  ↓
services/* (uses errors, resilience, performance, adapters)
  ↓
observability/* (uses all above)
```

---

## Implementation Order Recommendation

For **Phase 6** (Observability):
1. `MetricsCollector` - Foundation for metrics
2. Create `METRICS` constant definitions
3. Integrate metrics into existing services
4. `HealthMonitor` - System health checks
5. Create health check factories
6. `CorrelationContextManager` - Request tracing
7. Integrate tracing into service layer

For **Phase 7** (Security):
1. `RateLimiter` - Token bucket implementation
2. Integrate into service constructors
3. Add rate limit error handling to resilience patterns

For **Phase 8** (Testing):
1. Service integration tests
2. Contract tests for adapters
3. E2E scenarios with mock/testnet RPCs
4. Performance benchmarks

---

## Developer Quick Reference

### Starting New Component Implementation

1. **Read the interface file** with JSDoc contracts
2. **Check test specifications** in corresponding `.test.ts` file
3. **Identify dependencies** from imports and JSDoc
4. **Create implementation** matching JSDoc exactly
5. **Write tests** following test spec outline
6. **Verify coverage** meets targets for component type

### Working with Existing Components

1. **Read JSDoc** in the implementation file
2. **Check test file** for usage examples
3. **Review error handling** for expected exceptions
4. **Verify type exports** for what's publicly available

### Documentation is in the Code

- **Interfaces**: TypeScript interface files in `src/*/interfaces.ts`
- **Implementations**: Source files in `src/*/` with JSDoc
- **Contracts**: JSDoc comments (authoritative specification)
- **Examples**: Test files show expected usage
- **Architecture**: This file provides context and relationships

---

**END OF UNIT ARCHITECTURE**

**Document Purpose**: Reference guide to TypeScript interface files and implementation status
**Source of Truth**: JSDoc in actual `.ts` files
**For**: Software engineers implementing or extending the system
**Maintained By**: Domain architect (updated as interfaces change)

**Next Steps for Phase 6-8**:
1. Review interface files in `src/observability/interfaces.ts` and `src/security/interfaces.ts`
2. Implement classes matching the interface contracts
3. Write comprehensive unit tests
4. Add integration and E2E test scenarios
5. Update this document's status tables when complete
