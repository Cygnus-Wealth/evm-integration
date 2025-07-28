import { useState, useEffect, useRef } from 'react';
import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';
import { EnhancedWebSocketProvider, ConnectionState } from '../providers/EnhancedWebSocketProvider';
import { mapTokenToAsset } from '../utils/mappers';
import { useToken } from 'wagmi';

export interface UseEvmTokenBalanceRealTimeOptions {
  enabled?: boolean;
  pollInterval?: number;
  autoConnect?: boolean;
  preferWebSocket?: boolean;
}

export interface UseEvmTokenBalanceRealTimeResult {
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

export const useEvmTokenBalanceRealTime = (
  address: Address | undefined,
  tokenAddress: Address,
  chainId: number = 1,
  options: UseEvmTokenBalanceRealTimeOptions = {}
): UseEvmTokenBalanceRealTimeResult => {
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

  // Get token metadata
  const { data: tokenData } = useToken({
    address: tokenAddress,
    chainId,
  });

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
    if (!address || !enabled || !tokenData) return;

    try {
      setIsLoading(true);
      setError(null);

      const provider = initializeProvider();
      await provider.connect(chainId);
      setIsConnected(true);
      
      // Update connection state
      const state = provider.getConnectionState(chainId);
      setConnectionState(state);

      // Subscribe to token balance updates
      const unsubscribe = await provider.subscribeToTokenBalance(
        address,
        tokenAddress,
        chainId,
        (newBalance: bigint) => {
          if (tokenData) {
            // Map token data to asset
            const asset = mapTokenToAsset(
              tokenAddress,
              tokenData.symbol || 'UNKNOWN',
              tokenData.name || 'Unknown Token',
              tokenData.decimals,
              chainId
            );

            // Create balance object
            const mappedBalance: Balance = {
              assetId: asset.id,
              asset: asset,
              amount: newBalance.toString(),
              value: {
                amount: Number(newBalance) / (10 ** tokenData.decimals),
                currency: 'USD',
                timestamp: new Date()
              },
            };
            
            setBalance(mappedBalance);
            setIsLoading(false);
            
            // Update connection state on each update
            const currentState = provider.getConnectionState(chainId);
            setConnectionState(currentState);
          }
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
    if (autoConnect && address && enabled && tokenData) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [address, tokenAddress, chainId, enabled, autoConnect, tokenData]);

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