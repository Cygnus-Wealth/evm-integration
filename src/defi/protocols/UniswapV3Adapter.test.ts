import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Address } from 'viem';
import { Chain, AssetType } from '@cygnus-wealth/data-models';
import { UniswapV3Adapter, UNISWAP_V3_DEPLOYMENTS } from './UniswapV3Adapter.js';

describe('UniswapV3Adapter', () => {
  let adapter: UniswapV3Adapter;
  const testAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
  let mockReadContract: ReturnType<typeof vi.fn>;

  // Uniswap V3 position data for an ETH/USDC position
  // tick range: 192000 to 198000 (roughly ~$1000-$2000 range)
  // current tick: 195000 (in-range)
  const mockPositionData = {
    nonce: 0n,
    operator: '0x0000000000000000000000000000000000000000' as Address,
    token0: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address, // WETH
    token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // USDC
    fee: 3000, // 0.3% fee tier
    tickLower: 192000,
    tickUpper: 198000,
    liquidity: BigInt('50000000000000000'), // liquidity amount
    feeGrowthInside0LastX128: 0n,
    feeGrowthInside1LastX128: 0n,
    tokensOwed0: BigInt('100000000000000'), // ~0.0001 ETH uncollected fees
    tokensOwed1: BigInt('500000'), // 0.5 USDC uncollected fees
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadContract = vi.fn();
    adapter = new UniswapV3Adapter({ readContract: mockReadContract });
  });

  describe('protocolName', () => {
    it('should return "Uniswap V3"', () => {
      expect(adapter.protocolName).toBe('Uniswap V3');
    });
  });

  describe('supportedChains', () => {
    it('should support Ethereum, Polygon, Arbitrum, Optimism, Base', () => {
      expect(adapter.supportedChains).toContain(1);     // Ethereum
      expect(adapter.supportedChains).toContain(137);   // Polygon
      expect(adapter.supportedChains).toContain(42161); // Arbitrum
      expect(adapter.supportedChains).toContain(10);    // Optimism
      expect(adapter.supportedChains).toContain(8453);  // Base
    });

    it('should not support unsupported chains', () => {
      expect(adapter.supportedChains).not.toContain(56);    // BSC
      expect(adapter.supportedChains).not.toContain(43114); // Avalanche
    });
  });

  describe('supportsChain', () => {
    it('should return true for supported chains', () => {
      expect(adapter.supportsChain(1)).toBe(true);
      expect(adapter.supportsChain(137)).toBe(true);
      expect(adapter.supportsChain(42161)).toBe(true);
      expect(adapter.supportsChain(10)).toBe(true);
      expect(adapter.supportsChain(8453)).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(adapter.supportsChain(999999)).toBe(false);
      expect(adapter.supportsChain(56)).toBe(false);
    });
  });

  describe('getLiquidityPositions', () => {
    it('should return empty array for unsupported chain', async () => {
      const result = await adapter.getLiquidityPositions(testAddress, 999999);
      expect(result).toEqual([]);
    });

    it('should return empty array when readContract is not provided', async () => {
      adapter = new UniswapV3Adapter();
      const result = await adapter.getLiquidityPositions(testAddress, 1);
      expect(result).toEqual([]);
    });

    it('should return empty array when user has no positions', async () => {
      // balanceOf returns 0
      mockReadContract.mockResolvedValueOnce(0n);

      const result = await adapter.getLiquidityPositions(testAddress, 1);
      expect(result).toEqual([]);
    });

    it('should fetch liquidity positions for a user with one position', async () => {
      mockReadContract
        // balanceOf(address) -> 1 position
        .mockResolvedValueOnce(1n)
        // tokenOfOwnerByIndex(address, 0) -> tokenId 12345
        .mockResolvedValueOnce(12345n)
        // positions(12345) -> position data
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          mockPositionData.tickLower,
          mockPositionData.tickUpper,
          mockPositionData.liquidity,
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          mockPositionData.tokensOwed0,
          mockPositionData.tokensOwed1,
        ])
        // token0 symbol
        .mockResolvedValueOnce('WETH')
        // token0 name
        .mockResolvedValueOnce('Wrapped Ether')
        // token0 decimals
        .mockResolvedValueOnce(18)
        // token1 symbol
        .mockResolvedValueOnce('USDC')
        // token1 name
        .mockResolvedValueOnce('USD Coin')
        // token1 decimals
        .mockResolvedValueOnce(6)
        // slot0 of pool (for current tick) -> sqrtPriceX96, tick, etc.
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'), // sqrtPriceX96
          195000,  // current tick (in range)
          0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions).toHaveLength(1);
      expect(positions[0].protocol).toBe('Uniswap V3');
      expect(positions[0].chain).toBe(Chain.ETHEREUM);
      expect(positions[0].poolName).toBe('WETH/USDC');
      expect(positions[0].tokens).toHaveLength(2);
      expect(positions[0].tokens[0].asset.symbol).toBe('WETH');
      expect(positions[0].tokens[1].asset.symbol).toBe('USDC');
      expect(positions[0].id).toContain('uniswap-v3');
    });

    it('should include concentrated liquidity metadata', async () => {
      mockReadContract
        .mockResolvedValueOnce(1n) // balanceOf
        .mockResolvedValueOnce(12345n) // tokenOfOwnerByIndex
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          mockPositionData.tickLower,
          mockPositionData.tickUpper,
          mockPositionData.liquidity,
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          mockPositionData.tokensOwed0,
          mockPositionData.tokensOwed1,
        ])
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions[0].metadata).toBeDefined();
      expect(positions[0].metadata!.tokenId).toBe('12345');
      expect(positions[0].metadata!.tickLower).toBe(192000);
      expect(positions[0].metadata!.tickUpper).toBe(198000);
      expect(positions[0].metadata!.feeTier).toBe(3000);
      expect(positions[0].metadata!.inRange).toBe(true);
    });

    it('should detect out-of-range positions', async () => {
      mockReadContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(99999n)
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          200000, // tickLower above current tick
          210000, // tickUpper above current tick
          mockPositionData.liquidity,
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          mockPositionData.tokensOwed0,
          mockPositionData.tokensOwed1,
        ])
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, // current tick below the position range
          0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions[0].metadata!.inRange).toBe(false);
    });

    it('should include uncollected fees in metadata', async () => {
      mockReadContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(12345n)
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          mockPositionData.tickLower,
          mockPositionData.tickUpper,
          mockPositionData.liquidity,
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          BigInt('500000000000000'), // tokensOwed0 ~0.0005 ETH
          BigInt('2000000'), // tokensOwed1 2.0 USDC
        ])
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions[0].metadata!.uncollectedFees).toBeDefined();
      expect(positions[0].metadata!.uncollectedFees.token0).toBe('0.0005');
      expect(positions[0].metadata!.uncollectedFees.token1).toBe('2');
    });

    it('should skip positions with zero liquidity', async () => {
      mockReadContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(12345n)
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          mockPositionData.tickLower,
          mockPositionData.tickUpper,
          0n, // zero liquidity (closed position)
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          0n, // no uncollected fees
          0n,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);
      expect(positions).toHaveLength(0);
    });

    it('should handle multiple positions', async () => {
      mockReadContract
        // balanceOf -> 2 positions
        .mockResolvedValueOnce(2n)
        // tokenOfOwnerByIndex(0) -> 100
        .mockResolvedValueOnce(100n)
        // tokenOfOwnerByIndex(1) -> 200
        .mockResolvedValueOnce(200n)
        // positions(100) - WETH/USDC
        .mockResolvedValueOnce([
          0n, '0x0000000000000000000000000000000000000000' as Address,
          '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          3000, 192000, 198000,
          BigInt('50000000000000000'),
          0n, 0n, BigInt('100000000000000'), BigInt('500000'),
        ])
        // token0 symbol/name/decimals for position 100
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        // token1 symbol/name/decimals for position 100
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        // slot0 for pool of position 100
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ])
        // positions(200) - WETH/DAI
        .mockResolvedValueOnce([
          0n, '0x0000000000000000000000000000000000000000' as Address,
          '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
          '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address,
          500, 190000, 200000,
          BigInt('30000000000000000'),
          0n, 0n, 0n, 0n,
        ])
        // token0 symbol/name/decimals for position 200
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        // token1 symbol/name/decimals for position 200
        .mockResolvedValueOnce('DAI')
        .mockResolvedValueOnce('Dai Stablecoin')
        .mockResolvedValueOnce(18)
        // slot0 for pool of position 200
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions).toHaveLength(2);
      expect(positions[0].poolName).toBe('WETH/USDC');
      expect(positions[1].poolName).toBe('WETH/DAI');
    });

    it('should handle individual position read failures gracefully', async () => {
      mockReadContract
        .mockResolvedValueOnce(2n)
        .mockResolvedValueOnce(100n)
        .mockResolvedValueOnce(200n)
        // first position fails
        .mockRejectedValueOnce(new Error('RPC error'))
        // second position succeeds
        .mockResolvedValueOnce([
          0n, '0x0000000000000000000000000000000000000000' as Address,
          '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          3000, 192000, 198000,
          BigInt('50000000000000000'),
          0n, 0n, 0n, 0n,
        ])
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      // Should only have the second position
      expect(positions).toHaveLength(1);
      expect(positions[0].poolName).toBe('WETH/USDC');
    });

    it('should handle RPC errors gracefully at top level', async () => {
      mockReadContract.mockRejectedValueOnce(new Error('Network error'));

      const positions = await adapter.getLiquidityPositions(testAddress, 1);
      expect(positions).toEqual([]);
    });

    it('should compute token amounts from liquidity and tick range', async () => {
      mockReadContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(12345n)
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          mockPositionData.tickLower,
          mockPositionData.tickUpper,
          mockPositionData.liquidity,
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          mockPositionData.tokensOwed0,
          mockPositionData.tokensOwed1,
        ])
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      // Token amounts should be calculated from liquidity and ticks
      expect(parseFloat(positions[0].tokens[0].amount)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(positions[0].tokens[1].amount)).toBeGreaterThanOrEqual(0);
    });

    it('should set correct pool address using factory computeAddress pattern', async () => {
      mockReadContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(12345n)
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          mockPositionData.tickLower,
          mockPositionData.tickUpper,
          mockPositionData.liquidity,
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          mockPositionData.tokensOwed0,
          mockPositionData.tokensOwed1,
        ])
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      // poolAddress should be set (derived from factory)
      expect(positions[0].poolAddress).toBeDefined();
      expect(positions[0].poolAddress.length).toBe(42); // 0x + 40 hex chars
    });

    it('should set asset type to CRYPTOCURRENCY for pool tokens', async () => {
      mockReadContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(12345n)
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          mockPositionData.tickLower,
          mockPositionData.tickUpper,
          mockPositionData.liquidity,
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          mockPositionData.tokensOwed0,
          mockPositionData.tokensOwed1,
        ])
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 1);

      expect(positions[0].tokens[0].asset.type).toBe(AssetType.CRYPTOCURRENCY);
      expect(positions[0].tokens[1].asset.type).toBe(AssetType.CRYPTOCURRENCY);
    });

    it('should use correct chain for different networks', async () => {
      // Test on Polygon
      mockReadContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(12345n)
        .mockResolvedValueOnce([
          mockPositionData.nonce,
          mockPositionData.operator,
          mockPositionData.token0,
          mockPositionData.token1,
          mockPositionData.fee,
          mockPositionData.tickLower,
          mockPositionData.tickUpper,
          mockPositionData.liquidity,
          mockPositionData.feeGrowthInside0LastX128,
          mockPositionData.feeGrowthInside1LastX128,
          mockPositionData.tokensOwed0,
          mockPositionData.tokensOwed1,
        ])
        .mockResolvedValueOnce('WETH')
        .mockResolvedValueOnce('Wrapped Ether')
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin')
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce([
          BigInt('1461446703485210103287273052203988822378723970341'),
          195000, 0, 0, 0, 0, true,
        ]);

      const positions = await adapter.getLiquidityPositions(testAddress, 137);

      expect(positions[0].chain).toBe(Chain.POLYGON);
    });
  });

  describe('getLendingPositions', () => {
    it('should return empty array (Uniswap V3 is not a lending protocol)', async () => {
      const result = await adapter.getLendingPositions(testAddress, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getStakedPositions', () => {
    it('should return empty array (Uniswap V3 positions are modeled as liquidity)', async () => {
      const result = await adapter.getStakedPositions(testAddress, 1);
      expect(result).toEqual([]);
    });
  });

  describe('UNISWAP_V3_DEPLOYMENTS', () => {
    it('should export deployment addresses for each supported chain', () => {
      expect(UNISWAP_V3_DEPLOYMENTS).toBeDefined();
      expect(UNISWAP_V3_DEPLOYMENTS[1]).toBeDefined();
      expect(UNISWAP_V3_DEPLOYMENTS[1].positionManager).toBeDefined();
      expect(UNISWAP_V3_DEPLOYMENTS[1].factory).toBeDefined();
    });

    it('should have addresses for all five supported chains', () => {
      const chainIds = [1, 137, 42161, 10, 8453];
      for (const chainId of chainIds) {
        expect(UNISWAP_V3_DEPLOYMENTS[chainId]).toBeDefined();
        expect(UNISWAP_V3_DEPLOYMENTS[chainId].positionManager).toBeDefined();
        expect(UNISWAP_V3_DEPLOYMENTS[chainId].factory).toBeDefined();
      }
    });
  });
});
