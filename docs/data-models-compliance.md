# Data Models Compliance

## Overview

ALL public interfaces in the EVM Integration library now use types from `@cygnus-wealth/data-models` to ensure consistency across the CygnusWealth ecosystem.

## Public Interface Compliance

### 1. Core Interfaces (`IChainAdapter`)
```typescript
// All methods return data-models types
interface IChainAdapter {
  getBalance(address: Address): Promise<Balance>;  // Returns data-models Balance
  getTokenBalances(address: Address, tokens?: TokenConfig[]): Promise<Balance[]>;  // Returns array of data-models Balance
  getTransactions(address: Address, options?: TransactionOptions): Promise<Transaction[]>;  // Returns data-models Transaction
  // ...
}
```

### 2. React Hooks
All React hooks return data-models types:

- `useBalance()` - Returns `Balance` from data-models
- `useTokenBalances()` - Returns `Balance[]` from data-models  
- `useEvmBalance()` - Returns `Balance` from data-models
- `useEvmTokenBalances()` - Returns `Balance[]` from data-models
- `useEvmTransactions()` - Returns `Transaction[]` from data-models

### 3. Chain Registry
```typescript
const registry = defaultRegistry;
const adapter = registry.getAdapter(1);
const balance: Balance = await adapter.getBalance(address);  // data-models Balance
```

## Implementation Details

### Type Mapping
The library uses mapper functions to convert EVM-specific data to data-models types:

- `mapEvmBalanceToBalance()` - Converts viem balance to data-models `Balance`
- `mapTokenToAsset()` - Creates data-models `Asset` for tokens
- `mapEvmTransaction()` - Converts EVM transaction to data-models `Transaction`
- `mapChainIdToChain()` - Maps chain IDs to data-models `Chain` enum

### Data Structure Example
```typescript
// Balance returned by all public interfaces
interface Balance {
  assetId: string;
  asset: Asset;  // Full Asset object with chain, type, decimals
  amount: string;  // Raw amount as string
  value?: {
    amount: number;  // Formatted USD value
    currency: string;
    timestamp: Date;
  };
}
```

## Testing

The test UI (`test-ui/src/App.tsx`) uses ONLY the publicly exported interfaces:
```typescript
import { 
  useEvmBalance, 
  useEvmTransactions, 
  useEvmTokenBalances 
} from '../../src';  // Public exports

// All hooks return data-models types
const { balance } = useEvmBalance({ address, chainId });
// balance is a data-models Balance object
```

## Benefits

1. **Consistency**: Same data structures across all CygnusWealth modules
2. **Type Safety**: Full TypeScript support with data-models types
3. **Compatibility**: Seamless integration with portfolio aggregation
4. **Maintainability**: Single source of truth for data structures

## Migration Notes

- No "V2" interfaces - ALL public interfaces use data-models
- Legacy hook names preserved for backward compatibility
- All returned data conforms to data-models contracts
- Test UI demonstrates proper usage of public interfaces