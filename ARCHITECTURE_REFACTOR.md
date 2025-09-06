# Architecture Refactoring Proposal

## Current Problems

1. **Configuration is scattered across 5+ files** with duplicate/conflicting endpoints
2. **No chain abstraction** - chainId passed everywhere as magic number
3. **Multiple overlapping providers** doing the same thing differently
4. **Tight coupling to wagmi/viem** throughout the codebase
5. **No clear separation of concerns** between transport, chain config, and business logic

## Proposed Architecture

### Core Concepts

```typescript
// 1. Chain Configuration (Single Source of Truth)
interface ChainConfig {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
  endpoints: {
    http: string[];
    ws?: string[];
  };
  tokens?: TokenConfig[];
  explorer: string;
}

// 2. Standard Chain Interface
interface IChainAdapter {
  // Core methods
  getBalance(address: Address): Promise<Balance>;
  getTokenBalances(address: Address, tokens?: Token[]): Promise<TokenBalance[]>;
  getTransactions(address: Address, options?: TxOptions): Promise<Transaction[]>;
  
  // Real-time subscriptions
  subscribeToBalance(address: Address, callback: BalanceCallback): Unsubscribe;
  subscribeToTransactions(address: Address, callback: TxCallback): Unsubscribe;
  
  // Chain info
  getChainInfo(): ChainInfo;
  isHealthy(): Promise<boolean>;
}

// 3. Chain Registry (Factory + Registry Pattern)
class ChainRegistry {
  private chains: Map<number, ChainConfig>;
  private adapters: Map<number, IChainAdapter>;
  
  registerChain(config: ChainConfig): void;
  getAdapter(chainId: number): IChainAdapter;
  getSupportedChains(): ChainInfo[];
}
```

### Proposed File Structure

```
src/
├── core/
│   ├── interfaces/
│   │   ├── IChainAdapter.ts      # Standard interface
│   │   ├── ITransport.ts         # Transport abstraction
│   │   └── ITokenProvider.ts     # Token data interface
│   ├── models/
│   │   ├── Balance.ts
│   │   ├── Transaction.ts
│   │   └── Token.ts
│   └── ChainRegistry.ts          # Central registry
│
├── chains/
│   ├── configs/
│   │   ├── ethereum.json         # Chain-specific config
│   │   ├── polygon.json
│   │   ├── arbitrum.json
│   │   ├── optimism.json
│   │   └── base.json
│   ├── EvmChainAdapter.ts        # EVM implementation
│   └── utils/
│       └── endpoints.ts          # Endpoint selection logic
│
├── transport/
│   ├── HttpTransport.ts          # HTTP implementation
│   ├── WebSocketTransport.ts     # WS implementation
│   └── TransportFactory.ts       # Creates appropriate transport
│
├── react/                         # React bindings
│   ├── hooks/
│   │   ├── useChainAdapter.ts
│   │   ├── useBalance.ts
│   │   └── useTokenBalances.ts
│   └── ChainProvider.tsx         # React context
│
└── index.ts                       # Clean public API
```

## Usage Examples

### Basic Usage
```typescript
import { ChainRegistry, chains } from '@cygnus-wealth/evm-integration';

// Initialize with default chains
const registry = new ChainRegistry();
registry.registerChain(chains.ethereum);
registry.registerChain(chains.polygon);

// Get adapter for specific chain
const ethereum = registry.getAdapter(1);
const balance = await ethereum.getBalance('0x...');
```

### React Usage
```tsx
import { ChainProvider, useBalance } from '@cygnus-wealth/evm-integration/react';

function App() {
  return (
    <ChainProvider registry={registry}>
      <BalanceDisplay />
    </ChainProvider>
  );
}

function BalanceDisplay() {
  const { balance, isLoading } = useBalance({
    address: '0x...',
    chainId: 1
  });
  
  return <div>{balance?.formatted}</div>;
}
```

### Custom Configuration
```typescript
// Override endpoints
const customEthereum = {
  ...chains.ethereum,
  endpoints: {
    http: ['https://my-node.com'],
    ws: ['wss://my-node.com']
  }
};

registry.registerChain(customEthereum);
```

## Benefits

1. **Single source of truth** for chain configuration
2. **Chain-agnostic interface** - easy to add new chains
3. **Proper abstraction** - swap transports without changing business logic
4. **Testable** - mock adapters for testing
5. **Extensible** - add new chains without modifying core
6. **Clean API** - consumers don't need to know implementation details

## Migration Path

1. **Phase 1**: Create new architecture alongside existing code
2. **Phase 2**: Migrate hooks to use new adapters internally
3. **Phase 3**: Deprecate old providers and scattered configs
4. **Phase 4**: Remove legacy code

## Comparison

| Aspect | Current | Proposed |
|--------|---------|----------|
| Config locations | 5+ files | 1 per chain |
| Adding new chain | Edit multiple files | Add one config file |
| WebSocket handling | 3 different implementations | 1 transport class |
| Testing | Hard (wagmi mocking) | Easy (interface mocking) |
| Chain switching | Pass chainId everywhere | Get adapter once |
| Endpoint fallback | Scattered logic | Centralized in transport |