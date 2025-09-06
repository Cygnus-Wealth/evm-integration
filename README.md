# @cygnus-wealth/evm-integration

Framework-agnostic TypeScript library for read-only EVM blockchain data access. Returns all data in standardized `@cygnus-wealth/data-models` format.

## Features

- 🔌 **Multi-chain Support** - Ethereum, Polygon, Arbitrum, Optimism, Base, and more
- 📊 **Standardized Data** - All responses use `@cygnus-wealth/data-models` types
- 🚀 **Framework Agnostic** - Use with React, Vue, Node.js, or vanilla JavaScript
- 🔄 **Real-time Updates** - WebSocket support for live balance monitoring
- 🛡️ **Read-only** - Safe, no transaction signing or private keys
- ⚡ **TypeScript First** - Full type safety and IntelliSense support

## Installation

```bash
npm install @cygnus-wealth/evm-integration
```

## Quick Start

```typescript
import { defaultRegistry } from '@cygnus-wealth/evm-integration';

// Get adapter for Ethereum mainnet
const adapter = defaultRegistry.getAdapter(1);

// Fetch balance
const balance = await adapter.getBalance('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7');
console.log(`Balance: ${balance.amount} ${balance.asset?.symbol}`);
```

## Core API

### Using the Registry (Recommended)

```typescript
import { defaultRegistry } from '@cygnus-wealth/evm-integration';

// Get adapter for any supported chain
const ethereum = defaultRegistry.getAdapter(1);
const polygon = defaultRegistry.getAdapter(137);
const arbitrum = defaultRegistry.getAdapter(42161);

// All adapters share the same interface
const balance = await ethereum.getBalance(address);
const tokens = await polygon.getTokenBalances(address);
```

### Direct Adapter Usage

```typescript
import { EvmChainAdapter } from '@cygnus-wealth/evm-integration';

const adapter = new EvmChainAdapter({
  id: 1,
  name: 'Ethereum',
  symbol: 'ETH',
  decimals: 18,
  endpoints: {
    http: ['https://eth-mainnet.public.blastapi.io'],
    ws: ['wss://eth-mainnet.public.blastapi.io']
  },
  explorer: 'https://etherscan.io'
});

await adapter.connect();
const balance = await adapter.getBalance(address);
```

## Supported Chains

| Chain | Chain ID | Symbol |
|-------|----------|--------|
| Ethereum | 1 | ETH |
| Polygon | 137 | MATIC |
| Arbitrum | 42161 | ETH |
| Optimism | 10 | ETH |
| Base | 8453 | ETH |

## Examples

### Get Token Balances

```typescript
const adapter = defaultRegistry.getAdapter(1);

const tokenBalances = await adapter.getTokenBalances(
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
  [
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' }
  ]
);

tokenBalances.forEach(balance => {
  console.log(`${balance.asset?.symbol}: ${balance.amount}`);
});
```

### Real-time Balance Updates

```typescript
const adapter = defaultRegistry.getAdapter(1);

const unsubscribe = await adapter.subscribeToBalance(
  address,
  (balance) => {
    console.log('Balance updated:', balance.amount);
  }
);

// Stop watching
unsubscribe();
```

### Multi-chain Balance Check

```typescript
const chains = [1, 137, 42161, 10, 8453];

const balances = await Promise.all(
  chains.map(async (chainId) => {
    const adapter = defaultRegistry.getAdapter(chainId);
    return adapter.getBalance(address);
  })
);
```

## Framework Integration

This library is framework-agnostic. For framework-specific integrations:

- **React**: Use `@cygnus-wealth/evm-integration-react` (coming soon)
- **Vue**: Use `@cygnus-wealth/evm-integration-vue` (coming soon)
- **Node.js/CLI**: Use directly as shown in examples

## API Reference

### IChainAdapter Interface

```typescript
interface IChainAdapter {
  getBalance(address: Address): Promise<Balance>
  getTokenBalances(address: Address, tokens?: TokenConfig[]): Promise<Balance[]>
  getTransactions(address: Address, options?: TransactionOptions): Promise<Transaction[]>
  subscribeToBalance(address: Address, callback: (balance: Balance) => void): Promise<Unsubscribe>
  connect(): Promise<void>
  disconnect(): void
  getChainInfo(): ChainInfo
  isHealthy(): Promise<boolean>
}
```

All methods return types from `@cygnus-wealth/data-models`.

## Adding Custom Chains

Create a JSON configuration file:

```json
{
  "id": 56,
  "name": "BNB Smart Chain",
  "symbol": "BNB",
  "decimals": 18,
  "endpoints": {
    "http": ["https://bsc-dataseed.binance.org"],
    "ws": ["wss://bsc-ws-node.nariox.org"]
  },
  "explorer": "https://bscscan.com"
}
```

Then register it:

```typescript
import { ChainRegistry } from '@cygnus-wealth/evm-integration';
import bscConfig from './bsc-config.json';

const registry = new ChainRegistry();
registry.registerChain(bscConfig);

const bscAdapter = registry.getAdapter(56);
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical architecture.

## Development

```bash
# Install dependencies
npm install

# Build library
npm run build

# Run tests
npm test

# Run test UI
npm run dev:ui
```

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.