# Developer Guide - EVM Integration

> **START HERE** if you're implementing features for this library
>
> **Last Updated**: 2025-10-12
> **Status**: Complete Architecture Documentation

---

## 🎯 Quick Start for Developers

### New to This Codebase?
**Read documents in this order:**

1. **This document** (DEVELOPERS.md) - You are here! ← START
2. **[README.md](./README.md)** - User-facing API and examples
3. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture overview
4. **[UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md)** - Detailed implementation specs
5. **Phase-specific docs** in [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) & [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md)

### Implementing New Features?
**Jump directly to:**
- **[UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md)** - Central navigation for all component specs
- Find your component in the index
- Follow links to detailed specifications

### Understanding the Big Picture?
**Start with:**
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design, patterns, and principles
- **[Enterprise Architecture](#enterprise--domain-architecture)** (optional) - Strategic context

---

## 📚 Complete Documentation Map

> **Visual Overview**: See [DOCUMENTATION_MAP.md](./DOCUMENTATION_MAP.md) for a visual guide to all documentation

### Documentation Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│  ENTERPRISE ARCHITECTURE (Strategic, Business Context)          │
│  Location: ../enterprise-arch/                                  │
│  Audience: Architects, Tech Leads                               │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  DOMAIN ARCHITECTURE (Integration Domain)                       │
│  Location: ../enterprise-arch/domains/integration/              │
│  Audience: Domain Architects, Senior Engineers                  │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  SYSTEM ARCHITECTURE (This Repository)                          │
│  📄 ARCHITECTURE.md                                             │
│  Audience: All Engineers                                        │
│  Content: System design, layers, patterns, dependencies         │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  UNIT ARCHITECTURE (Implementation Specs)                       │
│  📄 UNIT_ARCHITECTURE_INDEX.md    ← Navigation Hub             │
│  📄 UNIT_ARCHITECTURE.md          ← Complete Specifications        │
│  Audience: Implementing Engineers                               │
│  Content: Detailed class specs, tests, implementation guide    │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  IMPLEMENTATION (Your Code)                                     │
│  Location: src/                                                 │
│  Content: Actual TypeScript implementation                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📖 Document Reference Guide

### User-Facing Documentation

#### [README.md](./README.md)
- **Purpose**: User API documentation and examples
- **Audience**: Library users, not implementers
- **Content**: Installation, quick start, API reference
- **When to Read**: To understand how users will consume your code

#### [CLAUDE.md](./CLAUDE.md)
- **Purpose**: Project guidance for AI coding assistants
- **Content**: Tech stack, architecture overview, DDD agent selection
- **When to Read**: Understanding project conventions

---

### System Architecture Documentation

#### [ARCHITECTURE.md](./ARCHITECTURE.md) ⭐ **Key Document**
- **Purpose**: Complete system architecture specification
- **Sections**:
  - Core Design Principles
  - Layered Architecture (Presentation → Services → Adapters → Infrastructure)
  - Core Components (Registry, Adapters, Services)
  - Resilience Architecture (Circuit Breaker, Retry, Fallback, Bulkhead, Timeout)
  - Performance Architecture (Caching, Batching, Coalescing, Connection Pool)
  - Observability Architecture (Health, Metrics, Tracing)
  - Security Architecture (Read-only, Validation, Rate Limiting)
  - Error Handling Architecture
  - Data Flow Architecture
  - Testing Architecture
  - Performance Targets
  - Dependencies

- **When to Read**:
  - Before implementing any component
  - When making architectural decisions
  - When understanding component interactions

- **Key Sections for Developers**:
  - Lines 22-80: Layered Architecture (understand system structure)
  - Lines 82-128: Directory Structure (know where files go)
  - Lines 221-305: Resilience Patterns (understand error handling)
  - Lines 306-402: Performance Patterns (understand optimization)
  - Lines 729-850: Testing Strategy (understand test requirements)

---

### Unit Architecture Documentation (Implementation Specs)

#### [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) ⭐⭐ **Central Navigation**
- **Purpose**: Central hub for navigating all implementation specs
- **Sections**:
  - Quick Navigation (links to all components)
  - Component Dependency Graph
  - Implementation Roadmap (8 phases)
  - File Structure Reference
  - Key Design Patterns
  - Testing Strategy
  - Quality Standards
  - Common Implementation Questions
  - Quick Reference Card (LOC estimates)

- **When to Read**:
  - **Start here** for implementation work
  - When planning your work
  - When looking for a specific component spec
  - When you need the big picture of what to build

- **How to Use**:
  1. Find your component in the navigation section
  2. Note the phase it belongs to
  3. Check dependencies in the dependency graph
  4. Follow links to detailed specifications

---

#### [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Part 1
- **Purpose**: Detailed specifications for foundation and core components
- **Sections**:
  1. **Error Hierarchy** (Lines 30-450)
     - IntegrationError, ConnectionError, RateLimitError, ValidationError
     - ErrorUtils, factory methods
     - Complete test specifications

  2. **Resilience Components** (Lines 451-1450)
     - CircuitBreaker: State machine for failure prevention
     - RetryPolicy: Exponential backoff implementation
     - FallbackChain: Multi-level fallback orchestration
     - BulkheadManager: Resource isolation
     - TimeoutManager: Hierarchical timeouts
     - Complete test specifications for each

  3. **Performance Components** (Lines 1451-2450)
     - CacheManager: Multi-layer caching (L1: Memory, L2: IndexedDB)
     - BatchProcessor: Request batching
     - RequestCoalescer: Request deduplication
     - ConnectionPool: Connection lifecycle management
     - Complete test specifications for each

- **When to Read**:
  - **Phase 1**: Implementing error hierarchy
  - **Phase 2**: Implementing resilience components
  - **Phase 3**: Implementing performance components

- **How to Use**:
  - Copy TypeScript interfaces/classes as templates
  - Use JSDoc comments as implementation guide
  - Use test specifications to write tests
  - Follow implementation notes for constraints

---

#### [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Part 2
- **Purpose**: Detailed specifications for services, observability, and security
- **Sections**:
  1. **Service Layer** (Lines 30-1200)
     - BalanceService: Balance fetching with caching/batching
     - TransactionService: Transaction history with pagination
     - TrackingService: Multi-address monitoring
     - Complete test specifications for each

  2. **Observability Components** (Lines 1201-2000)
     - HealthMonitor: System health aggregation
     - MetricsCollector: Prometheus-compatible metrics
     - CorrelationContext: Distributed tracing
     - Complete test specifications for each

  3. **Validation & Security** (Lines 2001-2400)
     - Validators: Input validation utilities
     - RateLimiter: Token bucket rate limiting
     - Complete test specifications

  4. **Test Specifications Summary** (Lines 2401-2800)
     - Coverage requirements (80% minimum)
     - Test utilities and mocking strategy
     - Naming conventions
     - CI/CD integration

  5. **Implementation Guide** (Lines 2801-end)
     - 8-phase implementation plan
     - Quality gates
     - Documentation requirements

- **When to Read**:
  - **Phase 4**: Advanced resilience (FallbackChain, BulkheadManager)
  - **Phase 5**: Implementing service layer
  - **Phase 6**: Implementing observability
  - **Phase 7**: Implementing security components
  - **Phase 8**: Integration and testing

---

### Enterprise & Domain Architecture

#### Enterprise Architecture (Optional Reading)
- **Location**: `../enterprise-arch/`
- **Purpose**: Strategic business context, bounded contexts, domain decomposition
- **Audience**: Architects, senior engineers
- **When to Read**:
  - Understanding why architectural decisions were made
  - Integrating with other domains
  - Making cross-cutting architectural changes

**Key Documents** (if available in parent directory):
- `domains/integration/README.md` - Integration Domain overview
- `domains/integration/bounded-contexts/evm-integration.md` - Bounded context spec
- `domains/integration/patterns.md` - Domain-level patterns
- `domains/integration/resilience-performance.md` - Detailed resilience strategies

**Note**: These documents provide strategic context but are **not required** for implementation.

---

## 🗂️ File Organization

### Current Implementation Status

```
src/
├── ✅ adapters/
│   ├── ✅ EvmChainAdapter.ts       [EXISTS - working]
│   └── 🆕 base/
│       └── BaseChainAdapter.ts     [TO CREATE - optional]
│
├── ✅ registry/
│   ├── ✅ ChainRegistry.ts         [EXISTS - working]
│   └── ✅ configs/                 [EXISTS - 5 chains]
│
├── ✅ types/
│   ├── ✅ IChainAdapter.ts         [EXISTS]
│   ├── ✅ ChainConfig.ts           [EXISTS]
│   ├── ✅ index.ts                 [EXISTS]
│   ├── 🔨 ServiceTypes.ts          [TO CREATE - Phase 5]
│   └── 🔨 ResilienceTypes.ts       [TO CREATE - Phase 2]
│
├── ✅ utils/
│   ├── ✅ mappers.ts               [EXISTS - working]
│   ├── 🔨 errors.ts                [TO CREATE - Phase 1] ⭐
│   ├── 🔨 errors.test.ts           [TO CREATE - Phase 1] ⭐
│   ├── 🔨 validators.ts            [TO CREATE - Phase 1] ⭐
│   └── 🔨 validators.test.ts       [TO CREATE - Phase 1] ⭐
│
├── 🔨 resilience/                  [NEW DIRECTORY - Phase 2-4]
│   ├── CircuitBreaker.ts
│   ├── CircuitBreaker.test.ts
│   ├── RetryPolicy.ts
│   ├── RetryPolicy.test.ts
│   ├── FallbackChain.ts
│   ├── FallbackChain.test.ts
│   ├── BulkheadManager.ts
│   ├── BulkheadManager.test.ts
│   ├── TimeoutManager.ts
│   └── TimeoutManager.test.ts
│
├── 🔨 performance/                 [NEW DIRECTORY - Phase 3]
│   ├── CacheManager.ts
│   ├── CacheManager.test.ts
│   ├── BatchProcessor.ts
│   ├── BatchProcessor.test.ts
│   ├── RequestCoalescer.ts
│   ├── RequestCoalescer.test.ts
│   ├── ConnectionPool.ts
│   └── ConnectionPool.test.ts
│
├── 🔨 services/                    [NEW DIRECTORY - Phase 5]
│   ├── BalanceService.ts
│   ├── BalanceService.test.ts
│   ├── TransactionService.ts
│   ├── TransactionService.test.ts
│   ├── TrackingService.ts
│   └── TrackingService.test.ts
│
├── 🔨 observability/               [NEW DIRECTORY - Phase 6]
│   ├── HealthMonitor.ts
│   ├── HealthMonitor.test.ts
│   ├── MetricsCollector.ts
│   ├── MetricsCollector.test.ts
│   ├── CorrelationContext.ts
│   └── CorrelationContext.test.ts
│
├── 🔨 security/                    [NEW DIRECTORY - Phase 7]
│   ├── RateLimiter.ts
│   └── RateLimiter.test.ts
│
├── 🔨 test-utils/                  [NEW DIRECTORY - Phase 1]
│   └── index.ts
│
└── ✅ index.ts                     [EXISTS - will need updates]
```

**Legend**:
- ✅ **EXISTS**: Already implemented and working
- 🔨 **TO CREATE**: Needs to be implemented
- 🆕 **NEW DIRECTORY**: Entire directory needs to be created
- ⭐ **START HERE**: Begin with these files (Phase 1)

---

## 🛣️ Implementation Roadmap

### Recommended Reading Path by Phase

#### **Phase 1: Foundation** (Week 1) 🟢 START HERE
**Goal**: Build error handling and validation foundation

**📖 Read**:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Section "Error Handling Architecture" (lines 534-586)
2. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 1 "Error Hierarchy" (lines 30-450)
3. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Start of Section 6 for validators (referenced in Part 2)
4. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 6.1 "Input Validators" (lines 2001-2100)

**🔨 Implement**:
- `src/utils/errors.ts` (450 LOC)
- `src/utils/errors.test.ts` (200 LOC)
- `src/utils/validators.ts` (200 LOC)
- `src/utils/validators.test.ts` (150 LOC)
- `src/test-utils/index.ts` (100 LOC)

**✅ Success Criteria**:
- All error types compile and work
- Error serialization works
- All validators throw correct errors
- Test utilities available for other phases

---

#### **Phase 2: Resilience Core** (Week 2) 🟡
**Goal**: Implement core resilience patterns

**📖 Read**:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Section "Resilience Architecture" (lines 221-305)
2. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 2.1 "Circuit Breaker" (lines ~451-650)
3. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 2.2 "Retry Policy" (lines ~651-850)
4. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 2.5 "Timeout Manager" (lines ~1251-1450)

**🔨 Implement**:
- `src/resilience/TimeoutManager.ts` (200 LOC)
- `src/resilience/CircuitBreaker.ts` (300 LOC)
- `src/resilience/RetryPolicy.ts` (250 LOC)
- Corresponding test files

**Dependencies**: Phase 1 (errors)

---

#### **Phase 3: Performance Core** (Week 2-3) 🟡
**Goal**: Implement caching and optimization

**📖 Read**:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Section "Performance Architecture" (lines 306-402)
2. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 3.1 "Cache Manager" (lines ~1451-1700)
3. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 3.2 "Batch Processor" (lines ~1701-1950)
4. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 3.3 "Request Coalescer" (lines ~1951-2150)
5. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 3.4 "Connection Pool" (lines ~2151-2450)

**🔨 Implement**:
- `src/performance/CacheManager.ts` (400 LOC)
- `src/performance/RequestCoalescer.ts` (200 LOC)
- `src/performance/BatchProcessor.ts` (300 LOC)
- `src/performance/ConnectionPool.ts` (400 LOC)
- Corresponding test files

**Dependencies**: Phase 1 (errors)

---

#### **Phase 4: Advanced Resilience** (Week 3) 🟡
**Goal**: Complete resilience patterns

**📖 Read**:
1. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 2.3 "Fallback Chain" (lines ~851-1050)
2. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 2.4 "Bulkhead Manager" (lines ~1051-1250)

**🔨 Implement**:
- `src/resilience/FallbackChain.ts` (300 LOC)
- `src/resilience/BulkheadManager.ts` (300 LOC)
- Integration tests for resilience

**Dependencies**: Phase 2, Phase 3

---

#### **Phase 5: Service Layer** (Week 4) 🟢
**Goal**: Build core business logic services

**📖 Read**:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Section "Service Layer" (lines 186-220)
2. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 4.1 "Balance Service" (lines 30-400)
3. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 4.2 "Transaction Service" (lines 401-800)
4. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 4.3 "Tracking Service" (lines 801-1200)

**🔨 Implement**:
- `src/services/BalanceService.ts` (500 LOC)
- `src/services/TransactionService.ts` (400 LOC)
- `src/services/TrackingService.ts` (400 LOC)
- Integration tests
- Update `src/index.ts` to export services

**Dependencies**: Phase 2, Phase 3, Phase 4

---

#### **Phase 6: Observability** (Week 5) 🔵
**Goal**: Add monitoring and metrics

**📖 Read**:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Section "Observability Architecture" (lines 403-462)
2. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 5 "Observability Components" (lines 1201-2000)

**🔨 Implement**:
- `src/observability/HealthMonitor.ts` (300 LOC)
- `src/observability/MetricsCollector.ts` (400 LOC)
- `src/observability/CorrelationContext.ts` (300 LOC)
- Corresponding test files

**Dependencies**: Phase 5

---

#### **Phase 7: Security** (Week 5) 🟡
**Goal**: Enforce rate limits and validation

**📖 Read**:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Section "Security Architecture" (lines 464-533)
2. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 6.2 "Rate Limiter" (lines 2101-2250)

**🔨 Implement**:
- `src/security/RateLimiter.ts` (200 LOC)
- Additional validators if needed
- Security tests

**Dependencies**: Phase 1

---

#### **Phase 8: Integration & Polish** (Week 6) 🔵
**Goal**: Complete testing and documentation

**📖 Read**:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Section "Testing Architecture" (lines 729-791)
2. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 7 "Test Specifications Summary" (lines 2401-2800)
3. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Section 8 "Implementation Guide" (lines 2801-end)

**🔨 Implement**:
- Contract tests
- E2E test scenarios
- Performance testing
- Update README.md with new features
- Add usage examples

**Dependencies**: All previous phases

---

## 🧭 Quick Navigation Cheat Sheet

### "I need to understand..."

| What | Where to Look |
|------|---------------|
| **Overall system design** | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **How to implement component X** | [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) → Find component → Follow link |
| **Test strategy** | [ARCHITECTURE.md](./ARCHITECTURE.md) lines 729-791 + [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 7 |
| **Error handling** | [ARCHITECTURE.md](./ARCHITECTURE.md) lines 534-586 + [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 1 |
| **Resilience patterns** | [ARCHITECTURE.md](./ARCHITECTURE.md) lines 221-305 + [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 2 |
| **Performance optimization** | [ARCHITECTURE.md](./ARCHITECTURE.md) lines 306-402 + [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 3 |
| **Service design** | [ARCHITECTURE.md](./ARCHITECTURE.md) lines 186-220 + [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 4 |
| **File structure** | [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) + This document |
| **What to build next** | [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) → Implementation Roadmap |
| **How users consume API** | [README.md](./README.md) |

### "I'm starting Phase X..."

| Phase | Primary Document | Supporting Docs |
|-------|-----------------|-----------------|
| **Phase 1** | [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 1 | [ARCHITECTURE.md](./ARCHITECTURE.md) Error section |
| **Phase 2** | [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 2 (2.1, 2.2, 2.5) | [ARCHITECTURE.md](./ARCHITECTURE.md) Resilience section |
| **Phase 3** | [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 3 | [ARCHITECTURE.md](./ARCHITECTURE.md) Performance section |
| **Phase 4** | [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 2 (2.3, 2.4) | Integration test specs |
| **Phase 5** | [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 4 | [ARCHITECTURE.md](./ARCHITECTURE.md) Service section |
| **Phase 6** | [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 5 | [ARCHITECTURE.md](./ARCHITECTURE.md) Observability section |
| **Phase 7** | [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 6 | [ARCHITECTURE.md](./ARCHITECTURE.md) Security section |
| **Phase 8** | [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Sections 7-8 | All E2E requirements |

---

## 🎓 Development Workflow

### Before Writing Any Code

1. **Read** [ARCHITECTURE.md](./ARCHITECTURE.md) - Understand the system
2. **Navigate** to [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) - Find your component
3. **Read** the detailed specification in [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) or [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md)
4. **Check** dependencies in the dependency graph
5. **Review** existing code in `src/` that you'll integrate with

### While Implementing

1. **Follow** the TypeScript interfaces exactly as specified
2. **Copy** JSDoc comments from specs to your code
3. **Write tests** alongside implementation (TDD)
4. **Use** the test specifications from the unit architecture
5. **Run** `npm test` frequently

### Before Submitting PR

1. **Verify** all tests pass: `npm test`
2. **Check** coverage: Should be ≥ 80%
3. **Lint** your code: `npm run lint` (if configured)
4. **Build** successfully: `npm run build`
5. **Review** quality gates in [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md)

---

## 🔗 External Dependencies

### Required Reading for Integration

1. **@cygnus-wealth/data-models** (External Package)
   - All public APIs must return types from this package
   - Read package documentation for `Balance`, `Transaction`, `Asset` types
   - Do NOT create custom types for external-facing APIs

2. **viem Documentation** (External Library)
   - Primary blockchain interaction library
   - Read docs: https://viem.sh
   - Used for `PublicClient`, `Address`, blockchain calls

3. **isows** (External Library)
   - WebSocket support (browser + Node.js compatible)
   - Minimal API, mostly transparent

---

## ❓ FAQ for Developers

### Q: Where do I start?
**A**: Right here! Follow Phase 1 in the roadmap above.

### Q: Can I skip the architecture documents?
**A**: No. You'll miss critical context and make wrong assumptions. At minimum read [ARCHITECTURE.md](./ARCHITECTURE.md) and the relevant sections of [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) for your phase.

### Q: The specs are very detailed. Can I deviate?
**A**: Minor deviations for practical reasons are OK, but document them. Major deviations require discussing with the architect.

### Q: What if I find an issue in the architecture?
**A**: Create `UNIT_TO_SYSTEM_FEEDBACK.md` documenting the issue and your proposed solution.

### Q: Which test framework?
**A**: Vitest (already configured). See existing tests for examples.

### Q: How do I mock viem?
**A**: Use the mock utilities in `src/test-utils/index.ts` (create this in Phase 1).

### Q: Do I implement L2 cache (IndexedDB) now?
**A**: No, start with L1 (memory) only. The interface supports L2 for future enhancement.

### Q: How do I handle WebSocket connections in ConnectionPool?
**A**: ConnectionPool is generic. Create a WebSocket-specific factory that implements the `ConnectionFactory` interface.

### Q: Should services create their own resilience instances?
**A**: Yes. Each service instantiates its own CircuitBreaker, RetryPolicy, etc. with service-specific config.

### Q: What if the specs don't match existing code?
**A**: The specs represent the target architecture. Update existing code to match specs during your phase.

---

## 🎯 Success Criteria

### You're Ready to Start When:
- ✅ You've read this entire document
- ✅ You understand the documentation hierarchy
- ✅ You've read [ARCHITECTURE.md](./ARCHITECTURE.md)
- ✅ You've bookmarked [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md)
- ✅ You know which phase you're starting with

### Your Implementation is Complete When:
- ✅ All specs from your phase are implemented
- ✅ All tests pass with ≥80% coverage
- ✅ No TypeScript or linting errors
- ✅ JSDoc is complete for public APIs
- ✅ Integration tests pass (if applicable)
- ✅ Manual smoke testing successful

### The Entire Project is Complete When:
- ✅ All 8 phases implemented
- ✅ Overall coverage ≥80%
- ✅ All E2E tests passing
- ✅ Performance targets met (see [ARCHITECTURE.md](./ARCHITECTURE.md))
- ✅ Documentation updated
- ✅ Ready for npm publish

---

## 📞 Getting Help

### Documentation Issues
- **Missing information**: Check if it exists in a different document using the navigation above
- **Unclear specs**: Reference multiple documents (system + unit architecture)
- **Contradictions**: System architecture ([ARCHITECTURE.md](./ARCHITECTURE.md)) is authoritative

### Technical Issues
- **TypeScript errors**: Ensure viem version matches package.json
- **Test timing issues**: Use fake timers (`vi.useFakeTimers()`)
- **Mock complexity**: Start simple, add complexity incrementally

### Architecture Questions
- **Why was this designed this way?**: Read [ARCHITECTURE.md](./ARCHITECTURE.md) design principles and patterns
- **Can I change this?**: Document in `UNIT_TO_SYSTEM_FEEDBACK.md`
- **How does X integrate with Y?**: Check dependency graph in [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md)

---

## 📋 Quick Checklist

```markdown
- [ ] Read DEVELOPERS.md (this document)
- [ ] Understand documentation hierarchy
- [ ] Read ARCHITECTURE.md
- [ ] Bookmark UNIT_ARCHITECTURE_INDEX.md
- [ ] Identify current phase
- [ ] Read phase-specific sections
- [ ] Set up development environment
- [ ] Run npm install
- [ ] Run npm test (should pass existing tests)
- [ ] Start Phase 1 implementation
```

---

## 📝 Document Maintenance

**Last Updated**: 2025-10-12
**Maintained By**: Project Architects
**Update Frequency**: After each architecture review or major refactor

**Changelog**:
- 2025-10-12: Initial creation with complete unit architecture reference

---

**🚀 Ready to code? Start with Phase 1!**

**➡️ Next Step**: Read [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 1 (Error Hierarchy)
