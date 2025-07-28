import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEvmTokenBalance } from './useEvmTokenBalance';
import { useBalance, useToken } from 'wagmi';
import { Address } from 'viem';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useBalance: vi.fn(),
  useToken: vi.fn(),
}));

const mockAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f06a70';
const mockTokenAddress: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC

describe('useEvmTokenBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return token balance when data is available', async () => {
    const mockTokenData = {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    };

    const mockBalanceData = {
      value: BigInt('1000000'), // 1 USDC (6 decimals)
      formatted: '1.0',
      decimals: 6,
      symbol: 'USDC',
    };

    vi.mocked(useToken).mockReturnValue({
      data: mockTokenData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useBalance).mockReturnValue({
      data: mockBalanceData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { result } = renderHook(() =>
      useEvmTokenBalance({
        address: mockAddress,
        tokenAddress: mockTokenAddress,
        chainId: 1,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.balance).toBeDefined();
    expect(result.current.balance?.asset.symbol).toBe('USDC');
    expect(result.current.balance?.asset.name).toBe('USD Coin');
    expect(result.current.balance?.asset.decimals).toBe(6);
    expect(result.current.balance?.amount).toBe('1000000');
    expect(result.current.error).toBeNull();
  });

  it('should handle loading state', () => {
    vi.mocked(useToken).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useBalance).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { result } = renderHook(() =>
      useEvmTokenBalance({
        address: mockAddress,
        tokenAddress: mockTokenAddress,
      })
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.balance).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('should handle errors', () => {
    const mockError = new Error('Failed to fetch balance');

    vi.mocked(useToken).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useBalance).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: mockError,
      refetch: vi.fn(),
    } as any);

    const { result } = renderHook(() =>
      useEvmTokenBalance({
        address: mockAddress,
        tokenAddress: mockTokenAddress,
      })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.balance).toBeUndefined();
    expect(result.current.error).toBe(mockError);
  });

  it('should work with different chain IDs', async () => {
    const mockTokenData = {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
    };

    const mockBalanceData = {
      value: BigInt('5000000'), // 5 USDT
      formatted: '5.0',
      decimals: 6,
      symbol: 'USDT',
    };

    vi.mocked(useToken).mockReturnValue({
      data: mockTokenData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useBalance).mockReturnValue({
      data: mockBalanceData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { result } = renderHook(() =>
      useEvmTokenBalance({
        address: mockAddress,
        tokenAddress: mockTokenAddress,
        chainId: 137, // Polygon
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.balance).toBeDefined();
    expect(result.current.balance?.asset.id).toContain('polygon');
  });

  it('should return undefined balance when address is not provided', () => {
    vi.mocked(useToken).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useBalance).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { result } = renderHook(() =>
      useEvmTokenBalance({
        address: undefined,
        tokenAddress: mockTokenAddress,
      })
    );

    expect(result.current.balance).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});