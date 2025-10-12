# EVM Integration Unit Architecture Index

> **Navigation**: [Developer Guide](./DEVELOPERS.md) > [System Architecture](./ARCHITECTURE.md) > **Unit Architecture Index**
>
> **Document Type**: Navigation & Summary
> **Purpose**: Central index for all unit architecture documentation
> **Audience**: Software Engineers implementing the system
> **Status**: Complete and Ready for Implementation

---

## Document Overview

This unit architecture provides complete specifications for implementing the EVM Integration system following Domain-Driven Design principles. The architecture has been decomposed from system-level specifications into granular, implementable units with comprehensive test specifications.

### Architecture Documents Hierarchy

```
ARCHITECTURE.md                    (System Architecture - Reference)
    ↓
UNIT_ARCHITECTURE.md               (Part 1: Foundation & Core Components)
UNIT_ARCHITECTURE.md         (Part 2: Services, Observability, Security)
    ↓
Implementation Phase                (ddd-software-engineer)
```

---

## Quick Navigation

### Part 1: Foundation & Core Components ([UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md))

1. **Error Hierarchy** (Lines 30-450)
   - IntegrationError base class
   - ConnectionError, RateLimitError, ValidationError
   - DataError, CircuitBreakerError
   - ErrorUtils
   - 📝 Complete test specifications included

2. **Resilience Components** (Lines 451-1450)
   - **CircuitBreaker**: State machine for preventing cascading failures
   - **RetryPolicy**: Exponential backoff with jitter
   - **FallbackChain**: Multi-level fallback orchestration
   - **BulkheadManager**: Resource isolation with bulkheads
   - **TimeoutManager**: Hierarchical timeout management
   - 📝 Complete test specifications for each component

3. **Performance Components** (Lines 1451-2450)
   - **CacheManager**: Multi-layer caching (L1: Memory, L2: IndexedDB)
   - **BatchProcessor**: Time-windowed request batching
   - **RequestCoalescer**: Duplicate request deduplication
   - **ConnectionPool**: Connection lifecycle and health management
   - 📝 Complete test specifications for each component

### Part 2: Services, Observability & Security ([UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md))

4. **Service Layer** (Lines 30-1200)
   - **BalanceService**: Balance fetching with caching and batching
   - **TransactionService**: Transaction history with pagination
   - **TrackingService**: Multi-address monitoring across chains
   - 📝 Complete test specifications for each service

5. **Observability Components** (Lines 1201-2000)
   - **HealthMonitor**: System health aggregation and monitoring
   - **MetricsCollector**: Prometheus-compatible metrics collection
   - **CorrelationContext**: Distributed tracing support
   - 📝 Complete test specifications for each component

6. **Validation & Security** (Lines 2001-2400)
   - **Validators**: Input validation utilities
   - **RateLimiter**: Token bucket rate limiting
   - 📝 Complete test specifications included

7. **Test Specifications Summary** (Lines 2401-2800)
   - Test coverage requirements (80% minimum)
   - Test utilities and mocking strategy
   - Test naming conventions
   - CI/CD integration guidelines

8. **Implementation Guide** (Lines 2801-end)
   - Phase-by-phase implementation plan
   - Quality gates and checklists
   - Documentation requirements

---

## Component Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                         Error Hierarchy                          │
│                    (Foundation for all errors)                   │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Resilience Components                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │TimeoutManager│→ │CircuitBreaker│→ │   RetryPolicy        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐│
│  │FallbackChain │  │    BulkheadManager                       ││
│  └──────────────┘  └──────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Performance Components                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │CacheManager  │  │BatchProcessor│  │RequestCoalescer      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           ConnectionPool                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                         Service Layer                            │
│  ┌──────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ BalanceService   │  │TransactionSvc   │  │TrackingService│  │
│  │ (uses all above) │  │ (uses all above)│  │(orchestrates) │  │
│  └──────────────────┘  └─────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Observability & Security                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │HealthMonitor │  │MetricsCollect│  │CorrelationContext    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Validators & RateLimiter                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1) 🟢
**Priority**: Critical
**Dependencies**: None

