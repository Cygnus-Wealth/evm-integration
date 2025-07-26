import { useState, useEffect, useRef, useCallback } from 'react';
import { Address, Hash } from 'viem';
import { Transaction } from '@cygnus-wealth/data-models';
import { WebSocketProvider } from '../providers/WebSocketProvider';
import { mapEvmTransaction } from '../utils/mappers';

export interface UseEvmTransactionMonitorOptions {
  enabled?: boolean;
  includeIncoming?: boolean;
  includeOutgoing?: boolean;
  autoConnect?: boolean;
  accountId?: string; // Optional account ID for the Transaction model
}

export interface UseEvmTransactionMonitorResult {
  transactions: Transaction[];
  isLoading: boolean;
  isConnected: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  clearTransactions: () => void;
}

export const useEvmTransactionMonitor = (
  address: Address | undefined,
  chainId: number = 1,
  options: UseEvmTransactionMonitorOptions = {}
): UseEvmTransactionMonitorResult => {
  const {
    enabled = true,
    includeIncoming = true,
    includeOutgoing = true,
    autoConnect = true,
    accountId = address || 'unknown',
  } = options;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wsProviderRef = useRef<WebSocketProvider | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const seenTransactionsRef = useRef<Set<Hash>>(new Set());

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

  const addTransaction = useCallback((txData: any) => {
    const transactionHash = txData.hash as Hash;
    
    // Avoid duplicate transactions
    if (seenTransactionsRef.current.has(transactionHash)) {
      return;
    }

    // Filter based on address and options
    const isIncoming = txData.to === address && includeIncoming;
    const isOutgoing = txData.from === address && includeOutgoing;
    
    if (!isIncoming && !isOutgoing) {
      return;
    }

    seenTransactionsRef.current.add(transactionHash);

    // Map the raw transaction data to our standard Transaction model
    const transaction = mapEvmTransaction(
      {
        hash: transactionHash,
        from: txData.from,
        to: txData.to,
        value: txData.value || 0n,
        blockNumber: txData.blockNumber,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        gasUsed: txData.gasUsed,
        gasPrice: txData.gasPrice,
        status: txData.status || 'success',
      },
      chainId,
      accountId
    );

    setTransactions(prev => [transaction, ...prev].slice(0, 100)); // Keep last 100 transactions
  }, [address, includeIncoming, includeOutgoing, chainId, accountId]);

  const connect = async () => {
    if (!address || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      const provider = initializeProvider();
      await provider.connect(chainId);
      setIsConnected(true);

      // Subscribe to transaction updates
      const unsubscribe = await provider.subscribeToTransactions(
        address,
        chainId,
        addTransaction
      );

      unsubscribeRef.current = unsubscribe;
      setIsLoading(false);
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

  const clearTransactions = useCallback(() => {
    setTransactions([]);
    seenTransactionsRef.current.clear();
  }, []);

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
    transactions,
    isLoading,
    isConnected,
    error,
    connect,
    disconnect,
    clearTransactions,
  };
};