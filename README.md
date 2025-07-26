# CygnusWealth EVM Integration

A TypeScript library providing React hooks for read-only EVM blockchain interactions, built for the CygnusWealth decentralized portfolio aggregation platform.

## Features

- 🔗 **Multi-chain Support**: Works with Ethereum and all EVM-compatible blockchains
- 🪝 **React Hooks**: Simple, declarative hooks for balance queries, transaction monitoring, and wallet connections
- 🔒 **Read-only**: Security-first design with no transaction signing or private key handling
- 📦 **TypeScript**: Full type safety with strict mode enabled
- ⚡ **Lightweight**: Minimal dependencies with tree-shaking support
- 🧪 **Well-tested**: Comprehensive test coverage with Vitest

## Installation

```bash
npm install @cygnuswealth/evm-integration
```

## Dependencies

This library uses the `@cygnus-wealth/data-models` package for standardized data structures across the CygnusWealth ecosystem. All hooks return data in the standard formats defined by the data-models library.

## Quick Start

```typescript
import { useEvmBalance, useEvmTransactions } from '@cygnuswealth/evm-integration';

function Portfolio() {
  const { balance, isLoading } = useEvmBalance({
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f1234',
    chainId: 1 // Ethereum mainnet
  });

  const { transactions } = useEvmTransactions({
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f1234',
    chainId: 1
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <p>Balance: {balance?.formatted} ETH</p>
      <p>Transactions: {transactions?.length || 0}</p>
    </div>
  );
}
```

## Available Hooks

### `useEvmBalance`

Fetches and monitors EVM wallet balances in real-time.

```typescript
const { balance, isLoading, error } = useEvmBalance({
  address: '0x...', // EVM address
  chainId: 1,       // Network ID (default: 1)
});
```

### `useEvmTransactions`

Retrieves transaction history for an address.

```typescript
const { transactions, isLoading, error } = useEvmTransactions({
  address: '0x...',
  chainId: 1,
  limit: 100 // Optional: number of transactions
});
```

### `useEvmConnect`

Manages wallet connections for read-only access.

```typescript
const { connect, disconnect, isConnected, address } = useEvmConnect();
```

### `useEvmBalanceRealTime`

Provides real-time balance updates with WebSocket support.

```typescript
const { balance, isLoading, error } = useEvmBalanceRealTime({
  address: '0x...',
  chainId: 1,
  updateInterval: 5000 // Optional: polling interval in ms
});
```

### `useEvmTransactionMonitor`

Monitors new transactions in real-time.

```typescript
const { transactions, subscribe, unsubscribe } = useEvmTransactionMonitor({
  address: '0x...',
  chainId: 1,
  onNewTransaction: (tx) => console.log('New transaction:', tx)
});
```

## Supported Networks

The library supports all EVM-compatible chains. Common chain IDs:

- Ethereum Mainnet: `1`
- Polygon: `137`
- Arbitrum One: `42161`
- Optimism: `10`
- BSC: `56`
- Avalanche: `43114`

## Configuration

### Custom RPC Endpoints

```typescript
import { configureEvmClient } from '@cygnuswealth/evm-integration';

configureEvmClient({
  rpcUrls: {
    1: 'https://your-ethereum-rpc.com',
    137: 'https://your-polygon-rpc.com'
  }
});
```

## TypeScript

The library is written in TypeScript and exports all necessary types:

```typescript
import type { EvmAsset, EvmTransaction } from '@cygnuswealth/evm-integration';

interface EvmAsset {
  symbol: string;
  decimals: number;
  value: bigint;
  formatted: string;
}
```

## Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/cygnuswealth/evm-integration.git
cd evm-integration

# Install dependencies
npm install

# Run tests
npm test

# Build the library
npm run build
```

### Commands

- `npm run build` - Build the library
- `npm test` - Run tests
- `npm run test:ui` - Open Vitest UI
- `npm run test:coverage` - Generate coverage report

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

- This library is **read-only** and never handles private keys
- All operations run client-side
- No transaction signing capabilities
- Report security issues to security@cygnuswealth.com

## License

MIT License - see [LICENSE](LICENSE) file for details

## About CygnusWealth

CygnusWealth is a decentralized portfolio aggregation platform that prioritizes user sovereignty and privacy. Learn more at [cygnuswealth.com](https://cygnuswealth.com).

## Support

- Documentation: [docs.cygnuswealth.com](https://docs.cygnuswealth.com)
- Issues: [GitHub Issues](https://github.com/cygnuswealth/evm-integration/issues)
- Discord: [Join our community](https://discord.gg/cygnuswealth)