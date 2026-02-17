import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Address } from 'viem';
import {
  Chain,
  AssetType,
  LendingPositionType,
  LendingPosition,
  StakedPosition,
  LiquidityPosition,
  Balance,
} from '@cygnus-wealth/data-models';
import { DeFiService } from './DeFiService.js';
import { IDeFiProtocol, DeFiServiceConfig } from './types.js';

describe('DeFiService', () => {
  let service: DeFiService;
  let mockProtocol1: IDeFiProtocol;
  let mockProtocol2: IDeFiProtocol;
  const testAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

  const mockLendingPosition: LendingPosition = {
    id: 'aave-supply-usdc-1',
    protocol: 'Aave V3',
    chain: Chain.ETHEREUM,
    type: LendingPositionType.SUPPLY,
    asset: {
      id: 'ethereum-usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      type: AssetType.CRYPTOCURRENCY,
      decimals: 6,
      chain: Chain.ETHEREUM,
    },
    amount: '50000',
    apy: 3.5,
  };

  const mockStakedPosition: StakedPosition = {
    id: 'beefy-aave-eth-1',
    protocol: 'Beefy Finance',
    chain: Chain.ETHEREUM,
    asset: {
      id: 'ethereum-0x1111111111111111111111111111111111111111',
      symbol: 'aETH',
      name: 'Aave ETH',
      type: AssetType.STAKED_POSITION,
      decimals: 18,
      chain: Chain.ETHEREUM,
    },
    stakedAmount: '10.5',
    rewards: [],
    apr: 4.5,
  };

  const mockLiquidityPosition: LiquidityPosition = {
    id: 'uniswap-eth-usdc-1',
    protocol: 'Uniswap V2',
    poolAddress: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
    poolName: 'ETH/USDC',
    chain: Chain.ETHEREUM,
    tokens: [],
  };

  beforeEach(() => {
    mockProtocol1 = {
      protocolName: 'Aave V3',
      supportedChains: [1, 137, 42161],
      supportsChain: vi.fn((chainId: number) => [1, 137, 42161].includes(chainId)),
      getLendingPositions: vi.fn().mockResolvedValue([mockLendingPosition]),
      getStakedPositions: vi.fn().mockResolvedValue([]),
      getLiquidityPositions: vi.fn().mockResolvedValue([]),
    };

    mockProtocol2 = {
      protocolName: 'Beefy Finance',
      supportedChains: [1, 137, 42161, 56, 10],
      supportsChain: vi.fn((chainId: number) => [1, 137, 42161, 56, 10].includes(chainId)),
      getLendingPositions: vi.fn().mockResolvedValue([]),
      getStakedPositions: vi.fn().mockResolvedValue([mockStakedPosition]),
      getLiquidityPositions: vi.fn().mockResolvedValue([]),
    };

    service = new DeFiService([mockProtocol1, mockProtocol2]);
  });

  afterEach(async () => {
    await service.destroy();
  });

  describe('constructor', () => {
    it('should initialize with protocols', () => {
      expect(service).toBeDefined();
    });

    it('should accept custom config', () => {
      const customService = new DeFiService([mockProtocol1], {
        enableCache: false,
        cacheTTL: 120,
      });
      expect(customService).toBeDefined();
      customService.destroy();
    });
  });

  describe('getPositions', () => {
    it('should aggregate positions from all protocols', async () => {
      const result = await service.getPositions(testAddress, 1);

      expect(result.lendingPositions).toHaveLength(1);
      expect(result.lendingPositions[0]).toEqual(mockLendingPosition);

      expect(result.stakedPositions).toHaveLength(1);
      expect(result.stakedPositions[0]).toEqual(mockStakedPosition);

      expect(result.liquidityPositions).toHaveLength(0);
    });

    it('should only query protocols that support the chain', async () => {
      await service.getPositions(testAddress, 56); // BSC - only Beefy supports

      expect(mockProtocol1.getLendingPositions).not.toHaveBeenCalled();
      expect(mockProtocol2.getStakedPositions).toHaveBeenCalledWith(testAddress, 56);
    });

    it('should validate address', async () => {
      await expect(
        service.getPositions('invalid-address' as Address, 1)
      ).rejects.toThrow();
    });

    it('should handle protocol errors gracefully', async () => {
      (mockProtocol1.getLendingPositions as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Protocol error'));

      const result = await service.getPositions(testAddress, 1);

      // Should still return positions from working protocol
      expect(result.stakedPositions).toHaveLength(1);
      // Failed protocol's positions should be empty
      expect(result.lendingPositions).toHaveLength(0);
    });

    it('should merge positions from multiple protocols', async () => {
      const aaveLendingPosition2: LendingPosition = {
        ...mockLendingPosition,
        id: 'aave-borrow-dai-1',
        type: LendingPositionType.BORROW,
        asset: {
          ...mockLendingPosition.asset,
          id: 'ethereum-dai',
          symbol: 'DAI',
          name: 'Dai',
        },
        amount: '20000',
      };

      (mockProtocol1.getLendingPositions as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([mockLendingPosition, aaveLendingPosition2]);

      const result = await service.getPositions(testAddress, 1);

      expect(result.lendingPositions).toHaveLength(2);
    });
  });

  describe('getMultiChainPositions', () => {
    it('should fetch positions across multiple chains', async () => {
      const result = await service.getMultiChainPositions(testAddress, [1, 137]);

      expect(result.positions.size).toBe(2);
      expect(result.positions.has(1)).toBe(true);
      expect(result.positions.has(137)).toBe(true);
      expect(result.errors.size).toBe(0);
    });

    it('should collect errors per chain without failing completely', async () => {
      (mockProtocol1.getLendingPositions as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([mockLendingPosition]) // chain 1 OK
        .mockRejectedValueOnce(new Error('Chain 137 error')); // chain 137 error
      (mockProtocol2.getStakedPositions as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([mockStakedPosition]) // chain 1 OK
        .mockRejectedValueOnce(new Error('Chain 137 error')); // chain 137 error

      const result = await service.getMultiChainPositions(testAddress, [1, 137]);

      // Chain 1 should have results
      expect(result.positions.has(1)).toBe(true);
      // Chain 137 may have partial results or errors
      expect(result.positions.size + result.errors.size).toBeGreaterThanOrEqual(1);
    });

    it('should validate address', async () => {
      await expect(
        service.getMultiChainPositions('bad' as Address, [1])
      ).rejects.toThrow();
    });
  });

  describe('caching', () => {
    it('should cache positions and return cached on second call', async () => {
      await service.getPositions(testAddress, 1);
      await service.getPositions(testAddress, 1);

      // Protocol should only be called once (second was cached)
      expect(mockProtocol1.getLendingPositions).toHaveBeenCalledTimes(1);
      expect(mockProtocol2.getStakedPositions).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache when forceFresh is true', async () => {
      await service.getPositions(testAddress, 1);
      await service.getPositions(testAddress, 1, { forceFresh: true });

      expect(mockProtocol1.getLendingPositions).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStats', () => {
    it('should track request statistics', async () => {
      await service.getPositions(testAddress, 1);

      const stats = service.getStats();
      expect(stats.totalRequests).toBe(1);
    });

    it('should track cache hits', async () => {
      await service.getPositions(testAddress, 1);
      await service.getPositions(testAddress, 1);

      const stats = service.getStats();
      expect(stats.cacheHits).toBeGreaterThan(0);
    });

    it('should track failed requests', async () => {
      (mockProtocol1.getLendingPositions as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('fail'));
      (mockProtocol2.getStakedPositions as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('fail'));

      await service.getPositions(testAddress, 1);

      const stats = service.getStats();
      expect(stats.failedRequests).toBeGreaterThan(0);
    });
  });

  describe('destroy', () => {
    it('should clean up resources', async () => {
      await service.destroy();
      // Should not throw on double destroy
      await service.destroy();
    });
  });
});
