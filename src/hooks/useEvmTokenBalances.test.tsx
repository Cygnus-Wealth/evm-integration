import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEvmTokenBalances } from './useEvmTokenBalances';
import { useBalance, useToken } from 'wagmi';
import { Address } from 'viem';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useBalance: vi.fn(),
  useToken: vi.fn(),
}));

const mockAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f06a70';
const mockUSDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const mockUSDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const mockDAI: Address = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

describe('useEvmTokenBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return multiple token balances', async () => {
    // Mock data for each token
    const tokenMocks = {
      [mockUSDC]: {
        token: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        balance: { value: BigInt('1000000'), formatted: '1.0', decimals: 6, symbol: 'USDC' },
      },
      [mockUSDT]: {
        token: { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
        balance: { value: BigInt('2000000'), formatted: '2.0', decimals: 6, symbol: 'USDT' },
      },
      [mockDAI]: {
        token: { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
        balance: { value: BigInt('3000000000000000000'), formatted: '3.0', decimals: 18, symbol: 'DAI' },
      },
    };

    // Set up mocks to return different data based on token address
    vi.mocked(useToken).mockImplementation(({ address }) => {
      const mock = tokenMocks[address as keyof typeof tokenMocks];
      return {
        data: mock?.token,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any;
    });

    vi.mocked(useBalance).mockImplementation(({ token }) => {
      const mock = tokenMocks[token as keyof typeof tokenMocks];
      return {
        data: mock?.balance,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any;
    });

    const { result } = renderHook(() =>
      useEvmTokenBalances({
        address: mockAddress,
        tokens: [
          { tokenAddress: mockUSDC },
          { tokenAddress: mockUSDT },
          { tokenAddress: mockDAI },
        ],
        chainId: 1,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.balances).toHaveLength(3);
    
    // Check USDC balance
    const usdcBalance = result.current.balances.find(b => b.tokenAddress === mockUSDC);
    expect(usdcBalance?.balance?.asset.symbol).toBe('USDC');
    expect(usdcBalance?.balance?.amount).toBe('1000000');
    
    // Check USDT balance
    const usdtBalance = result.current.balances.find(b => b.tokenAddress === mockUSDT);
    expect(usdtBalance?.balance?.asset.symbol).toBe('USDT');
    expect(usdtBalance?.balance?.amount).toBe('2000000');
    
    // Check DAI balance
    const daiBalance = result.current.balances.find(b => b.tokenAddress === mockDAI);
    expect(daiBalance?.balance?.asset.symbol).toBe('DAI');
    expect(daiBalance?.balance?.amount).toBe('3000000000000000000');
  });

  it('should handle disabled tokens', async () => {
    vi.mocked(useToken).mockImplementation(({ enabled }) => {
      if (!enabled) return { data: undefined, isLoading: false, error: null, refetch: vi.fn() } as any;
      return {
        data: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any;
    });

    vi.mocked(useBalance).mockImplementation(({ enabled }) => {
      if (!enabled) return { data: undefined, isLoading: false, error: null, refetch: vi.fn() } as any;
      return {
        data: { value: BigInt('1000000'), formatted: '1.0', decimals: 6, symbol: 'USDC' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any;
    });

    const { result } = renderHook(() =>
      useEvmTokenBalances({
        address: mockAddress,
        tokens: [
          { tokenAddress: mockUSDC, enabled: true },
          { tokenAddress: mockUSDT, enabled: false },
        ],
        chainId: 1,
      })
    );

    await waitFor(() => {
      expect(result.current.isAnyLoading).toBe(false);
    });

    const enabledBalance = result.current.balances.find(b => b.tokenAddress === mockUSDC);
    const disabledBalance = result.current.balances.find(b => b.tokenAddress === mockUSDT);

    expect(enabledBalance?.balance).toBeDefined();
    expect(disabledBalance?.balance).toBeUndefined();
  });

  it('should handle errors for individual tokens', async () => {
    const mockError = new Error('Failed to fetch USDT balance');

    vi.mocked(useToken).mockReturnValue({
      data: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useBalance).mockImplementation(({ token }) => {
      if (token === mockUSDT) {
        return {
          data: undefined,
          isLoading: false,
          error: mockError,
          refetch: vi.fn(),
        } as any;
      }
      return {
        data: { value: BigInt('1000000'), formatted: '1.0', decimals: 6, symbol: 'USDC' },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any;
    });

    const { result } = renderHook(() =>
      useEvmTokenBalances({
        address: mockAddress,
        tokens: [
          { tokenAddress: mockUSDC },
          { tokenAddress: mockUSDT },
        ],
        chainId: 1,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.errors[0].tokenAddress).toBe(mockUSDT);
    expect(result.current.errors[0].error).toBe(mockError);
  });

  it('should handle loading states correctly', () => {
    vi.mocked(useToken).mockImplementation(({ address }) => {
      return {
        data: undefined,
        isLoading: address === mockUSDC,
        error: null,
        refetch: vi.fn(),
      } as any;
    });

    vi.mocked(useBalance).mockImplementation(({ token }) => {
      return {
        data: undefined,
        isLoading: token === mockUSDC,
        error: null,
        refetch: vi.fn(),
      } as any;
    });

    const { result } = renderHook(() =>
      useEvmTokenBalances({
        address: mockAddress,
        tokens: [
          { tokenAddress: mockUSDC },
          { tokenAddress: mockUSDT },
        ],
        chainId: 1,
      })
    );

    expect(result.current.isAnyLoading).toBe(true);
    expect(result.current.isLoading).toBe(false); // Not all are loading
  });

  it('should refetch all tokens', () => {
    const refetchMock = vi.fn();
    
    vi.mocked(useToken).mockReturnValue({
      data: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    } as any);

    vi.mocked(useBalance).mockReturnValue({
      data: { value: BigInt('1000000'), formatted: '1.0', decimals: 6, symbol: 'USDC' },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    } as any);

    const { result } = renderHook(() =>
      useEvmTokenBalances({
        address: mockAddress,
        tokens: [
          { tokenAddress: mockUSDC },
          { tokenAddress: mockUSDT },
        ],
        chainId: 1,
      })
    );

    result.current.refetch();

    // Should be called twice for each token (once for useToken, once for useBalance)
    expect(refetchMock).toHaveBeenCalledTimes(4);
  });

  it('should refetch specific token', () => {
    const refetchUSDC = vi.fn();
    const refetchUSDT = vi.fn();
    
    vi.mocked(useToken).mockImplementation(({ address }) => ({
      data: { symbol: 'TOKEN', name: 'Token', decimals: 6 },
      isLoading: false,
      error: null,
      refetch: address === mockUSDC ? refetchUSDC : refetchUSDT,
    } as any));

    vi.mocked(useBalance).mockImplementation(({ token }) => ({
      data: { value: BigInt('1000000'), formatted: '1.0', decimals: 6, symbol: 'TOKEN' },
      isLoading: false,
      error: null,
      refetch: token === mockUSDC ? refetchUSDC : refetchUSDT,
    } as any));

    const { result } = renderHook(() =>
      useEvmTokenBalances({
        address: mockAddress,
        tokens: [
          { tokenAddress: mockUSDC },
          { tokenAddress: mockUSDT },
        ],
        chainId: 1,
      })
    );

    result.current.refetchToken(mockUSDC);

    expect(refetchUSDC).toHaveBeenCalledTimes(2); // Once for token, once for balance
    expect(refetchUSDT).not.toHaveBeenCalled();
  });
});