- [ ] `src/utils/errors.ts` - Error hierarchy (450 lines)
- [ ] `src/utils/errors.test.ts` - Error tests
- [ ] `src/utils/validators.ts` - Input validation (200 lines)
- [ ] `src/utils/validators.test.ts` - Validator tests
- [ ] `src/test-utils/index.ts` - Test utilities

**Success Criteria**: All error types defined, all validators working, test utilities available

### Phase 2: Resilience Core (Week 2) 🟡
**Priority**: Critical
**Dependencies**: Phase 1 (Errors)

- [ ] `src/resilience/TimeoutManager.ts` (200 lines)
- [ ] `src/resilience/CircuitBreaker.ts` (300 lines)
- [ ] `src/resilience/RetryPolicy.ts` (250 lines)
- [ ] Corresponding test files for each

**Success Criteria**: All resilience patterns working, 85%+ test coverage

### Phase 3: Performance Core (Week 2-3) 🟡
**Priority**: High
**Dependencies**: Phase 1

- [ ] `src/performance/CacheManager.ts` (400 lines)
- [ ] `src/performance/RequestCoalescer.ts` (200 lines)
- [ ] `src/performance/BatchProcessor.ts` (300 lines)
- [ ] `src/performance/ConnectionPool.ts` (400 lines)
- [ ] Corresponding test files for each

**Success Criteria**: Cache hit ratio >70%, batching working, connection reuse implemented

### Phase 4: Advanced Resilience (Week 3) 🟡
**Priority**: High
**Dependencies**: Phase 2, Phase 3

- [ ] `src/resilience/FallbackChain.ts` (300 lines)
- [ ] `src/resilience/BulkheadManager.ts` (300 lines)
- [ ] Integration tests for resilience
- [ ] Corresponding test files

**Success Criteria**: Fallback strategies working, resource isolation verified

### Phase 5: Service Layer (Week 4) 🟢
**Priority**: Critical
**Dependencies**: Phase 2, Phase 3, Phase 4

- [ ] `src/services/BalanceService.ts` (500 lines)
- [ ] `src/services/TransactionService.ts` (400 lines)
- [ ] `src/services/TrackingService.ts` (400 lines)
- [ ] Integration tests for services
- [ ] Corresponding test files

**Success Criteria**: All services working end-to-end, integration tests passing

### Phase 6: Observability (Week 5) 🔵
**Priority**: Medium
**Dependencies**: Phase 5

- [ ] `src/observability/HealthMonitor.ts` (300 lines)
- [ ] `src/observability/MetricsCollector.ts` (400 lines)
- [ ] `src/observability/CorrelationContext.ts` (300 lines)
- [ ] Corresponding test files

**Success Criteria**: Health checks reporting, metrics being collected, tracing working

### Phase 7: Security (Week 5) 🟡
**Priority**: High
**Dependencies**: Phase 1

- [ ] `src/security/RateLimiter.ts` (200 lines)
- [ ] Additional validators
- [ ] Security tests

**Success Criteria**: Rate limiting enforced, all inputs validated

### Phase 8: Integration & Polish (Week 6) 🔵
**Priority**: Medium
**Dependencies**: All previous phases

- [ ] Contract tests
- [ ] E2E test scenarios
- [ ] Performance testing
- [ ] Documentation updates
- [ ] README examples

**Success Criteria**: 80%+ total coverage, all E2E scenarios passing, documentation complete

**Total Estimated Lines**: ~6,000 lines of implementation + ~4,000 lines of tests

---

## File Structure Reference

### Complete Directory Structure

