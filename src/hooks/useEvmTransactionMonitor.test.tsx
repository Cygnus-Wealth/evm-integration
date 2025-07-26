import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEvmTransactionMonitor, TransactionData } from './useEvmTransactionMonitor';
import { WebSocketProvider } from '../providers/WebSocketProvider';

vi.mock('../providers/WebSocketProvider');

describe('useEvmTransactionMonitor', () => {
  let mockProvider: any;
  const mockAddress = '0x1234567890123456789012345678901234567890' as any;
  const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as any;

  beforeEach(() => {
    mockProvider = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      subscribeToTransactions: vi.fn(),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    (WebSocketProvider as any).mockImplementation(() => mockProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => 
        useEvmTransactionMonitor(undefined, 1)
      );

      expect(result.current.transactions).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should auto-connect when address is provided', async () => {
      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1, { autoConnect: true })
      );

      await waitFor(() => {
        expect(mockProvider.connect).toHaveBeenCalledWith(1);
        expect(mockProvider.subscribeToTransactions).toHaveBeenCalledWith(
          mockAddress,
          1,
          expect.any(Function)
        );
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it('should not auto-connect when disabled', () => {
      renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1, { 
          autoConnect: false,
          enabled: true 
        })
      );

      expect(mockProvider.connect).not.toHaveBeenCalled();
    });

    it('should not connect when disabled', () => {
      renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1, { enabled: false })
      );

      expect(mockProvider.connect).not.toHaveBeenCalled();
    });
  });

  describe('transaction monitoring', () => {
    it('should add incoming transactions', async () => {
      let transactionCallback: (tx: any) => void;
      
      mockProvider.subscribeToTransactions.mockImplementation((address, chainId, callback) => {
        transactionCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1, { 
          includeIncoming: true,
          includeOutgoing: false 
        })
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const incomingTx = {
        hash: mockTxHash,
        from: '0x9876543210987654321098765432109876543210',
        to: mockAddress,
        value: BigInt('1000000000000000000'),
        blockNumber: BigInt(12345),
      };

      act(() => {
        transactionCallback(incomingTx);
      });

      expect(result.current.transactions).toHaveLength(1);
      expect(result.current.transactions[0]).toMatchObject({
        hash: mockTxHash,
        from: '0x9876543210987654321098765432109876543210',
        to: mockAddress,
        value: BigInt('1000000000000000000'),
        status: 'confirmed',
      });
    });

    it('should add outgoing transactions', async () => {
      let transactionCallback: (tx: any) => void;
      
      mockProvider.subscribeToTransactions.mockImplementation((address, chainId, callback) => {
        transactionCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1, { 
          includeIncoming: false,
          includeOutgoing: true 
        })
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const outgoingTx = {
        hash: mockTxHash,
        from: mockAddress,
        to: '0x9876543210987654321098765432109876543210',
        value: BigInt('500000000000000000'),
        blockNumber: null,
      };

      act(() => {
        transactionCallback(outgoingTx);
      });

      expect(result.current.transactions).toHaveLength(1);
      expect(result.current.transactions[0]).toMatchObject({
        hash: mockTxHash,
        from: mockAddress,
        to: '0x9876543210987654321098765432109876543210',
        value: BigInt('500000000000000000'),
        status: 'pending',
      });
    });

    it('should filter out irrelevant transactions', async () => {
      let transactionCallback: (tx: any) => void;
      
      mockProvider.subscribeToTransactions.mockImplementation((address, chainId, callback) => {
        transactionCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const irrelevantTx = {
        hash: mockTxHash,
        from: '0x9999999999999999999999999999999999999999',
        to: '0x8888888888888888888888888888888888888888',
        value: BigInt('1000000000000000000'),
        blockNumber: BigInt(12345),
      };

      act(() => {
        transactionCallback(irrelevantTx);
      });

      expect(result.current.transactions).toHaveLength(0);
    });

    it('should avoid duplicate transactions', async () => {
      let transactionCallback: (tx: any) => void;
      
      mockProvider.subscribeToTransactions.mockImplementation((address, chainId, callback) => {
        transactionCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const tx = {
        hash: mockTxHash,
        from: mockAddress,
        to: '0x9876543210987654321098765432109876543210',
        value: BigInt('1000000000000000000'),
        blockNumber: BigInt(12345),
      };

      act(() => {
        transactionCallback(tx);
        transactionCallback(tx); // Same transaction again
      });

      expect(result.current.transactions).toHaveLength(1);
    });

    it('should limit transactions to 100', async () => {
      let transactionCallback: (tx: any) => void;
      
      mockProvider.subscribeToTransactions.mockImplementation((address, chainId, callback) => {
        transactionCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Add 102 transactions
      act(() => {
        for (let i = 0; i < 102; i++) {
          transactionCallback({
            hash: `0x${i.toString().padStart(64, '0')}`,
            from: mockAddress,
            to: '0x9876543210987654321098765432109876543210',
            value: BigInt('1000000000000000000'),
            blockNumber: BigInt(12345 + i),
          });
        }
      });

      expect(result.current.transactions).toHaveLength(100);
    });
  });

  describe('transaction filtering options', () => {
    it('should respect includeIncoming option', async () => {
      let transactionCallback: (tx: any) => void;
      
      mockProvider.subscribeToTransactions.mockImplementation((address, chainId, callback) => {
        transactionCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1, { 
          includeIncoming: false,
          includeOutgoing: true 
        })
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const incomingTx = {
        hash: mockTxHash,
        from: '0x9876543210987654321098765432109876543210',
        to: mockAddress,
        value: BigInt('1000000000000000000'),
        blockNumber: BigInt(12345),
      };

      act(() => {
        transactionCallback(incomingTx);
      });

      expect(result.current.transactions).toHaveLength(0);
    });

    it('should respect includeOutgoing option', async () => {
      let transactionCallback: (tx: any) => void;
      
      mockProvider.subscribeToTransactions.mockImplementation((address, chainId, callback) => {
        transactionCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1, { 
          includeIncoming: true,
          includeOutgoing: false 
        })
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const outgoingTx = {
        hash: mockTxHash,
        from: mockAddress,
        to: '0x9876543210987654321098765432109876543210',
        value: BigInt('1000000000000000000'),
        blockNumber: BigInt(12345),
      };

      act(() => {
        transactionCallback(outgoingTx);
      });

      expect(result.current.transactions).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockProvider.connect.mockRejectedValue(connectionError);

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.error).toEqual(connectionError);
        expect(result.current.isConnected).toBe(false);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle subscription errors', async () => {
      const subscriptionError = new Error('Subscription failed');
      mockProvider.subscribeToTransactions.mockRejectedValue(subscriptionError);

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.error).toEqual(subscriptionError);
        expect(result.current.isConnected).toBe(false);
      });
    });
  });

  describe('manual controls', () => {
    it('should connect manually', async () => {
      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1, { autoConnect: false })
      );

      expect(result.current.isConnected).toBe(false);

      await act(async () => {
        result.current.connect();
      });

      await waitFor(() => {
        expect(mockProvider.connect).toHaveBeenCalledWith(1);
      });
    });

    it('should disconnect manually', async () => {
      const mockUnsubscribe = vi.fn();
      mockProvider.subscribeToTransactions.mockResolvedValue(mockUnsubscribe);

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.disconnect();
      });

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mockProvider.disconnect).toHaveBeenCalledWith(1);
      expect(result.current.isConnected).toBe(false);
    });

    it('should clear transactions', async () => {
      let transactionCallback: (tx: any) => void;
      
      mockProvider.subscribeToTransactions.mockImplementation((address, chainId, callback) => {
        transactionCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const tx = {
        hash: mockTxHash,
        from: mockAddress,
        to: '0x9876543210987654321098765432109876543210',
        value: BigInt('1000000000000000000'),
        blockNumber: BigInt(12345),
      };

      act(() => {
        transactionCallback(tx);
      });

      expect(result.current.transactions).toHaveLength(1);

      act(() => {
        result.current.clearTransactions();
      });

      expect(result.current.transactions).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('should cleanup on unmount', async () => {
      const mockUnsubscribe = vi.fn();
      mockProvider.subscribeToTransactions.mockResolvedValue(mockUnsubscribe);

      const { result, unmount } = renderHook(() => 
        useEvmTransactionMonitor(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mockProvider.cleanup).toHaveBeenCalled();
    });

    it('should cleanup when address changes', async () => {
      const mockUnsubscribe = vi.fn();
      mockProvider.subscribeToTransactions.mockResolvedValue(mockUnsubscribe);

      const { result, rerender } = renderHook(
        ({ address }) => useEvmTransactionMonitor(address, 1),
        { initialProps: { address: mockAddress } }
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      await act(async () => {
        rerender({ address: '0x9876543210987654321098765432109876543210' as any });
      });

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mockProvider.disconnect).toHaveBeenCalledWith(1);
    });

    it('should cleanup when chainId changes', async () => {
      const mockUnsubscribe = vi.fn();
      mockProvider.subscribeToTransactions.mockResolvedValue(mockUnsubscribe);

      const { result, rerender } = renderHook(
        ({ chainId }) => useEvmTransactionMonitor(mockAddress, chainId),
        { initialProps: { chainId: 1 } }
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      await act(async () => {
        rerender({ chainId: 137 });
      });

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mockProvider.disconnect).toHaveBeenCalledWith(1);
    });
  });
});