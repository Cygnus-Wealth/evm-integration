# EVM Integration System Architecture

> **Navigation**: [Integration Domain](../enterprise-arch/domains/integration/README.md) > [EVM Integration Bounded Context](../enterprise-arch/domains/integration/bounded-contexts/evm-integration.md) > **System Architecture**
>
> **For Developers**: 📖 [Start Here](./DEVELOPERS.md) | 🔨 [Unit Architecture](./UNIT_ARCHITECTURE_INDEX.md) | 📚 [README](./README.md)

## Overview

The EVM Integration system is a TypeScript library providing standardized, resilient, read-only access to EVM-compatible blockchains. It implements the EVM Integration bounded context within the Integration Domain, adhering to all domain-level patterns and principles.

**System Purpose**: Transform blockchain data from heterogeneous RPC providers into the unified `@cygnus-wealth/data-models` format while ensuring reliability, performance, and security.

## Core Design Principles

1. **Read-Only Operations**: No transaction signing, wallet management, or private key handling
2. **Standardized Output**: All public interfaces return `@cygnus-wealth/data-models` types
3. **Multi-Chain Support**: Single codebase supporting all EVM-compatible chains
4. **Framework Agnostic**: Core library independent of UI frameworks
5. **Resilience by Design**: Assume external services will fail, design for continuous operation
6. **Performance Optimized**: Multi-layer caching, request batching, connection pooling
7. **Observable**: Built-in health monitoring, metrics, and distributed tracing

## System Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Presentation Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ React Hooks  │  │  Vue Composables│  │ Direct API  │      │
│  │ (optional)   │  │   (optional)    │  │   Access    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Balance Service │ Transaction Service │ Tracking   │     │
│  │ - Batch queries │ - Pagination        │ Service    │     │
│  │ - Cache mgmt    │ - Filtering         │ - Multi-   │     │
│  │ - Aggregation   │ - Pending tx        │   address  │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   Adapter Layer                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │              IChainAdapter Interface              │       │
│  │  getBalance() | getTokenBalances() | getTxs()    │       │
│  └──────────────────────────────────────────────────┘       │
│                           │                                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │             EvmChainAdapter                       │       │
│  │  - Implements IChainAdapter for EVM chains       │       │
│  │  - Uses viem for blockchain interaction          │       │
│  │  - Maps viem responses to data-models            │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Anti-Corruption Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Adapter    │→ │  Translator  │→ │  Validator   │      │
│  │ (HTTP/WS)    │  │ (viem → data │  │ (Schema &    │      │
│  │              │  │  -models)    │  │  Rules)      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Cross-Cutting Concerns                          │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Resilience  │ Performance │ Observability  │ Security│    │
│  │ - Circuit   │ - Caching   │ - Health Checks│ - Input │    │
│  │   Breaker   │ - Batching  │ - Metrics      │   Valid │    │
│  │ - Retry     │ - Pooling   │ - Tracing      │ - Rate  │    │
│  │ - Fallback  │ - Dedupe    │ - Logging      │   Limit │    │
│  └──────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
                           ↓
                   External RPC Providers