```
src/
├── utils/
│   ├── errors.ts                    # Error hierarchy [REQUIRED: Phase 1]
│   ├── errors.test.ts
│   ├── validators.ts                # Input validators [REQUIRED: Phase 1]
│   ├── validators.test.ts
│   ├── mappers.ts                   # [EXISTS] - viem → data-models
│   └── mappers.test.ts
│
├── resilience/
│   ├── CircuitBreaker.ts            # [REQUIRED: Phase 2]
│   ├── CircuitBreaker.test.ts
│   ├── RetryPolicy.ts               # [REQUIRED: Phase 2]
│   ├── RetryPolicy.test.ts
│   ├── FallbackChain.ts             # [REQUIRED: Phase 4]
│   ├── FallbackChain.test.ts
│   ├── BulkheadManager.ts           # [REQUIRED: Phase 4]
│   ├── BulkheadManager.test.ts
│   ├── TimeoutManager.ts            # [REQUIRED: Phase 2]
│   └── TimeoutManager.test.ts
│
├── performance/
│   ├── CacheManager.ts              # [REQUIRED: Phase 3]
│   ├── CacheManager.test.ts
│   ├── BatchProcessor.ts            # [REQUIRED: Phase 3]
│   ├── BatchProcessor.test.ts
│   ├── RequestCoalescer.ts          # [REQUIRED: Phase 3]
│   ├── RequestCoalescer.test.ts
│   ├── ConnectionPool.ts            # [REQUIRED: Phase 3]
│   └── ConnectionPool.test.ts
│
├── services/
│   ├── BalanceService.ts            # [REQUIRED: Phase 5]
│   ├── BalanceService.test.ts
│   ├── TransactionService.ts        # [REQUIRED: Phase 5]
│   ├── TransactionService.test.ts
│   ├── TrackingService.ts           # [REQUIRED: Phase 5]
│   ├── TrackingService.test.ts
│   ├── ConnectionManager.ts         # [EXISTS] - may need updates
│   └── ConnectionManager.test.ts
│
├── observability/
│   ├── HealthMonitor.ts             # [REQUIRED: Phase 6]
│   ├── HealthMonitor.test.ts
│   ├── MetricsCollector.ts          # [REQUIRED: Phase 6]
│   ├── MetricsCollector.test.ts
│   ├── CorrelationContext.ts        # [REQUIRED: Phase 6]
│   └── CorrelationContext.test.ts
│
├── security/
│   ├── RateLimiter.ts               # [REQUIRED: Phase 7]
│   └── RateLimiter.test.ts
│
├── adapters/
│   ├── EvmChainAdapter.ts           # [EXISTS] - may need updates
│   └── base/
│       └── BaseChainAdapter.ts      # [OPTIONAL]
│
├── registry/
│   ├── ChainRegistry.ts             # [EXISTS] - may need updates
│   └── configs/
│       ├── ethereum.json
│       ├── polygon.json
│       ├── arbitrum.json
│       ├── optimism.json
│       └── base.json
│
├── types/
│   ├── IChainAdapter.ts             # [EXISTS]
│   ├── ChainConfig.ts               # [EXISTS]
│   ├── ServiceTypes.ts              # [NEW: Phase 5]
│   └── ResilienceTypes.ts           # [NEW: Phase 2]
│
├── test-utils/
│   └── index.ts                     # [REQUIRED: Phase 1]
│
└── index.ts                         # [EXISTS] - update exports
```

**Legend**:
- `[EXISTS]` - Already implemented
- `[REQUIRED: Phase X]` - Must be implemented in specified phase
- `[NEW: Phase X]` - New file to create in specified phase
- `[OPTIONAL]` - Nice to have but not critical

---

## Key Design Patterns Used

### Resilience Patterns
1. **Circuit Breaker**: Prevents cascading failures
2. **Retry with Exponential Backoff**: Handles transient failures
3. **Bulkhead**: Isolates resources to prevent total system failure
4. **Timeout**: Ensures operations don't hang indefinitely
5. **Fallback**: Provides degraded functionality when primary fails

