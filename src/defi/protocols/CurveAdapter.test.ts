import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Address } from 'viem';
import { Chain, AssetType } from '@cygnus-wealth/data-models';
import { CurveAdapter } from './CurveAdapter.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('CurveAdapter', () => {
  let adapter: CurveAdapter;
  const testAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

  // Mock Curve API pool data
  const mockPoolData = [
    {
      id: '3pool',
      name: '3pool',
      address: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
      lpTokenAddress: '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490',
      coins: [
        {
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          symbol: 'USDT',
          decimals: '6',
        },
        {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          symbol: 'USDC',
          decimals: '6',
        },
        {
          address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          symbol: 'DAI',
          decimals: '18',
        },
      ],
      usdTotal: 500000000,
      totalSupply: '480000000000000000000000000',
    },
    {
      id: 'steth',
      name: 'stETH/ETH',
      address: '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022',
      lpTokenAddress: '0x06325440D014e39736583c165C2963BA99fAf14E',
      coins: [
        {
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          decimals: '18',
        },
        {
          address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
          symbol: 'stETH',
          decimals: '18',
        },
      ],
      usdTotal: 1200000000,
      totalSupply: '350000000000000000000000',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new CurveAdapter();
  });

  describe('protocolName', () => {
    it('should return "Curve Finance"', () => {
      expect(adapter.protocolName).toBe('Curve Finance');
    });
  });

  describe('supportedChains', () => {
    it('should support multiple EVM chains', () => {
      expect(adapter.supportedChains).toContain(1);     // Ethereum
      expect(adapter.supportedChains).toContain(137);   // Polygon
      expect(adapter.supportedChains).toContain(42161); // Arbitrum
      expect(adapter.supportedChains).toContain(10);    // Optimism
      expect(adapter.supportedChains).toContain(8453);  // Base
      expect(adapter.supportedChains.length).toBeGreaterThan(0);
    });
  });

  describe('supportsChain', () => {
    it('should return true for supported chains', () => {
      expect(adapter.supportsChain(1)).toBe(true);
      expect(adapter.supportsChain(137)).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(adapter.supportsChain(999999)).toBe(false);
    });
  });

  describe('getLiquidityPositions', () => {
    it('should return empty array for unsupported chain', async () => {
      const result = await adapter.getLiquidityPositions(testAddress, 999999);
      expect(result).toEqual([]);
    });

    it('should fetch pools and user LP balances', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { poolData: mockPoolData },
        }),
      });

      const mockReadContract = vi.fn()
        // 3pool: balanceOf (user has LP tokens)
        .mockResolvedValueOnce(BigInt('5000000000000000000000')) // 5000 LP tokens
        // 3pool: totalSupply
        .mockResolvedValueOnce(BigInt('480000000000000000000000000'))
        // 3pool: coin balances (3 coins)
        .mockResolvedValueOnce(BigInt('160000000000000')) // USDT (6 dec)
        .mockResolvedValueOnce(BigInt('170000000000000')) // USDC (6 dec)
        .mockResolvedValueOnce(BigInt('150000000000000000000000000')) // DAI (18 dec)
        // steth pool: balanceOf (user has no LP tokens)
        .mockResolvedValueOnce(BigInt('0'));

      adapter = new CurveAdapter({ readContract: mockReadContract });

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      // Should only return positions where user has LP balance > 0
      expect(positions).toHaveLength(1);
      expect(positions[0].protocol).toBe('Curve Finance');
      expect(positions[0].chain).toBe(Chain.ETHEREUM);
      expect(positions[0].poolName).toBe('3pool');
      expect(positions[0].poolAddress).toBe('0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7');
      expect(positions[0].tokens).toHaveLength(3);
      expect(positions[0].lpTokenBalance).toBeDefined();
      expect(parseFloat(positions[0].lpTokenBalance!)).toBeGreaterThan(0);
    });

    it('should calculate pool share correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { poolData: [mockPoolData[0]] },
        }),
      });

      const userBalance = BigInt('4800000000000000000000000'); // 4.8M LP
      const totalSupply = BigInt('480000000000000000000000000'); // 480M total

      const mockReadContract = vi.fn()
        .mockResolvedValueOnce(userBalance)
        .mockResolvedValueOnce(totalSupply)
        .mockResolvedValueOnce(BigInt('160000000000000'))
        .mockResolvedValueOnce(BigInt('170000000000000'))
        .mockResolvedValueOnce(BigInt('150000000000000000000000000'));

      adapter = new CurveAdapter({ readContract: mockReadContract });

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions).toHaveLength(1);
      // 4.8M / 480M = 0.01 = 1%
      expect(positions[0].share).toBeCloseTo(0.01, 4);
    });

    it('should populate token balances proportional to pool share', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { poolData: [mockPoolData[1]] }, // stETH pool (2 tokens)
        }),
      });

      const userBalance = BigInt('35000000000000000000000'); // 35K LP
      const totalSupply = BigInt('350000000000000000000000'); // 350K total → 10% share

      const mockReadContract = vi.fn()
        .mockResolvedValueOnce(userBalance)
        .mockResolvedValueOnce(totalSupply)
        // Pool balances for ETH and stETH
        .mockResolvedValueOnce(BigInt('175000000000000000000000')) // 175K ETH
        .mockResolvedValueOnce(BigInt('180000000000000000000000')); // 180K stETH

      adapter = new CurveAdapter({ readContract: mockReadContract });

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions).toHaveLength(1);
      expect(positions[0].tokens).toHaveLength(2);
      expect(positions[0].tokens[0].asset.symbol).toBe('ETH');
      expect(positions[0].tokens[1].asset.symbol).toBe('stETH');
      // User has 10% share, so ~17500 ETH and ~18000 stETH
      expect(parseFloat(positions[0].tokens[0].amount)).toBeCloseTo(17500, -1);
      expect(parseFloat(positions[0].tokens[1].amount)).toBeCloseTo(18000, -1);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

      const positions = await adapter.getLiquidityPositions(testAddress, 1);
      expect(positions).toEqual([]);
    });

    it('should handle on-chain read failures for individual pools', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { poolData: [mockPoolData[0]] },
        }),
      });

      const mockReadContract = vi.fn()
        .mockRejectedValueOnce(new Error('RPC error'));

      adapter = new CurveAdapter({ readContract: mockReadContract });

      const positions = await adapter.getLiquidityPositions(testAddress, 1);
      expect(positions).toEqual([]);
    });

    it('should include metadata with pool details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { poolData: [mockPoolData[0]] },
        }),
      });

      const mockReadContract = vi.fn()
        .mockResolvedValueOnce(BigInt('1000000000000000000'))
        .mockResolvedValueOnce(BigInt('480000000000000000000000000'))
        .mockResolvedValueOnce(BigInt('160000000000000'))
        .mockResolvedValueOnce(BigInt('170000000000000'))
        .mockResolvedValueOnce(BigInt('150000000000000000000000000'));

      adapter = new CurveAdapter({ readContract: mockReadContract });

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions).toHaveLength(1);
      expect(positions[0].metadata).toBeDefined();
      expect(positions[0].metadata!['poolId']).toBe('3pool');
      expect(positions[0].metadata!['lpTokenAddress']).toBe('0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490');
      expect(positions[0].metadata!['tvlUsd']).toBe(500000000);
    });

    it('should return empty when readContract is not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { poolData: mockPoolData },
        }),
      });

      // Adapter without readContract
      adapter = new CurveAdapter();

      const positions = await adapter.getLiquidityPositions(testAddress, 1);
      expect(positions).toEqual([]);
    });

    it('should handle non-ok API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      adapter = new CurveAdapter({ readContract: vi.fn() });

      const positions = await adapter.getLiquidityPositions(testAddress, 1);
      expect(positions).toEqual([]);
    });
  });

  describe('getLendingPositions', () => {
    it('should return empty array (Curve is not a lending protocol)', async () => {
      const result = await adapter.getLendingPositions(testAddress, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getStakedPositions', () => {
    it('should return empty array (Curve models positions as liquidity)', async () => {
      const result = await adapter.getStakedPositions(testAddress, 1);
      expect(result).toEqual([]);
    });
  });
});