```

## Directory Structure

```
src/
├── adapters/              # Chain adapter implementations
│   ├── EvmChainAdapter.ts # EVM chain adapter with resilience
│   └── base/
│       └── BaseChainAdapter.ts  # Shared adapter patterns
├── services/              # Domain services layer
│   ├── BalanceService.ts  # Balance fetching with batching
│   ├── TransactionService.ts  # Transaction history with pagination
│   └── TrackingService.ts # Address tracking management
├── registry/              # Chain configuration management
│   ├── ChainRegistry.ts   # Singleton registry pattern
│   └── configs/           # JSON configuration per chain
│       ├── ethereum.json
│       ├── polygon.json
│       └── ...
├── resilience/            # Resilience patterns
│   ├── CircuitBreaker.ts  # Circuit breaker implementation
│   ├── RetryPolicy.ts     # Retry with exponential backoff
│   ├── FallbackChain.ts   # Fallback strategy orchestration
│   ├── BulkheadManager.ts # Resource isolation
│   └── TimeoutManager.ts  # Timeout hierarchy
├── performance/           # Performance optimization
│   ├── CacheManager.ts    # Multi-layer cache orchestration
│   ├── BatchProcessor.ts  # Request batching
│   ├── RequestCoalescer.ts # Request deduplication
│   └── ConnectionPool.ts  # Connection pooling
├── observability/         # Monitoring and metrics
│   ├── HealthMonitor.ts   # Health check aggregation
│   ├── MetricsCollector.ts # Performance metrics
│   └── CorrelationContext.ts # Distributed tracing
├── providers/             # Connection providers
│   ├── HttpProvider.ts    # HTTP RPC provider
│   └── WebSocketProvider.ts # WebSocket provider
├── types/                 # TypeScript interfaces
│   ├── IChainAdapter.ts   # Adapter contract
│   ├── ChainConfig.ts     # Configuration types
│   ├── ServiceTypes.ts    # Service layer types
│   └── ResilienceTypes.ts # Resilience pattern types
├── utils/                 # Utilities
│   ├── mappers.ts         # viem → data-models transformation
│   ├── validators.ts      # Input validation
│   └── errors.ts          # Error hierarchy
└── index.ts               # Public API exports
```

## Core Components

### 1. Chain Registry

**Purpose**: Centralized management of chain configurations and adapter lifecycle.

**Pattern**: Singleton with lazy initialization

**Responsibilities**:
- Load and validate chain configurations from JSON
- Create and cache adapter instances per chain
- Provide runtime configuration updates
- Manage adapter health status

**Key Methods**:
```typescript
class ChainRegistry {
  getAdapter(chainId: number): IChainAdapter
  registerChain(config: ChainConfig): void
  getAllChains(): ChainInfo[]
  getHealthStatus(): Map<number, HealthStatus>
}
```

### 2. IChainAdapter Interface

**Purpose**: Define the contract for all blockchain data access.

**Pattern**: Interface Segregation, Adapter Pattern

**Contract**:
```typescript
interface IChainAdapter {
  // Data Access (returns data-models types)
  getBalance(address: Address): Promise<Balance>
  getTokenBalances(address: Address, tokens?: TokenConfig[]): Promise<Balance[]>
  getTransactions(address: Address, options?: TransactionOptions): Promise<Transaction[]>

  // Real-time Features
  subscribeToBalance(
    address: Address,
    callback: (balance: Balance) => void
  ): Promise<Unsubscribe>

  // Connection Management
  connect(): Promise<void>
  disconnect(): void

  // Observability
  getChainInfo(): ChainInfo
  isHealthy(): Promise<boolean>
}
```

### 3. Service Layer

#### Balance Service
**Responsibilities**:
- Fetch native and token balances
- Support batch queries for multiple addresses/tokens
- Manage cache with configurable TTL
- Aggregate multi-chain balances

**Patterns**:
- Request Batching
- Cache-Aside
- Scatter-Gather

#### Transaction Service
**Responsibilities**:
- Retrieve transaction history with pagination
- Support filtering by type, status, date range
- Monitor pending transactions
- Transform chain-specific transaction data

**Patterns**:
- Pagination
- Filtering Strategy
- Data Transformation

#### Tracking Service
**Responsibilities**:
- Add/remove addresses to monitor
- Configure per-address settings (polling interval, chains)
- Track across multiple chains simultaneously
- Coordinate multi-address queries

**Patterns**:
- Observer
- Configuration Management

## Resilience Architecture

### Circuit Breaker Pattern

**Purpose**: Prevent cascading failures by failing fast when RPC providers are degraded.

**Implementation**:
```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  private failureThreshold: number = 5
  private successThreshold: number = 3
  private timeout: number = 30000  // 30s

  async execute<T>(operation: () => Promise<T>): Promise<T>
  private transitionToOpen(): void
  private transitionToHalfOpen(): void
  private transitionToClosed(): void
}
```

**Configuration Per Chain**:
- Failure threshold: 5 failures in 60 seconds
- Success threshold: 3 consecutive successes to close
- Open timeout: 30 seconds before attempting half-open
- Volume threshold: Minimum 10 requests for statistics

### Retry with Exponential Backoff

**Purpose**: Handle transient failures gracefully without overwhelming failing services.

**Formula**: `delay = min(baseDelay * (2 ^ attempt) + jitter, maxDelay)`

**Configuration**:
```typescript
interface RetryConfig {
  maxAttempts: 3
  baseDelay: 1000      // 1 second
  maxDelay: 30000      // 30 seconds
  multiplier: 2
  jitterFactor: 0.3
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 429]
}
```

### Fallback Chain Strategy

**Purpose**: Provide degraded service through multiple fallback layers.

**Chain Structure**:
```
1. Primary RPC Provider (fastest, paid)
   ↓ (on failure)
