import React from 'react';
import { 
  useEvmTokenBalance, 
  useEvmTokenBalances,
  useEvmTokenBalanceRealTime 
} from '@cygnus-wealth/evm-integration';
import { Address } from 'viem';

// Example token addresses (Ethereum mainnet)
const USDC_ADDRESS: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT_ADDRESS: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const DAI_ADDRESS: Address = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

function SingleTokenBalance({ address }: { address: Address }) {
  // Fetch single token balance
  const { balance, isLoading, error } = useEvmTokenBalance({
    address,
    tokenAddress: USDC_ADDRESS,
    chainId: 1, // Ethereum mainnet
  });

  if (isLoading) return <div>Loading USDC balance...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!balance) return <div>No balance data</div>;

  return (
    <div>
      <h3>USDC Balance</h3>
      <p>Amount: {balance.amount} (raw)</p>
      <p>Formatted: {Number(balance.amount) / 10 ** (balance.asset.decimals || 6)}</p>
    </div>
  );
}

function MultipleTokenBalances({ address }: { address: Address }) {
  // Fetch multiple token balances
  const { balances, isAnyLoading, errors } = useEvmTokenBalances({
    address,
    tokens: [
      { tokenAddress: USDC_ADDRESS },
      { tokenAddress: USDT_ADDRESS },
      { tokenAddress: DAI_ADDRESS },
    ],
    chainId: 1,
  });

  if (isAnyLoading) return <div>Loading token balances...</div>;

  return (
    <div>
      <h3>Token Balances</h3>
      {balances.map(({ tokenAddress, balance, error }) => (
        <div key={tokenAddress}>
          {balance ? (
            <>
              <p>{balance.asset.symbol}: {Number(balance.amount) / 10 ** balance.asset.decimals}</p>
            </>
          ) : error ? (
            <p>Error loading {tokenAddress}: {error.message}</p>
          ) : (
            <p>No data for {tokenAddress}</p>
          )}
        </div>
      ))}
      {errors.length > 0 && (
        <div>
          <h4>Errors:</h4>
          {errors.map(({ tokenAddress, error }) => (
            <p key={tokenAddress}>
              {tokenAddress}: {error.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function RealTimeTokenBalance({ address }: { address: Address }) {
  // Real-time token balance with WebSocket support
  const {
    balance,
    isLoading,
    isWebSocketConnected,
    connectionState,
    error,
    refetch,
  } = useEvmTokenBalanceRealTime(
    address,
    USDC_ADDRESS,
    1, // Ethereum mainnet
    {
      pollInterval: 15000, // Poll every 15 seconds
      preferWebSocket: true,
    }
  );

  if (isLoading) return <div>Connecting...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h3>Real-time USDC Balance</h3>
      <p>Connection: {connectionState} {isWebSocketConnected && '(WebSocket)'}</p>
      {balance && (
        <>
          <p>Amount: {Number(balance.amount) / 10 ** balance.asset.decimals}</p>
          <p>Last updated: {balance.value?.timestamp.toLocaleTimeString()}</p>
        </>
      )}
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}

export function TokenBalanceExample() {
  const address: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f06a70';

  return (
    <div>
      <h1>ERC20 Token Balance Examples</h1>
      
      <SingleTokenBalance address={address} />
      <hr />
      
      <MultipleTokenBalances address={address} />
      <hr />
      
      <RealTimeTokenBalance address={address} />
    </div>
  );
}