### Performance Patterns
1. **Cache-Aside**: Multi-layer caching strategy
2. **Request Batching**: Combines multiple requests to reduce RPC calls
3. **Request Coalescing**: Deduplicates identical concurrent requests
4. **Connection Pooling**: Reuses connections for better performance
5. **Lazy Loading**: Initializes resources only when needed

### Architectural Patterns
1. **Repository Pattern**: IChainAdapter abstracts blockchain access
2. **Strategy Pattern**: Pluggable fallback strategies
3. **Observer Pattern**: Event-based subscription system
4. **Singleton Pattern**: ChainRegistry, CorrelationContext
5. **Factory Pattern**: Adapter creation, error factories

---

## Testing Strategy

### Unit Test Requirements
- **Coverage**: 80% minimum for each component
- **Isolation**: Mock all external dependencies
- **Speed**: All unit tests should complete in <5s
- **Determinism**: Use fake timers for time-based tests

### Integration Test Requirements
- **Scope**: Test component interactions
- **Mocking**: Mock RPC providers, use real components
- **Coverage**: Critical paths and error scenarios
- **Speed**: Complete in <30s

### E2E Test Requirements
- **Scope**: Complete user workflows
- **Environment**: Test against mock blockchain
- **Coverage**: Happy path + major error scenarios
- **Speed**: Complete in <2min

### Test Utilities
Located in `src/test-utils/index.ts`:
- Mock factories for all data types
- Test harness for adapters
- Fake timers utilities
- Assertion helpers

---

## Quality Standards

### Code Quality
- ✅ TypeScript strict mode enabled
- ✅ No `any` types (except where documented)
- ✅ All public APIs have JSDoc
- ✅ ESLint passing with no warnings
- ✅ Prettier formatting applied

### Error Handling
- ✅ All errors extend IntegrationError
- ✅ Errors include context for debugging
- ✅ Retriable vs non-retriable clearly marked
- ✅ User-friendly error messages

### Resource Management
- ✅ All components with timers implement `destroy()`
- ✅ Subscriptions return unsubscribe functions
- ✅ Connections properly closed on cleanup
- ✅ No memory leaks

### Security
- ✅ All inputs validated
- ✅ No sensitive data in logs
- ✅ Rate limiting enforced
- ✅ Read-only operations only

---

## Performance Targets (from System Architecture)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Balance fetch (cached) | < 500ms | P95 |
| Balance fetch (fresh) | < 2000ms | P95 |
| Transaction retrieval | < 1000ms | P95 |
| WebSocket latency | < 100ms | P95 |
| Cache hit ratio | > 70% | Average |
| Service reliability | > 99% | SLO |
| Error rate | < 1% | Average |
| Connection establishment | < 500ms | P95 |

---

## Common Implementation Questions

### Q: Should I implement L2 cache (IndexedDB) in Phase 3?
**A**: Start with L1 (memory) cache only. L2 can be added later as enhancement. The CacheManager interface supports it.

### Q: What test framework should I use?
**A**: Vitest (already configured in the project). Use `vi.fn()` for mocks, `vi.useFakeTimers()` for time.

### Q: How do I handle WebSocket connections in ConnectionPool?
**A**: ConnectionPool is generic. The ConnectionFactory interface handles creation. WebSocket-specific logic goes in factory implementation.

### Q: Should services instantiate their own resilience components?
**A**: Yes. Each service should create its own instances with service-specific configuration. This allows for fine-tuned behavior per service.

### Q: How do I test components that use viem?
**A**: Create mock implementations of viem's PublicClient. See `src/test-utils/index.ts` for mock factories.

### Q: When should I use CircuitBreaker vs RetryPolicy?
**A**: Use both! RetryPolicy handles transient failures with backoff. CircuitBreaker prevents wasting resources on persistent failures. Combine them for robust resilience.

---

## Communication with Other Agents