2. Secondary RPC Provider (backup, paid)
   ↓ (on failure)
3. Tertiary RPC Provider (public, free)
   ↓ (on failure)
4. Cached Data (last known good)
   ↓ (no cache available)
5. Offline Mode (user notification)
```

**Selection Logic**:
- Priority-based: WebSocket > HTTP
- Health-based: Skip unhealthy endpoints
- Performance-based: Weighted round-robin by latency

### Bulkhead Pattern

**Purpose**: Isolate failures by partitioning resources.

**Resource Pools**:
- Critical operations: 10 concurrent, 50 queue, 5s timeout
- Standard operations: 20 concurrent, 100 queue, 10s timeout
- Background operations: 5 concurrent, 200 queue, 30s timeout

### Timeout Management

**Hierarchy**:
- Connection timeout: 5 seconds (establishing connection)
- Request timeout: 10 seconds (single RPC call)
- Operation timeout: 30 seconds (complex operations)
- Global timeout: 60 seconds (absolute maximum)

## Performance Architecture

### Multi-Layer Caching Strategy

**Purpose**: Minimize latency and reduce RPC calls while maintaining data freshness.

**Cache Layers**:

#### L1: Memory Cache (Hot)
- Implementation: LRU Map
- Latency: < 1ms
- Capacity: 1000 entries
- Use case: Frequently accessed balances

#### L2: IndexedDB (Warm)
- Implementation: Browser IndexedDB
- Latency: 5-10ms
- Capacity: 50MB
- Use case: Session persistence, offline support

#### L3: Network with Cache (Cold)
- Implementation: Service Worker cache
- Latency: 50-100ms
- Use case: CDN-cached static data (token metadata)

**TTL Strategy**:
```typescript
const TTL_STRATEGY = {
  // Static data
  'token-metadata': 86400,    // 24 hours
  'contract-abi': 604800,     // 7 days

  // Semi-dynamic data
  'balance': 60,              // 1 minute
  'transaction': 300,         // 5 minutes

  // Dynamic data
  'gas-price': 10,            // 10 seconds
  'exchange-rate': 30,        // 30 seconds

  // User-specific
  'portfolio': 120,           // 2 minutes
}
```

**Cache Invalidation**:
- Time-based: TTL expiration
- Event-based: On new block
- Manual: User-triggered refresh

### Request Batching

**Purpose**: Reduce RPC calls by combining multiple requests.

**Batching Windows**:
- Time window: 50ms
- Max batch size: 50 requests
- Automatic flush: On window close or size limit

**Pattern**:
```typescript
class BatchProcessor<T, R> {
  private queue: Request<T>[] = []
  private timer: NodeJS.Timeout

