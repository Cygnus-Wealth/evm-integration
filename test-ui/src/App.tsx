import React, { useState, useMemo, useCallback } from 'react';
import { useEvmBalance, useEvmTransactions, useEvmTokenBalances, useEvmBalanceRealTime } from '../../src';
import { formatUnits } from 'viem';
import { createConfig, http, webSocket } from 'wagmi';
import { mainnet, polygon, arbitrum, optimism, base } from 'wagmi/chains';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Default RPC endpoints - using recommended free strategy
// Note: PublicNode doesn't support WebSocket, using alternatives for WS
const defaultRpcEndpoints: Record<number, { http: string; ws?: string }> = {
  1: { 
    http: 'https://ethereum-rpc.publicnode.com',
    ws: 'wss://eth-mainnet.public.blastapi.io'  // Working WebSocket
  },
  137: { 
    http: 'https://polygon-rpc.com',
    ws: 'wss://polygon-mainnet.public.blastapi.io'  // Working WebSocket
  },
  42161: { 
    http: 'https://arb1.arbitrum.io/rpc'
    // Note: Arbitrum WebSocket endpoints are unreliable/not working
  },
  10: { 
    http: 'https://mainnet.optimism.io',
    ws: 'wss://optimism-mainnet.public.blastapi.io'  // Working WebSocket
  },
  8453: { 
    http: 'https://mainnet.base.org'
    // Note: Base doesn't have free WebSocket endpoints
  },
};