### Feedback Loop
If you discover issues with the **system architecture** during implementation:
1. Document the issue clearly
2. Propose a solution
3. Create a file: `UNIT_TO_SYSTEM_FEEDBACK.md`
4. The system architect will review and update if needed

### Integration Points
This unit architecture integrates with:
- **@cygnus-wealth/data-models**: External type definitions
- **viem**: Blockchain interaction library
- **isows**: WebSocket support

No changes to these dependencies are allowed without domain architect approval.

---

## Success Criteria

### Phase Completion Checklist
For each phase, verify:
- [ ] All specified files implemented
- [ ] All unit tests written and passing
- [ ] Code coverage meets target for phase
- [ ] JSDoc complete for public APIs
- [ ] No linting or type errors
- [ ] Integration tests passing (where applicable)
- [ ] Manual smoke testing completed

### Project Completion Checklist
- [ ] All 8 phases complete
- [ ] Overall test coverage ≥ 80%
- [ ] All E2E tests passing
- [ ] Performance targets met
- [ ] Documentation updated
- [ ] Security review passed
- [ ] Ready for production deployment

---

## Getting Help

### Reference Documents
1. **System Architecture**: `ARCHITECTURE.md` - High-level design decisions
2. **Domain Specification**: `../enterprise-arch/domains/integration/bounded-contexts/evm-integration.md`
3. **Data Models**: `@cygnus-wealth/data-models` package documentation

### Code Examples
Examples of usage can be found in:
- `examples/websocket-demo.tsx` - WebSocket subscriptions
- `examples/token-balances.tsx` - Token balance fetching
- Existing adapter implementations

### Common Issues
- **TypeScript errors with viem types**: Ensure viem version matches specification
- **Test timing issues**: Use fake timers and `advanceTimersAndFlush` utility
- **Mock complexity**: Start simple, add complexity as needed

---

## Document Status

**Current Status**: ✅ Complete and Reviewed

**Completeness**:
- Error Hierarchy: ✅ 100%
- Resilience Components: ✅ 100%
- Performance Components: ✅ 100%
- Service Layer: ✅ 100%
- Observability: ✅ 100%
- Validation & Security: ✅ 100%
- Test Specifications: ✅ 100%
- Implementation Guide: ✅ 100%

**Ready for Implementation**: ✅ Yes

---

## Quick Reference Card

### File Size Estimates
| Component | LOC | Test LOC | Total |
|-----------|-----|----------|-------|
| Errors | 450 | 200 | 650 |
| Validators | 200 | 150 | 350 |
| CircuitBreaker | 300 | 250 | 550 |
| RetryPolicy | 250 | 200 | 450 |
| FallbackChain | 300 | 200 | 500 |
| BulkheadManager | 300 | 200 | 500 |
| TimeoutManager | 200 | 150 | 350 |
| CacheManager | 400 | 300 | 700 |
| BatchProcessor | 300 | 250 | 550 |
| RequestCoalescer | 200 | 150 | 350 |
| ConnectionPool | 400 | 300 | 700 |
| BalanceService | 500 | 350 | 850 |
| TransactionService | 400 | 300 | 700 |
| TrackingService | 400 | 300 | 700 |
| HealthMonitor | 300 | 200 | 500 |
| MetricsCollector | 400 | 200 | 600 |
| CorrelationContext | 300 | 200 | 500 |
| RateLimiter | 200 | 150 | 350 |
| **Total** | **6,000** | **4,000** | **10,000** |

### Key Constants
```typescript
// From UNIT_ARCHITECTURE.md
const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  volumeThreshold: 10,
  rollingWindow: 60000
};

const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
  jitterFactor: 0.3
};

const TTL_STRATEGY = {
  TOKEN_METADATA: 86400,
  BALANCE: 60,
  TRANSACTION: 300,
  GAS_PRICE: 10
};
```

---

**Last Updated**: 2025-10-12
**Document Version**: 1.0
**Author**: Unit Architect (DDD)
**For**: Software Engineer (Implementation)
