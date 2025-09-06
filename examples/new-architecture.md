# Using the New Architecture

## Basic Usage

```typescript
import { defaultRegistry } from '@cygnus-wealth/evm-integration';

// Get adapter for any chain by ID
const ethereum = defaultRegistry.getAdapter(1);
const polygon = defaultRegistry.getAdapter(137);

// Or by name
const base = defaultRegistry.getAdapterByName('base');

// Same interface for all chains!
const ethBalance = await ethereum.getBalance('0x...');
const polyBalance = await polygon.getBalance('0x...');
const baseBalance = await base.getBalance('0x...');
```

## React Usage

```tsx
import { useBalance, useTokenBalances } from '@cygnus-wealth/evm-integration';

function WalletBalance({ address, chainId }) {
  // Clean, simple hook
  const { balance, isLoading } = useBalance({ 
    address, 
    chainId,
    watch: true // Real-time updates 
  });

  // Token balances - automatically uses chain's popular tokens
  const { balances: tokens } = useTokenBalances({ 
    address, 
    chainId 
  });

  return (
    <div>
      <p>Native: {balance?.formatted} {balance?.symbol}</p>
      {tokens.map(token => (
        <p key={token.token.address}>
          {token.token.symbol}: {token.formatted}
        </p>
      ))}
    </div>
  );
}
```

## Custom Configuration

```typescript
import { ChainRegistry, chains } from '@cygnus-wealth/evm-integration';

// Create custom registry
const registry = new ChainRegistry();

// Override Ethereum with custom RPC
registry.registerChain({
  ...chains.ethereum,
  endpoints: {
    http: ['https://my-custom-node.com'],
    ws: ['wss://my-custom-node.com']
  }
});

// Add custom RPC to existing chain
registry.addEndpoint(1, 'https://another-node.com', 'http');

// Use in React
<MyApp registry={registry} />
```

## Adding a New Chain

Just create a JSON config file:

```json
// src/chains/configs/mychain.json
{
  "id": 12345,
  "name": "MyChain",
  "symbol": "MYC",
  "decimals": 18,
  "explorer": "https://explorer.mychain.com",
  "endpoints": {
    "http": ["https://rpc.mychain.com"],
    "ws": ["wss://ws.mychain.com"]
  },
  "tokens": {
    "popular": [
      {
        "address": "0x...",
        "symbol": "USDC",
        "decimals": 6,
        "name": "USD Coin"
      }
    ]
  }
}
```

Then register it:

```typescript
import myChainConfig from './chains/configs/mychain.json';

registry.registerChain(myChainConfig);
const myChain = registry.getAdapter(12345);
```

## Key Benefits

1. **Single Configuration File Per Chain** - No more scattered configs
2. **Standard Interface** - Same API for all chains
3. **Automatic Fallbacks** - Multiple endpoints tried automatically
4. **Token Support Built-in** - Popular tokens pre-configured
5. **Easy to Extend** - Just add a JSON file for new chains
6. **Clean Hooks** - Simple React integration
7. **Type Safe** - Full TypeScript support