import React, { useState } from 'react';
import { 
  useEvmBalanceRealTime, 
  useEvmTransactionMonitor,
  ConnectionState 
} from '@cygnus-wealth/evm-integration';

/**
 * Demo component showing WebSocket-first real-time data with automatic fallback
 */
export function WebSocketDemo() {
  const [address] = useState<`0x${string}`>('0xb3f87099943eC9A6D2ee102D55CE961589b7fDe2');
  const [chainId] = useState(1); // Ethereum mainnet

  // Real-time balance monitoring with WebSocket priority
  const {
    balance,
    isLoading: balanceLoading,
    isWebSocketConnected: balanceWsConnected,
    connectionState: balanceConnectionState,
    error: balanceError,
    connect: connectBalance,
    disconnect: disconnectBalance,
  } = useEvmBalanceRealTime(address, chainId, {
    preferWebSocket: true,      // Try WebSocket first (default)
    pollInterval: 15000,        // Fall back to 15s polling if WebSocket fails
    autoConnect: true,          // Auto-connect on mount
  });

  // Real-time transaction monitoring
  const {
    transactions,
    isLoading: txLoading,
    isWebSocketConnected: txWsConnected,
    connectionState: txConnectionState,
    clearTransactions,
  } = useEvmTransactionMonitor(address, chainId, {
    preferWebSocket: true,
    pollInterval: 12000,        // Poll every 12s if WebSocket unavailable
    includeIncoming: true,
    includeOutgoing: true,
  });

  // Helper to display connection status
  const getConnectionIcon = (state: ConnectionState) => {
    switch (state) {
      case ConnectionState.CONNECTED_WS:
        return '🟢'; // Green - WebSocket active
      case ConnectionState.CONNECTED_HTTP:
        return '🟡'; // Yellow - HTTP polling fallback
      case ConnectionState.CONNECTING:
        return '🔵'; // Blue - Connecting
      case ConnectionState.ERROR:
        return '🔴'; // Red - Error
      default:
        return '⚪'; // White - Disconnected
    }
  };

  const getConnectionText = (state: ConnectionState) => {
    switch (state) {
      case ConnectionState.CONNECTED_WS:
        return 'WebSocket (Real-time)';
      case ConnectionState.CONNECTED_HTTP:
        return 'HTTP Polling (Fallback)';
      case ConnectionState.CONNECTING:
        return 'Connecting...';
      case ConnectionState.ERROR:
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>EVM WebSocket Demo</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <strong>Address:</strong> {address}<br />
        <strong>Chain:</strong> Ethereum Mainnet
      </div>

      {/* Balance Section */}
      <div style={{ 
        border: '1px solid #ccc', 
        padding: '15px', 
        marginBottom: '20px',
        borderRadius: '8px' 
      }}>
        <h2>Real-time Balance</h2>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Connection:</strong> {getConnectionIcon(balanceConnectionState)} {getConnectionText(balanceConnectionState)}
        </div>

        {balanceLoading ? (
          <p>Loading balance...</p>
        ) : balanceError ? (
          <p style={{ color: 'red' }}>Error: {balanceError.message}</p>
        ) : balance ? (
          <div>
            <p><strong>Balance:</strong> {balance.value?.amount} {balance.asset.symbol}</p>
            <p><strong>Raw Amount:</strong> {balance.amount} wei</p>
            <p><strong>Asset:</strong> {balance.asset.name} ({balance.asset.chain})</p>
          </div>
        ) : (
          <p>No balance data</p>
        )}

        <div style={{ marginTop: '10px' }}>
          {balanceConnectionState === ConnectionState.DISCONNECTED ? (
            <button onClick={connectBalance}>Connect</button>
          ) : (
            <button onClick={disconnectBalance}>Disconnect</button>
          )}
        </div>

        {/* Connection Details */}
        <details style={{ marginTop: '10px', fontSize: '12px' }}>
          <summary>Connection Details</summary>
          <ul>
            <li>WebSocket Connected: {balanceWsConnected ? 'Yes' : 'No'}</li>
            <li>Connection State: {balanceConnectionState}</li>
            <li>
              {balanceWsConnected 
                ? 'Using real-time WebSocket updates' 
                : 'Using HTTP polling fallback (updates every 15s)'}
            </li>
          </ul>
        </details>
      </div>

      {/* Transactions Section */}
      <div style={{ 
        border: '1px solid #ccc', 
        padding: '15px',
        borderRadius: '8px' 
      }}>
        <h2>Real-time Transactions</h2>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Connection:</strong> {getConnectionIcon(txConnectionState)} {getConnectionText(txConnectionState)}
        </div>

        {txLoading ? (
          <p>Monitoring transactions...</p>
        ) : (
          <>
            <p>Found {transactions.length} transaction(s)</p>
            
            {transactions.length > 0 && (
              <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                {transactions.map((tx, index) => (
                  <div 
                    key={tx.hash} 
                    style={{ 
                      padding: '10px', 
                      marginBottom: '5px', 
                      backgroundColor: '#f5f5f5',
                      fontSize: '12px',
                      borderRadius: '4px'
                    }}
                  >
                    <strong>#{index + 1}</strong><br />
                    Hash: {tx.hash?.substring(0, 10)}...{tx.hash?.substring(tx.hash.length - 8)}<br />
                    Type: {tx.type}<br />
                    Status: {tx.status}<br />
                    {tx.from === address ? '⬆️ Outgoing' : '⬇️ Incoming'}
                  </div>
                ))}
              </div>
            )}

            <button 
              onClick={clearTransactions} 
              style={{ marginTop: '10px' }}
              disabled={transactions.length === 0}
            >
              Clear Transactions
            </button>
          </>
        )}

        {/* Connection Details */}
        <details style={{ marginTop: '10px', fontSize: '12px' }}>
          <summary>Connection Details</summary>
          <ul>
            <li>WebSocket Connected: {txWsConnected ? 'Yes' : 'No'}</li>
            <li>Connection State: {txConnectionState}</li>
            <li>
              {txWsConnected 
                ? 'Monitoring pending transactions in real-time via WebSocket' 
                : 'Polling for new transactions every 12s via HTTP'}
            </li>
          </ul>
        </details>
      </div>

      {/* Instructions */}
      <div style={{ marginTop: '30px', fontSize: '14px', color: '#666' }}>
        <h3>How it works:</h3>
        <ul>
          <li>🟢 Green = WebSocket connection active (real-time updates)</li>
          <li>🟡 Yellow = HTTP polling fallback (periodic updates)</li>
          <li>The library automatically tries WebSocket first for best performance</li>
          <li>If WebSocket fails or is unavailable, it falls back to HTTP polling</li>
          <li>Balance updates: WebSocket (on each block) or HTTP (every 15s)</li>
          <li>Transaction monitoring: WebSocket (instant) or HTTP (every 12s)</li>
        </ul>
      </div>
    </div>
  );
}