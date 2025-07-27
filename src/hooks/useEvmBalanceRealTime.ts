import { useState, useEffect, useRef } from 'react';
import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';
import { EnhancedWebSocketProvider, ConnectionState } from '../providers/EnhancedWebSocketProvider';
import { mapEvmBalanceToBalance } from '../utils/mappers';
import { GetBalanceReturnType } from 'wagmi/actions';

export interface UseEvmBalanceRealTimeOptions {
  enabled?: boolean;
  pollInterval?: number;
  autoConnect?: boolean;
  preferWebSocket?: boolean;
}

export interface UseEvmBalanceRealTimeResult {
  balance: Balance | null;
  isLoading: boolean;
  isConnected: boolean;
  isWebSocketConnected: boolean;
  connectionState: ConnectionState;
  error: Error | null;
  refetch: () => void;
  connect: () => void;
  disconnect: () => void;
}

export const useEvmBalanceRealTime = (
  address: Address | undefined,
  chainId: number = 1,
  options: UseEvmBalanceRealTimeOptions = {}
): UseEvmBalanceRealTimeResult => {
  const {
    enabled = true,
    autoConnect = true,
    pollInterval,
    preferWebSocket = true,
  } = options;

  const [balance, setBalance] = useState<Balance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<Error | null>(null);

  const wsProviderRef = useRef<EnhancedWebSocketProvider | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const initializeProvider = () => {
    if (!wsProviderRef.current) {
      wsProviderRef.current = new EnhancedWebSocketProvider({
        autoReconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: 5,
        pollInterval: pollInterval || 12000,
        preferWebSocket,
      });
    }
    return wsProviderRef.current;
  };

  const connect = async () => {
    if (!address || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      const provider = initializeProvider();
      await provider.connect(chainId);
      setIsConnected(true);
      
      // Update connection state
      const state = provider.getConnectionState(chainId);
      setConnectionState(state);

      // Subscribe to balance updates
      const unsubscribe = await provider.subscribeToBalance(
        address,
        chainId,
        (newBalance: bigint) => {
          // Create a minimal balance data structure to map
          const balanceData: GetBalanceReturnType = {
            value: newBalance,
            decimals: 18, // Native tokens are always 18 decimals
            symbol: chainId === 1 ? 'ETH' : 
                   chainId === 137 ? 'MATIC' :
                   chainId === 56 ? 'BNB' :
                   chainId === 43114 ? 'AVAX' : 'ETH',
            formatted: (Number(newBalance) / 10**18).toString(),
          };
          
          const mappedBalance = mapEvmBalanceToBalance(balanceData, address, chainId);
          setBalance(mappedBalance);
          setIsLoading(false);
          
          // Update connection state on each update
          const currentState = provider.getConnectionState(chainId);
          setConnectionState(currentState);
        },
        { pollInterval }
      );

      unsubscribeRef.current = unsubscribe;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'));
      setIsLoading(false);
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (wsProviderRef.current) {
      wsProviderRef.current.disconnect(chainId);
      setIsConnected(false);
      setConnectionState(ConnectionState.DISCONNECTED);
    }
  };

  const refetch = () => {
    if (isConnected) {
      setIsLoading(true);
      // Trigger a manual refresh by reconnecting
      disconnect();
      connect();
    }
  };

  useEffect(() => {
    if (autoConnect && address && enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [address, chainId, enabled, autoConnect]);

  useEffect(() => {
    return () => {
      disconnect();
      if (wsProviderRef.current) {
        wsProviderRef.current.cleanup();
      }
    };
  }, []);

  const isWebSocketConnected = connectionState === ConnectionState.CONNECTED_WS;

  return {
    balance,
    isLoading,
    isConnected,
    isWebSocketConnected,
    connectionState,
    error,
    refetch,
    connect,
    disconnect,
  };
};