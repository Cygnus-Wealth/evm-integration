import { useState, useEffect, useRef } from 'react';
import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';
import { WebSocketProvider } from '../providers/WebSocketProvider';
import { mapEvmBalanceToBalance } from '../utils/mappers';
import { GetBalanceReturnType } from 'wagmi/actions';

export interface UseEvmBalanceRealTimeOptions {
  enabled?: boolean;
  pollInterval?: number;
  autoConnect?: boolean;
}

export interface UseEvmBalanceRealTimeResult {
  balance: Balance | null;
  isLoading: boolean;
  isConnected: boolean;
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
  } = options;

  const [balance, setBalance] = useState<Balance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wsProviderRef = useRef<WebSocketProvider | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const initializeProvider = () => {
    if (!wsProviderRef.current) {
      wsProviderRef.current = new WebSocketProvider({
        autoReconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: 5,
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
        }
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

  return {
    balance,
    isLoading,
    isConnected,
    error,
    refetch,
    connect,
    disconnect,
  };
};