  async add(request: T): Promise<R>
  private async flush(): Promise<void>
}
```

### Request Coalescing

**Purpose**: Deduplicate identical concurrent requests.

**Pattern**:
```typescript
class RequestCoalescer {
  private pending = new Map<string, Promise<any>>()

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T>
}
```

**Key Generation**: `${method}:${chainId}:${address}:${hash(params)}`

### Connection Pool Management

**Purpose**: Efficiently manage RPC connections with reuse and health checking.

**Pool Configuration**:
- Minimum connections: 2 per chain
- Maximum connections: 10 per chain
- Idle timeout: 30 seconds
- Connection timeout: 5 seconds
- Health check interval: 60 seconds

**Strategies**:
- LIFO (Last In First Out) for primary provider (warm connections)
- FIFO (First In First Out) for backup provider (fair distribution)

## Observability Architecture

### Health Monitoring

**Purpose**: Continuous assessment of system and integration health.

**Health Checks**:
- RPC endpoint connectivity
- Circuit breaker status
- Cache hit rate
- Response time percentiles
- Error rate

**Health States**:
- `HEALTHY`: All checks passing
- `DEGRADED`: Some non-critical checks failing
- `UNHEALTHY`: Critical checks failing

**Implementation**:
```typescript
class HealthMonitor {
  async runHealthChecks(): Promise<SystemHealth>
  registerCheck(check: HealthCheck): void
  getStatus(component: string): HealthStatus
}
```

### Metrics Collection

**Purpose**: Track performance and usage patterns.

**Key Metrics**:
- Latency: P50, P95, P99 response times
- Throughput: Requests per second
- Error rate: Failed requests percentage
- Cache hit ratio: L1/L2/L3 hit rates
- Circuit breaker transitions: Open/close events

**Metric Types**:
- Counters: Total requests, errors
- Gauges: Active connections, queue size
- Histograms: Response time distribution
- Summaries: Request duration quantiles

### Distributed Tracing

**Purpose**: Track request flow across system components.

**Implementation**:
- Correlation ID propagation
- Span creation for major operations
- Context preservation across async boundaries

**Traced Operations**:
- RPC calls
- Cache operations
- Retry attempts
- Circuit breaker state changes

## Security Architecture

### Read-Only Guarantee

**Implementation Layers**:

1. **Code-Level Protection**:
   - No transaction signing methods in interfaces
   - ESLint rules blocking dangerous patterns
   - Type system prevents write operations

2. **Runtime Protection**:
   - Block dangerous RPC methods (`eth_sendTransaction`, `eth_sign`, etc.)
   - Validation of method whitelist

3. **Audit**:
   - Automated security scans
   - Manual code reviews for all PRs
   - Security checklist enforcement

### Input Validation

**Validation Layers**:

1. **Address Validation**:
   - Format verification (0x + 40 hex chars)
   - Checksum validation (EIP-55)
   - Chain-specific rules

2. **Parameter Validation**:
   - Type checking
   - Range validation
   - Sanitization of user inputs

3. **Configuration Validation**:
   - Schema validation for chain configs
   - RPC URL format validation
   - Timeout value bounds

### Rate Limiting

**Purpose**: Respect RPC provider limits and prevent abuse.

**Algorithm**: Token Bucket

**Configuration**:
```typescript
interface RateLimitConfig {
  capacity: number        // Max tokens
  refillRate: number     // Tokens per second
  maxWait: number        // Max wait time for token
}
```

**Per-Provider Limits**:
- Infura: 100 requests/second
- Alchemy: 330 requests/second
- Public RPCs: 10 requests/second

### Data Sanitization

**Purpose**: Clean all external data before processing.

**Sanitization Rules**:
- Remove script tags and event handlers
- Validate and normalize numeric values
- Escape special characters
- Filter dangerous object keys

## Error Handling Architecture

### Error Hierarchy

```typescript
class IntegrationError extends Error {
  code: string
  retriable: boolean
  context: any
}

class ConnectionError extends IntegrationError {
  retriable = true
}

class RateLimitError extends IntegrationError {
  retriable = true
  resetAt: number
}

class ValidationError extends IntegrationError {
  retriable = false
}

