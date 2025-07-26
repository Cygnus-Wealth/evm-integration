import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEvmBalanceRealTime } from './useEvmBalanceRealTime';
import { WebSocketProvider } from '../providers/WebSocketProvider';

vi.mock('../providers/WebSocketProvider');

describe('useEvmBalanceRealTime', () => {
  let mockProvider: any;
  const mockAddress = '0x1234567890123456789012345678901234567890' as any;

  beforeEach(() => {
    mockProvider = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      subscribeToBalance: vi.fn(),
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
        useEvmBalanceRealTime(undefined, 1)
      );

      expect(result.current.balance).toBe(null);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should auto-connect when address is provided', async () => {
      mockProvider.subscribeToBalance.mockImplementation((address, chainId, callback) => {
        callback(BigInt('1000000000000000000'));
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1, { autoConnect: true })
      );

      await waitFor(() => {
        expect(mockProvider.connect).toHaveBeenCalledWith(1);
        expect(mockProvider.subscribeToBalance).toHaveBeenCalledWith(
          mockAddress,
          1,
          expect.any(Function)
        );
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.balance).toBe(BigInt('1000000000000000000'));
    });

    it('should not auto-connect when disabled', () => {
      renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1, { 
          autoConnect: false,
          enabled: true 
        })
      );

      expect(mockProvider.connect).not.toHaveBeenCalled();
    });

    it('should not connect when disabled', () => {
      renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1, { enabled: false })
      );

      expect(mockProvider.connect).not.toHaveBeenCalled();
    });
  });

  describe('balance updates', () => {
    it('should update balance when subscription fires', async () => {
      let balanceCallback: (balance: bigint) => void;
      
      mockProvider.subscribeToBalance.mockImplementation((address, chainId, callback) => {
        balanceCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        balanceCallback(BigInt('2000000000000000000'));
      });

      expect(result.current.balance).toBe(BigInt('2000000000000000000'));
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle multiple balance updates', async () => {
      let balanceCallback: (balance: bigint) => void;
      
      mockProvider.subscribeToBalance.mockImplementation((address, chainId, callback) => {
        balanceCallback = callback;
        return vi.fn();
      });

      const { result } = renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        balanceCallback(BigInt('1000000000000000000'));
      });

      expect(result.current.balance).toBe(BigInt('1000000000000000000'));

      act(() => {
        balanceCallback(BigInt('3000000000000000000'));
      });

      expect(result.current.balance).toBe(BigInt('3000000000000000000'));
    });
  });

  describe('error handling', () => {
    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockProvider.connect.mockRejectedValue(connectionError);

      const { result } = renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.error).toEqual(connectionError);
        expect(result.current.isConnected).toBe(false);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle subscription errors', async () => {
      const subscriptionError = new Error('Subscription failed');
      mockProvider.subscribeToBalance.mockRejectedValue(subscriptionError);

      const { result } = renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1)
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
        useEvmBalanceRealTime(mockAddress, 1, { autoConnect: false })
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
      mockProvider.subscribeToBalance.mockResolvedValue(mockUnsubscribe);

      const { result } = renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1)
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

    it('should refetch by reconnecting', async () => {
      const mockUnsubscribe = vi.fn();
      mockProvider.subscribeToBalance.mockResolvedValue(mockUnsubscribe);

      const { result } = renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1)
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      await act(async () => {
        result.current.refetch();
      });

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mockProvider.disconnect).toHaveBeenCalledWith(1);
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup on unmount', async () => {
      const mockUnsubscribe = vi.fn();
      mockProvider.subscribeToBalance.mockResolvedValue(mockUnsubscribe);

      const { result, unmount } = renderHook(() => 
        useEvmBalanceRealTime(mockAddress, 1)
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
      mockProvider.subscribeToBalance.mockResolvedValue(mockUnsubscribe);

      const { result, rerender } = renderHook(
        ({ address }) => useEvmBalanceRealTime(address, 1),
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
      mockProvider.subscribeToBalance.mockResolvedValue(mockUnsubscribe);

      const { result, rerender } = renderHook(
        ({ chainId }) => useEvmBalanceRealTime(mockAddress, chainId),
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