import { useState, useEffect } from 'react';
import { Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { Transaction } from '@cygnus-wealth/data-models';
import { mapEvmTransaction } from '../utils/mappers';

interface UseEvmTransactionsParams {
  address?: Address;
  chainId?: number;
  limit?: number;
  accountId?: string;
}

interface UseEvmTransactionsReturn {
  transactions: Transaction[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useEvmTransactions = ({
  address,
  chainId = 1,
  limit = 100,
  accountId,
}: UseEvmTransactionsParams): UseEvmTransactionsReturn => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const publicClient = usePublicClient({ chainId });

  const fetchTransactions = async () => {
    if (!address || !publicClient) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get the latest block number
      const blockNumber = await publicClient.getBlockNumber();
      
      // Note: This is a simplified implementation. In production, you would want to:
      // 1. Use an indexing service like Etherscan API or The Graph
      // 2. Implement pagination for large transaction histories
      // 3. Cache results to avoid re-fetching
      
      // For now, we'll fetch recent blocks and filter for the address
      const blocks = Math.min(limit, 100); // Limit to 100 blocks for performance
      const startBlock = blockNumber - BigInt(blocks);
      
      const txPromises: Promise<Transaction | null>[] = [];
      
      // Fetch transactions from recent blocks
      for (let i = startBlock; i <= blockNumber; i++) {
        const block = await publicClient.getBlock({
          blockNumber: i,
          includeTransactions: true
        });
        
        if (block.transactions) {
          for (const tx of block.transactions) {
            if (typeof tx === 'object' && (tx.from === address || tx.to === address)) {
              // Get transaction receipt for status
              const receiptPromise = publicClient.getTransactionReceipt({ hash: tx.hash })
                .then(receipt => {
                  const mappedTx = mapEvmTransaction(
                    {
                      hash: tx.hash,
                      from: tx.from,
                      to: tx.to,
                      value: tx.value,
                      blockNumber: tx.blockNumber || i,
                      timestamp: block.timestamp,
                      gasUsed: receipt.gasUsed,
                      gasPrice: tx.gasPrice,
                      status: receipt.status === 'success' ? 'success' : 'reverted',
                    },
                    chainId,
                    accountId || address
                  );
                  return mappedTx;
                })
                .catch(() => null);
              
              txPromises.push(receiptPromise);
            }
          }
        }
      }
      
      const txResults = await Promise.all(txPromises);
      const validTransactions = txResults.filter((tx: Transaction | null): tx is Transaction => tx !== null);
      
      // Sort by timestamp descending (newest first)
      validTransactions.sort((a: Transaction, b: Transaction) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setTransactions(validTransactions.slice(0, limit));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch transactions'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [address, chainId, limit, publicClient]);

  return {
    transactions,
    isLoading,
    error,
    refetch: fetchTransactions,
  };
};