class DataError extends IntegrationError {
  retriable = false
}
```

### Error Recovery Strategies

**Retriable Errors**:
1. Check circuit breaker state
2. Apply retry with exponential backoff
3. Attempt fallback provider
4. Return cached data if available

**Non-Retriable Errors**:
1. Log error with context
2. Return cached data if available
3. Return safe default value
4. Propagate to caller with user-friendly message

### Common Error Scenarios

| Scenario | Error Type | Recovery Strategy |
|----------|-----------|-------------------|
| RPC connection failure | ConnectionError | Failover to backup endpoint |
| Rate limit exceeded | RateLimitError | Exponential backoff, wait for reset |
| Invalid address | ValidationError | Immediate rejection, no retry |
| Network timeout | ConnectionError | Retry with backoff |
| Invalid data | DataError | Use cached data or default |
| WebSocket disconnect | ConnectionError | Automatic reconnection |

## Data Flow Architecture

### Balance Fetch Flow

```
User Request
    ↓
Service Layer (BalanceService.getBalance)
    ↓
Check L1 Cache (Memory) → Hit? Return
    ↓ Miss
Check L2 Cache (IndexedDB) → Hit? Promote to L1, Return
    ↓ Miss
Request Coalescer → Deduplicate concurrent requests
    ↓
Batch Processor → Combine multiple addresses
    ↓
Circuit Breaker → Check state
    ↓
Connection Pool → Acquire connection
    ↓
Primary RPC Provider
    ↓ (on failure)
Retry with Backoff
    ↓ (on failure)
Secondary RPC Provider
    ↓ (on failure)
Cached Data (L2)
    ↓
Anti-Corruption Layer:
  - Adapter: Raw RPC response
  - Translator: viem → data-models
  - Validator: Schema & rules validation
    ↓
Update Caches (L1, L2)
    ↓
Return data-models Balance to caller
```

### WebSocket Subscription Flow

```
User subscribes to balance updates
    ↓
Connection Pool → Get/Create WebSocket connection
    ↓
Subscribe to newBlock events
    ↓
On each new block:
  - Fetch latest balance
  - Compare with cached balance
  - If changed:
    * Update cache
    * Publish event
    * Invoke user callback
    ↓
On disconnect:
  - Attempt reconnection (exponential backoff)
  - Queue updates during disconnect
  - Replay queued updates on reconnect
```

## Configuration Management

### Chain Configuration

**Format**: JSON per chain in `src/registry/configs/`

**Schema**:
```json
{
  "id": 1,
  "name": "Ethereum",
  "symbol": "ETH",
  "decimals": 18,
  "endpoints": {
    "http": [
      {
        "url": "https://eth-mainnet.g.alchemy.com/v2/...",
        "priority": 1,
        "weight": 10
      },
      {
        "url": "https://mainnet.infura.io/v3/...",
        "priority": 2,
        "weight": 5
      }
    ],
    "ws": [
      {
        "url": "wss://eth-mainnet.g.alchemy.com/v2/...",
        "priority": 1
      }
    ]
  },
  "explorer": "https://etherscan.io",
  "tokens": {
    "popular": [
      {
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "symbol": "USDC",
        "decimals": 6
      }
    ]
  },
  "performance": {
    "cacheConfig": {
      "balance": 60,
      "transaction": 300
    },
    "batchConfig": {
      "maxSize": 50,
      "windowMs": 50
    }
  },
  "resilience": {
    "circuitBreaker": {
      "failureThreshold": 5,
      "timeout": 30000
    },
    "retry": {
      "maxAttempts": 3,
      "baseDelay": 1000
    }
  }
}
```

### Runtime Configuration

**Dynamic Updates**:
- Add/remove RPC endpoints
- Update endpoint weights
- Modify cache TTLs
- Adjust resilience thresholds

**Configuration Sources**:
1. Static JSON files (default)
2. Environment variables (overrides)
3. Runtime API (dynamic updates)

## Testing Architecture

### Test Pyramid

```
         ┌─────────────┐
        │   E2E Tests  │  1% - Critical user paths
       ├───────────────┤
      │ Contract Tests │  4% - Data model compliance
     ├─────────────────┤
    │Integration Tests │  15% - Mock external services
   ├───────────────────┤
  │    Unit Tests      │  80% - Business logic, transforms
 └─────────────────────┘