function App() {
  const [address, setAddress] = useState<string>('');
  const [chainId, setChainId] = useState<number>(1);
  const [inputAddress, setInputAddress] = useState<string>('');
  const [useWebSocket, setUseWebSocket] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [rpcEndpoints, setRpcEndpoints] = useState(defaultRpcEndpoints);
  const [customRpc, setCustomRpc] = useState({ http: '', ws: '' });
  const [queryClient] = useState(() => new QueryClient());

  // Create wagmi config based on current RPC settings
  const createWagmiConfig = useCallback(() => {
    const chains = [mainnet, polygon, arbitrum, optimism, base] as const;
    const transports: any = {};

    chains.forEach(chain => {
      const endpoint = rpcEndpoints[chain.id];
      if (endpoint) {
        // Use WebSocket if available and enabled, otherwise HTTP
        if (useWebSocket && endpoint.ws) {
          transports[chain.id] = webSocket(endpoint.ws, {
            reconnect: {
              attempts: 5,
              delay: 1000,
            },
            retryCount: 3,
            timeout: 10000,
          });
        } else {
          transports[chain.id] = http(endpoint.http);
        }
      }
    });

    return createConfig({
      chains,
      connectors: [],
      transports,
    });
  }, [rpcEndpoints, useWebSocket]);

  // Use useMemo to prevent unnecessary recreations
  const wagmiConfig = useMemo(() => createWagmiConfig(), [createWagmiConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputAddress && inputAddress.startsWith('0x') && inputAddress.length === 42) {
      setAddress(inputAddress);
    }
  };

  const handleSaveRpcSettings = () => {
    if (customRpc.http) {
      setRpcEndpoints(prev => ({
        ...prev,
        [chainId]: {
          http: customRpc.http,
          ws: customRpc.ws || undefined
        }
      }));
      setCustomRpc({ http: '', ws: '' });
      setShowSettings(false);
    }
  };

  const handleResetRpc = () => {
    setRpcEndpoints(defaultRpcEndpoints);
    setCustomRpc({ http: '', ws: '' });
  };

  const chains = [
    { id: 1, name: 'Ethereum' },
    { id: 137, name: 'Polygon' },
    { id: 42161, name: 'Arbitrum' },
    { id: 10, name: 'Optimism' },
    { id: 8453, name: 'Base' },
  ];

  return (
    <WagmiProvider config={wagmiConfig} key={`wagmi-${chainId}-${useWebSocket}`}>
      <QueryClientProvider client={queryClient}>
        <AppContent 
          address={address}
          chainId={chainId}
          inputAddress={inputAddress}
          setInputAddress={setInputAddress}
          setAddress={setAddress}
          setChainId={setChainId}
          useWebSocket={useWebSocket}
          setUseWebSocket={setUseWebSocket}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          rpcEndpoints={rpcEndpoints}
          customRpc={customRpc}
          setCustomRpc={setCustomRpc}
          handleSubmit={handleSubmit}
          handleSaveRpcSettings={handleSaveRpcSettings}
          handleResetRpc={handleResetRpc}
          chains={chains}
        />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function AppContent({ 
  address, 
  chainId, 
  inputAddress, 
  setInputAddress, 
  setAddress, 
  setChainId,
  useWebSocket,
  setUseWebSocket,
  showSettings,
  setShowSettings,
  rpcEndpoints,
  customRpc,
  setCustomRpc,
  handleSubmit,
  handleSaveRpcSettings,
  handleResetRpc,
  chains
}: any) {
  // Use real-time hook if WebSocket is enabled
  const realTimeResult = useEvmBalanceRealTime(
    address as `0x${string}`,
    chainId,
    {
      enabled: useWebSocket && !!address,
      preferWebSocket: true,
      autoConnect: true,
      pollInterval: 15000, // Fallback to polling every 15s if WebSocket fails
    }
  );

  // Use standard hook if WebSocket is disabled
  const standardResult = useEvmBalance({ 
    address: address as `0x${string}`, 
    chainId 
  });

  // Select which result to use based on settings
  const balance = useWebSocket ? realTimeResult.balance : standardResult.balance;
  const balanceLoading = useWebSocket ? realTimeResult.isLoading : standardResult.isLoading;
  const balanceError = useWebSocket ? realTimeResult.error : standardResult.error;
  const isWebSocketConnected = useWebSocket ? realTimeResult.isWebSocketConnected : false;

  const { data: transactions, isLoading: txLoading } = useEvmTransactions({ 
    address: address as `0x${string}`, 
    chainId 
  });

  // Common ERC20 tokens to check - addresses vary by chain
  const getTokensForChain = (chainId: number) => {
    switch (chainId) {
      case 1: // Ethereum
        return [
          { tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`, enabled: true }, // USDC
          { tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as `0x${string}`, enabled: true }, // USDT
          { tokenAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F' as `0x${string}`, enabled: true }, // DAI
        ];
      case 137: // Polygon
        return [
          { tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as `0x${string}`, enabled: true }, // USDC
          { tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as `0x${string}`, enabled: true }, // USDT
          { tokenAddress: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' as `0x${string}`, enabled: true }, // DAI
        ];
      case 42161: // Arbitrum
        return [
          { tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`, enabled: true }, // USDC
          { tokenAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as `0x${string}`, enabled: true }, // USDT
          { tokenAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as `0x${string}`, enabled: true }, // DAI
        ];
      case 10: // Optimism
        return [
          { tokenAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as `0x${string}`, enabled: true }, // USDC
          { tokenAddress: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' as `0x${string}`, enabled: true }, // USDT
          { tokenAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as `0x${string}`, enabled: true }, // DAI
        ];
      case 8453: // Base
        return [
          { tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`, enabled: true }, // USDC
          { tokenAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' as `0x${string}`, enabled: true }, // DAI
        ];
      default:
        return [];
    }
  };

  const commonTokens = getTokensForChain(chainId);

  const { balances: tokenBalances, isLoading: tokensLoading } = useEvmTokenBalances({
    address: address as `0x${string}`,
    tokens: commonTokens,
    chainId
  });

  return (
    <div className="app">
      <header>
        <h1>EVM Integration Test UI</h1>
        <button onClick={() => setShowSettings(!showSettings)} className="settings-btn">
          ⚙️ Settings
        </button>
      </header>

      <main>
        {showSettings && (
          <section className="settings-section">
            <h2>Connection Settings</h2>
            
            <div className="settings-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useWebSocket}
                  onChange={(e) => setUseWebSocket(e.target.checked)}
                />
                <span>Use WebSocket (real-time updates)</span>
              </label>
              {useWebSocket && isWebSocketConnected && (
                <span className="connection-status connected">🟢 WebSocket Connected</span>
              )}
              {useWebSocket && !isWebSocketConnected && address && (
                <span className="connection-status disconnected">🔴 WebSocket Disconnected (using polling)</span>
              )}
            </div>

            <div className="settings-group">
              <h3>RPC Endpoints for {chains.find(c => c.id === chainId)?.name}</h3>
              <div className="current-endpoints">
                <p><strong>Current HTTP:</strong> {rpcEndpoints[chainId]?.http}</p>
                {rpcEndpoints[chainId]?.ws && (
                  <p><strong>Current WebSocket:</strong> {rpcEndpoints[chainId]?.ws}</p>
                )}
              </div>
              
              <div className="form-group">
                <label>Custom HTTP RPC:</label>
                <input
                  type="text"
                  value={customRpc.http}
                  onChange={(e) => setCustomRpc({ ...customRpc, http: e.target.value })}
                  placeholder="https://your-rpc-endpoint.com"
                />
              </div>
              
              <div className="form-group">
                <label>Custom WebSocket RPC (optional):</label>
                <input
                  type="text"
                  value={customRpc.ws}
                  onChange={(e) => setCustomRpc({ ...customRpc, ws: e.target.value })}
                  placeholder="wss://your-ws-endpoint.com"
                />
              </div>
              
              <div className="settings-buttons">
                <button onClick={handleSaveRpcSettings} disabled={!customRpc.http}>
                  Save RPC Settings
                </button>
                <button onClick={handleResetRpc} className="secondary">
                  Reset to Defaults
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="input-section">
          <h2>Test Configuration</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="address">Ethereum Address:</label>
              <input
                id="address"
                type="text"
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                placeholder="0x..."
                pattern="^0x[a-fA-F0-9]{40}$"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="chain">Chain:</label>
              <select 
                id="chain"
                value={chainId} 
                onChange={(e) => setChainId(parseInt(e.target.value))}
              >
                {chains.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit">Load Data</button>
          </form>
          {address && (
            <div className="current-config">
              <p><strong>Testing Address:</strong> {address}</p>
              <p><strong>Chain ID:</strong> {chainId}</p>
              <p><strong>Connection Mode:</strong> {useWebSocket ? 'WebSocket' : 'HTTP Polling'}</p>
            </div>
          )}
        </section>

        {address && (
          <>
            <section className="balance-section">
              <h2>Native Balance</h2>
              {balanceLoading ? (
                <p>Loading balance...</p>
              ) : balanceError ? (
                <p style={{color: 'red'}}>Error: {balanceError.message}</p>
              ) : balance ? (
                <div>
                  <p className="balance">
                    {formatUnits(BigInt(balance.amount), balance.asset.decimals)} {balance.asset.symbol}
                  </p>
                  {balance.value && (
                    <p className="usd-value">
                      ${balance.value.amount.toFixed(2)} USD
                    </p>
                  )}
                </div>
              ) : (
                <p>No balance data returned</p>
              )}
            </section>

            <section className="tokens-section">
              <h2>Token Balances</h2>
              {commonTokens.length === 0 ? (
                <p>No token addresses configured for this chain</p>
              ) : tokensLoading ? (
                <p>Loading tokens...</p>
              ) : tokenBalances && tokenBalances.length > 0 ? (
                <div className="token-list">
                  {tokenBalances.map((tokenBalance, index) => {
                    if (!tokenBalance.balance) return null;
                    const { asset, amount } = tokenBalance.balance;
                    return (
                      <div key={index} className="token-item">
                        <div className="token-info">
                          <span className="token-symbol">{asset.symbol}</span>
                          <span className="token-name">{asset.name}</span>
                        </div>
                        <div className="token-balance">
                          <span>{formatUnits(BigInt(amount), asset.decimals)}</span>
                          {tokenBalance.balance.value && (
                            <span className="token-usd">${tokenBalance.balance.value.amount.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>No token balances found (checking USDC, USDT, DAI)</p>
              )}
            </section>

            <section className="transactions-section">
              <h2>Recent Transactions</h2>
              {txLoading ? (
                <p>Loading transactions...</p>
              ) : transactions && transactions.length > 0 ? (
                <div className="transaction-list">
                  {transactions.slice(0, 10).map((tx) => (
                    <div key={tx.hash} className="transaction-item">
                      <div className="tx-hash">
                        <strong>Hash:</strong> {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                      </div>
                      <div className="tx-details">
                        <span>Block: {tx.blockNumber}</span>
                        <span>From: {tx.from.slice(0, 6)}...{tx.from.slice(-4)}</span>
                        <span>To: {tx.to?.slice(0, 6)}...{tx.to?.slice(-4)}</span>
                        <span>Value: {formatUnits(BigInt(tx.value), 18)} ETH</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No transactions found</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;