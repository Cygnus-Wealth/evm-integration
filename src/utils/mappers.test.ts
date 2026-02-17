import { describe, it, expect } from 'vitest';
import { Address } from 'viem';
import { Chain, AssetType } from '@cygnus-wealth/data-models';
import { mapChainIdToChain, mapChainToChainId, mapEvmBalanceToBalance, mapTokenToAsset } from './mappers';

describe('mappers', () => {
  describe('mapChainIdToChain', () => {
    it('should map all supported chain IDs', () => {
      expect(mapChainIdToChain(1)).toBe(Chain.ETHEREUM);
      expect(mapChainIdToChain(137)).toBe(Chain.POLYGON);
      expect(mapChainIdToChain(42161)).toBe(Chain.ARBITRUM);
      expect(mapChainIdToChain(10)).toBe(Chain.OPTIMISM);
      expect(mapChainIdToChain(43114)).toBe(Chain.AVALANCHE);
      expect(mapChainIdToChain(56)).toBe(Chain.BSC);
      expect(mapChainIdToChain(8453)).toBe(Chain.BASE);
    });

    it('should return OTHER for unknown chain IDs', () => {
      expect(mapChainIdToChain(999)).toBe(Chain.OTHER);
      expect(mapChainIdToChain(0)).toBe(Chain.OTHER);
    });
  });

  describe('mapChainToChainId', () => {
    it('should map all supported chains', () => {
      expect(mapChainToChainId(Chain.ETHEREUM)).toBe(1);
      expect(mapChainToChainId(Chain.POLYGON)).toBe(137);
      expect(mapChainToChainId(Chain.ARBITRUM)).toBe(42161);
      expect(mapChainToChainId(Chain.OPTIMISM)).toBe(10);
      expect(mapChainToChainId(Chain.AVALANCHE)).toBe(43114);
      expect(mapChainToChainId(Chain.BSC)).toBe(56);
      expect(mapChainToChainId(Chain.BASE)).toBe(8453);
    });
  });

  describe('mapEvmBalanceToBalance', () => {
    const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as Address;

    it('should store human-readable formatted amount, not raw bigint', () => {
      const balance = mapEvmBalanceToBalance(
        { value: 1000000000000000000n, symbol: 'ETH', decimals: 18 },
        testAddress,
        1
      );
      expect(balance.amount).toBe('1');
    });

    it('should use formatted field when provided', () => {
      const balance = mapEvmBalanceToBalance(
        { value: 1500000000000000000n, symbol: 'ETH', decimals: 18, formatted: '1.5' },
        testAddress,
        1
      );
      expect(balance.amount).toBe('1.5');
    });

    it('should format correctly for 6-decimal tokens', () => {
      const balance = mapEvmBalanceToBalance(
        { value: 26968000n, symbol: 'USDT', decimals: 6 },
        testAddress,
        1
      );
      expect(balance.amount).toBe('26.968');
    });

    it('should not set a fake USD value', () => {
      const balance = mapEvmBalanceToBalance(
        { value: 1000000000000000000n, symbol: 'ETH', decimals: 18, formatted: '1.0' },
        testAddress,
        1
      );
      expect(balance.value).toBeUndefined();
    });

    it('should correctly map Base chain', () => {
      const balance = mapEvmBalanceToBalance(
        { value: 1000000000000000000n, symbol: 'ETH', decimals: 18 },
        testAddress,
        8453
      );
      expect(balance.asset.chain).toBe(Chain.BASE);
      expect(balance.assetId).toBe('base-native');
    });

    it('should correctly map BSC chain', () => {
      const balance = mapEvmBalanceToBalance(
        { value: 1000000000000000000n, symbol: 'BNB', decimals: 18 },
        testAddress,
        56
      );
      expect(balance.asset.chain).toBe(Chain.BSC);
      expect(balance.assetId).toBe('bsc-native');
    });
  });

  describe('mapTokenToAsset', () => {
    const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;

    it('should use correct chain for Base tokens', () => {
      const asset = mapTokenToAsset(tokenAddress, 'USDC', 'USD Coin', 6, 8453);
      expect(asset.chain).toBe(Chain.BASE);
      expect(asset.id).toContain('base-');
    });

    it('should use correct chain for BSC tokens', () => {
      const asset = mapTokenToAsset(tokenAddress, 'USDT', 'Tether', 18, 56);
      expect(asset.chain).toBe(Chain.BSC);
      expect(asset.id).toContain('bsc-');
    });
  });
});
