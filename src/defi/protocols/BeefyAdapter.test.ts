import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Address } from 'viem';
import { Chain, AssetType } from '@cygnus-wealth/data-models';
import { BeefyAdapter } from './BeefyAdapter.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('BeefyAdapter', () => {
  let adapter: BeefyAdapter;
  const testAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

  // Mock Beefy API vault data
  const mockVaults = [
    {
      id: 'aave-eth',
      name: 'Aave ETH',
      token: 'aETH',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      tokenDecimals: 18,
      earnedToken: 'mooAaveETH',
      earnedTokenAddress: '0x2222222222222222222222222222222222222222',
      earnContractAddress: '0x3333333333333333333333333333333333333333',
      chain: 'ethereum',
      status: 'active',
      platformId: 'aave',
    },
    {
      id: 'curve-3pool',
      name: 'Curve 3Pool',
      token: '3CRV',
      tokenAddress: '0x4444444444444444444444444444444444444444',
      tokenDecimals: 18,
      earnedToken: 'mooCurve3Pool',
      earnedTokenAddress: '0x5555555555555555555555555555555555555555',
      earnContractAddress: '0x6666666666666666666666666666666666666666',
      chain: 'ethereum',
      status: 'active',
      platformId: 'curve',
    },
  ];

  const mockApys: Record<string, number> = {
    'aave-eth': 0.045,
    'curve-3pool': 0.082,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new BeefyAdapter();
  });

  describe('protocolName', () => {
    it('should return "Beefy Finance"', () => {
      expect(adapter.protocolName).toBe('Beefy Finance');
    });
  });

  describe('supportedChains', () => {
    it('should support multiple EVM chains', () => {
      expect(adapter.supportedChains).toContain(1);    // Ethereum
      expect(adapter.supportedChains).toContain(137);  // Polygon
      expect(adapter.supportedChains).toContain(42161); // Arbitrum
      expect(adapter.supportedChains).toContain(10);   // Optimism
      expect(adapter.supportedChains).toContain(56);   // BSC
      expect(adapter.supportedChains).toContain(8453); // Base
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

  describe('getStakedPositions', () => {
    it('should return empty array for unsupported chain', async () => {
      const result = await adapter.getStakedPositions(testAddress, 999999);
      expect(result).toEqual([]);
    });

    it('should fetch vaults and user balances', async () => {
      // Mock Beefy API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockVaults,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApys,
        });

      // Create adapter with a mock read function for on-chain calls
      const mockReadContract = vi.fn()
        // First vault balance call
        .mockResolvedValueOnce(BigInt('1000000000000000000')) // 1 mooToken
        // First vault pricePerFullShare
        .mockResolvedValueOnce(BigInt('1050000000000000000')) // 1.05x
        // Second vault balance call
        .mockResolvedValueOnce(BigInt('0')) // 0 mooTokens (no position)
        // Second vault pricePerFullShare
        .mockResolvedValueOnce(BigInt('1100000000000000000')); // 1.1x

      adapter = new BeefyAdapter({ readContract: mockReadContract });

      const positions = await adapter.getStakedPositions(testAddress, 1);

      // Should only return positions where user has balance > 0
      expect(positions).toHaveLength(1);
      expect(positions[0].protocol).toBe('Beefy Finance');
      expect(positions[0].chain).toBe(Chain.ETHEREUM);
      expect(positions[0].asset.symbol).toBe('aETH');
      expect(positions[0].stakedAmount).toBeDefined();
      expect(parseFloat(positions[0].stakedAmount)).toBeGreaterThan(0);
    });

    it('should include APY data when available', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockVaults[0]],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 'aave-eth': 0.045 }),
        });

      const mockReadContract = vi.fn()
        .mockResolvedValueOnce(BigInt('2000000000000000000'))
        .mockResolvedValueOnce(BigInt('1050000000000000000'));

      adapter = new BeefyAdapter({ readContract: mockReadContract });

      const positions = await adapter.getStakedPositions(testAddress, 1);

      expect(positions).toHaveLength(1);
      expect(positions[0].apr).toBeCloseTo(4.5, 1);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

      const positions = await adapter.getStakedPositions(testAddress, 1);
      expect(positions).toEqual([]);
    });

    it('should filter out inactive/eol vaults', async () => {
      const vaultsWithEol = [
        ...mockVaults,
        {
          ...mockVaults[0],
          id: 'old-vault',
          status: 'eol',
          earnContractAddress: '0x7777777777777777777777777777777777777777',
        },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => vaultsWithEol,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApys,
        });

      const mockReadContract = vi.fn()
        .mockResolvedValueOnce(BigInt('1000000000000000000'))
        .mockResolvedValueOnce(BigInt('1050000000000000000'))
        .mockResolvedValueOnce(BigInt('1000000000000000000'))
        .mockResolvedValueOnce(BigInt('1050000000000000000'));

      adapter = new BeefyAdapter({ readContract: mockReadContract });

      const positions = await adapter.getStakedPositions(testAddress, 1);

      // Only active vaults should be queried
      for (const pos of positions) {
        expect(pos.metadata?.vaultStatus).not.toBe('eol');
      }
    });

    it('should handle on-chain read failures for individual vaults', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockVaults[0]],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApys,
        });

      const mockReadContract = vi.fn()
        .mockRejectedValueOnce(new Error('RPC error'));

      adapter = new BeefyAdapter({ readContract: mockReadContract });

      // Should not throw, just skip failed vaults
      const positions = await adapter.getStakedPositions(testAddress, 1);
      expect(positions).toEqual([]);
    });
  });

  describe('getLendingPositions', () => {
    it('should return empty array (Beefy is not a lending protocol)', async () => {
      const result = await adapter.getLendingPositions(testAddress, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getLiquidityPositions', () => {
    it('should return empty array (Beefy models positions as staked)', async () => {
      const result = await adapter.getLiquidityPositions(testAddress, 1);
      expect(result).toEqual([]);
    });
  });
});
