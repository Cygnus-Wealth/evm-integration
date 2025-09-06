/**
 * Basic usage examples for @cygnus-wealth/evm-integration
 * 
 * This library is framework-agnostic and can be used in any JavaScript/TypeScript environment.
 */

import { defaultRegistry, EvmChainAdapter, chains } from '@cygnus-wealth/evm-integration';
import type { Balance } from '@cygnus-wealth/data-models';

// Example 1: Using the default registry (recommended)
async function getBalanceWithRegistry() {
  // Get adapter for Ethereum mainnet
  const adapter = defaultRegistry.getAdapter(1);
  
  // Fetch balance - returns @cygnus-wealth/data-models Balance type
  const balance: Balance = await adapter.getBalance('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7');
  
  console.log('Balance:', {
    amount: balance.amount,
    symbol: balance.asset?.symbol,
    value: balance.value?.amount // USD value if available
  });
}

// Example 2: Direct adapter instantiation
async function getBalanceDirectly() {
  // Create adapter with custom configuration
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

  // Connect to the chain
  await adapter.connect();

  try {
    const balance = await adapter.getBalance('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7');
    console.log('ETH Balance:', balance.amount);
  } finally {
    // Clean up connections
    adapter.disconnect();
  }
}

// Example 3: Getting token balances
async function getTokenBalances() {
  const adapter = defaultRegistry.getAdapter(1); // Ethereum
  
  // Get balances for specific tokens
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
}

// Example 4: Multi-chain support
async function getMultiChainBalances(address: string) {
  const chainIds = [1, 137, 42161, 10, 8453]; // ETH, Polygon, Arbitrum, Optimism, Base
  
  const balances = await Promise.all(
    chainIds.map(async (chainId) => {
      const adapter = defaultRegistry.getAdapter(chainId);
      const balance = await adapter.getBalance(address);
      return {
        chain: adapter.getChainInfo().name,
        balance: balance.amount,
        symbol: balance.asset?.symbol
      };
    })
  );

  console.log('Multi-chain balances:', balances);
}

// Example 5: Real-time balance updates (WebSocket)
async function watchBalance(address: string) {
  const adapter = defaultRegistry.getAdapter(1);
  
  // Subscribe to balance changes
  const unsubscribe = await adapter.subscribeToBalance(
    address,
    (balance: Balance) => {
      console.log('Balance updated:', balance.amount);
    }
  );

  // Stop watching after 60 seconds
  setTimeout(() => {
    unsubscribe();
    console.log('Stopped watching balance');
  }, 60000);
}

// Example 6: Using pre-configured chains
async function usePreConfiguredChain() {
  // Use the exported chain configurations
  const adapter = new EvmChainAdapter(chains.polygon);
  await adapter.connect();
  
  const balance = await adapter.getBalance('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7');
  console.log('Polygon balance:', balance);
}

// Example 7: Node.js CLI usage
if (require.main === module) {
  const address = process.argv[2];
  if (!address) {
    console.error('Usage: node basic-usage.js <address>');
    process.exit(1);
  }

  getMultiChainBalances(address)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}