```

### Unit Tests (80%)

**Focus Areas**:
- Data transformation (viem → data-models)
- Business rule validation
- Error classification and recovery
- Cache key generation
- Mapper functions

**Patterns**:
- Mock RPC providers
- Parameterized tests for multiple chains
- Test doubles for external dependencies

### Integration Tests (15%)

**Focus Areas**:
- Adapter lifecycle (connect, disconnect)
- Fallback chain execution
- Circuit breaker state transitions
- Cache layer interactions
- Request batching behavior

**Patterns**:
- Mock RPC servers
- Recorded responses (playback pattern)
- Scenario testing (normal, degraded, failure)

### Contract Tests (4%)

**Focus Areas**:
- Verify all public APIs return data-models types
- Validate Balance, Transaction, Asset schemas
- Ensure adapter interface compliance

**Tools**:
- JSON Schema validation
- Type checking with TypeScript
- Contract test fixtures

### E2E Tests (1%)

**Critical Paths**:
- Complete balance fetch flow (cache miss → RPC → transform → return)
- WebSocket subscription lifecycle
- Multi-chain portfolio loading
- Error recovery scenarios

## Performance Targets

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

## Dependencies

### Internal Dependencies
- `@cygnus-wealth/data-models` (REQUIRED): Unified data structure definitions

### External Dependencies
- `viem`: Ethereum interaction library (primary)
- `isows`: Cross-platform WebSocket support

### Development Dependencies
- `vitest`: Testing framework
- `typescript`: Type system
- `@types/node`: Node.js type definitions

## Future Enhancements

### Planned Features
1. **Advanced Caching**: Predictive cache warming based on usage patterns
2. **Enhanced Observability**: OpenTelemetry integration for distributed tracing
3. **GraphQL Support**: Alternative query interface for complex data needs
4. **Chain-Specific Optimizations**: L2-specific batching, MEV protection
5. **NFT Support**: Enhanced ERC-721/1155 handling with metadata
6. **DeFi Protocol Integration**: Direct protocol data fetching (Uniswap, Aave)

### Architectural Evolution
- Event Sourcing for blockchain state changes
- CQRS pattern for read optimization
- Microservice decomposition for high-scale deployments

## Adding Support for New Chains

### Process
1. Create JSON config in `src/registry/configs/[chain].json`
2. Include all required fields (id, name, symbol, decimals, endpoints, explorer)
3. Configure chain-specific resilience and performance parameters
4. Add chain-specific token configurations
5. Test with both HTTP and WebSocket endpoints
6. Verify data transformation correctness
7. Add integration tests for chain-specific behaviors

### Chain Configuration Template
See Configuration Management section for complete schema.

## Related Documentation

- **[EVM Integration Bounded Context](../enterprise-arch/domains/integration/bounded-contexts/evm-integration.md)** - Domain-level specification
- **[Integration Domain README](../enterprise-arch/domains/integration/README.md)** - Strategic guidance and domain principles
- **[Integration Patterns](../enterprise-arch/domains/integration/patterns.md)** - Detailed pattern implementations
- **[Resilience & Performance](../enterprise-arch/domains/integration/resilience-performance.md)** - Deep dive into resilience strategies
- **[Testing & Security](../enterprise-arch/domains/integration/testing-security.md)** - Comprehensive testing and security guidance
- **[Data Models Compliance](./docs/data-models-compliance.md)** - Type mapping and compliance details
- **[Domain Architecture Review](./ARCHITECTURE_REVIEW.md)** - Strategic assessment and recommendations

---

**Document Version**: 2.0
**Last Updated**: 2025-10-12
**Status**: System Architecture (aligned with Domain Architecture)
**Owner**: System Architect, evm-integration
