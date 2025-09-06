# EVM Integration Library Architecture

## Overview
A TypeScript library for standardized read-only access to EVM-compatible blockchains. Returns all data in `@cygnus-wealth/data-models` format.

## Core Design Principles
1. **Read-only**: No transaction signing or wallet management
2. **Standardized Output**: All methods return `@cygnus-wealth/data-models` types
3. **Multi-chain**: Supports multiple EVM chains through configuration
4. **Framework Agnostic**: Core library has no UI framework dependencies

## Architecture

### Directory Structure
```
src/
├── adapters/         # Chain adapter implementations
│   └── EvmChainAdapter.ts
├── registry/         # Chain configuration management
│   ├── ChainRegistry.ts
│   └── configs/      # JSON configuration per chain
│       ├── ethereum.json
│       ├── polygon.json
│       └── ...
├── types/            # TypeScript interfaces
│   ├── IChainAdapter.ts
│   └── ChainConfig.ts
├── utils/            # Data transformation utilities
│   └── mappers.ts    # viem → data-models mappers
├── providers/        # Connection providers
├── services/         # Connection management
└── index.ts          # Public API exports
```

### Key Components

#### ChainRegistry
- Singleton pattern for managing chain configurations
- Loads JSON configs from `registry/configs/`
- Creates and caches adapter instances
- Runtime configuration updates

#### IChainAdapter Interface
```typescript
interface IChainAdapter {
  // All return @cygnus-wealth/data-models types
  getBalance(address: Address): Promise<Balance>
  getTokenBalances(address: Address, tokens?: TokenConfig[]): Promise<Balance[]>
  getTransactions(address: Address, options?: TransactionOptions): Promise<Transaction[]>
  subscribeToBalance(address: Address, callback: (balance: Balance) => void): Unsubscribe
  connect(): Promise<void>
  disconnect(): void
}
```

#### EvmChainAdapter
- Implements `IChainAdapter` for EVM chains
- Uses `viem` for blockchain interaction
- Supports HTTP and WebSocket transports
- Maps viem responses to data-models types

### Data Flow
```
External RPC → viem → EvmChainAdapter → mappers → data-models types → Consumer
```

## Configuration

### Chain Configuration (JSON)
```json
{
  "id": 1,
  "name": "Ethereum",
  "symbol": "ETH",
  "decimals": 18,
  "endpoints": {
    "http": ["https://..."],
    "ws": ["wss://..."]
  },
  "explorer": "https://etherscan.io",
  "tokens": {
    "popular": [...]
  }
}
```

## Public API

### Primary Usage
```typescript
import { defaultRegistry } from '@cygnus-wealth/evm-integration';

// Get adapter for a chain
const adapter = defaultRegistry.getAdapter(1); // Ethereum
const balance = await adapter.getBalance('0x...');
```

### Direct Instantiation
```typescript
import { EvmChainAdapter } from '@cygnus-wealth/evm-integration';

const adapter = new EvmChainAdapter(config);
await adapter.connect();
const balance = await adapter.getBalance('0x...');
```

## Dependencies
- `@cygnus-wealth/data-models`: Type definitions for return values
- `viem`: Ethereum interaction library

## Adding Support for New Chains

1. Create JSON config in `src/registry/configs/[chain].json`
2. Include all required fields (id, name, endpoints, etc.)
3. Registry automatically loads configs from this directory
4. Test with both HTTP and WebSocket endpoints

## Testing
- Unit tests for adapters and mappers
- Integration tests with real RPCs
- Test utilities in `test-ui/` directory

## Future Improvements
- Add caching layer (IndexedDB for browser, file cache for Node.js)
- Implement request batching for multiple calls
- Add retry logic with exponential backoff
- Support for more chains (BSC, Avalanche, etc.)
- Performance metrics and diagnostics