import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Address } from 'viem';
import { TokenDiscoveryService } from './TokenDiscoveryService.js';
import { EvmChainAdapter } from '../adapters/EvmChainAdapter.js';
import { ChainConfig } from '../types/ChainConfig.js';

// Mock EvmChainAdapter
vi.mock('../adapters/EvmChainAdapter.js');

const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678' as Address;

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address;
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address;
const BROKEN_TOKEN = '0xDEAD000000000000000000000000000000000000' as Address;

function makeConfig(chainId: number, name: string): ChainConfig {
  return {
    id: chainId,
    name,
    symbol: 'ETH',
    decimals: 18,
    endpoints: { http: ['https://rpc.example.com'] },
    explorer: 'https://explorer.example.com',
  };
}

function makeMockAdapter(chainId: number): {
  adapter: EvmChainAdapter;
  mockDiscoverTokens: ReturnType<typeof vi.fn>;
} {
  const mockDiscoverTokens = vi.fn();
  const adapter = {
    getChainInfo: () => ({ id: chainId, name: `Chain ${chainId}`, symbol: 'ETH', decimals: 18, explorer: '' }),
    discoverTokens: mockDiscoverTokens,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getBalance: vi.fn(),
    getTokenBalances: vi.fn(),
    getTransactions: vi.fn(),
    subscribeToBalance: vi.fn(),
    subscribeToTransactions: vi.fn(),
    isHealthy: vi.fn(),
  } as unknown as EvmChainAdapter;
  return { adapter, mockDiscoverTokens };
}

describe('TokenDiscoveryService', () => {
  describe('discoverTokens (single chain via adapter)', () => {
    it('should return discovered tokens from Alchemy API response', async () => {
      const { adapter, mockDiscoverTokens } = makeMockAdapter(1);
      mockDiscoverTokens.mockResolvedValue({
        address: TEST_ADDRESS,
        chainId: 1,
        tokens: [
          {
            contractAddress: USDC_ADDRESS,
            balance: '1000000',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
          {
            contractAddress: DAI_ADDRESS,
            balance: '2000000000000000000',
            symbol: 'DAI',
            name: 'Dai Stablecoin',
            decimals: 18,
          },
        ],
        errors: [],
      });

      const adapters = new Map<number, EvmChainAdapter>([[1, adapter]]);
      const service = new TokenDiscoveryService(adapters);
      const result = await service.discoverTokens(TEST_ADDRESS, 1);

      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0].symbol).toBe('USDC');
      expect(result.tokens[0].balance).toBe('1000000');
      expect(result.tokens[1].symbol).toBe('DAI');
      expect(result.errors).toHaveLength(0);
    });

    it('should include error details for tokens that fail metadata fetch', async () => {
      const { adapter, mockDiscoverTokens } = makeMockAdapter(1);
      mockDiscoverTokens.mockResolvedValue({
        address: TEST_ADDRESS,
        chainId: 1,
        tokens: [
          {
            contractAddress: USDC_ADDRESS,
            balance: '1000000',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        ],
        errors: [
          {
            contractAddress: BROKEN_TOKEN,
            chainId: 1,
            message: 'Failed to fetch token metadata',
            code: 'METADATA_FETCH_FAILED',
          },
        ],
      });

      const adapters = new Map<number, EvmChainAdapter>([[1, adapter]]);
      const service = new TokenDiscoveryService(adapters);
      const result = await service.discoverTokens(TEST_ADDRESS, 1);

      expect(result.tokens).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].contractAddress).toBe(BROKEN_TOKEN);
      expect(result.errors[0].message).toBe('Failed to fetch token metadata');
      expect(result.errors[0].code).toBe('METADATA_FETCH_FAILED');
    });

    it('should throw if chain adapter not found', async () => {
      const adapters = new Map<number, EvmChainAdapter>();
      const service = new TokenDiscoveryService(adapters);

      await expect(service.discoverTokens(TEST_ADDRESS, 999))
        .rejects.toThrow('No adapter registered for chain 999');
    });
  });

  describe('discoverTokensMultiChain', () => {
    it('should aggregate results across all requested chains', async () => {
      const { adapter: ethAdapter, mockDiscoverTokens: mockEth } = makeMockAdapter(1);
      const { adapter: polyAdapter, mockDiscoverTokens: mockPoly } = makeMockAdapter(137);

      mockEth.mockResolvedValue({
        address: TEST_ADDRESS,
        chainId: 1,
        tokens: [
          { contractAddress: USDC_ADDRESS, balance: '1000000', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        ],
        errors: [],
      });

      mockPoly.mockResolvedValue({
        address: TEST_ADDRESS,
        chainId: 137,
        tokens: [
          { contractAddress: USDT_ADDRESS, balance: '5000000', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
        ],
        errors: [],
      });

      const adapters = new Map<number, EvmChainAdapter>([
        [1, ethAdapter],
        [137, polyAdapter],
      ]);
      const service = new TokenDiscoveryService(adapters);
      const result = await service.discoverTokensMultiChain(TEST_ADDRESS, [1, 137]);

      expect(result.results).toHaveLength(2);

      const ethResult = result.results.find(r => r.chainId === 1);
      expect(ethResult).toBeDefined();
      expect(ethResult!.tokens).toHaveLength(1);
      expect(ethResult!.tokens[0].symbol).toBe('USDC');

      const polyResult = result.results.find(r => r.chainId === 137);
      expect(polyResult).toBeDefined();
      expect(polyResult!.tokens).toHaveLength(1);
      expect(polyResult!.tokens[0].symbol).toBe('USDT');
    });

    it('should discover across all 5 supported chains', async () => {
      const chainIds = [1, 137, 42161, 10, 8453]; // ETH, Polygon, Arbitrum, Optimism, Base
      const adapterMap = new Map<number, EvmChainAdapter>();

      for (const chainId of chainIds) {
        const { adapter, mockDiscoverTokens } = makeMockAdapter(chainId);
        mockDiscoverTokens.mockResolvedValue({
          address: TEST_ADDRESS,
          chainId,
          tokens: [
            { contractAddress: USDC_ADDRESS, balance: '1000000', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
          ],
          errors: [],
        });
        adapterMap.set(chainId, adapter);
      }

      const service = new TokenDiscoveryService(adapterMap);
      const result = await service.discoverTokensMultiChain(TEST_ADDRESS, chainIds);

      expect(result.results).toHaveLength(5);
      for (const chainId of chainIds) {
        const chainResult = result.results.find(r => r.chainId === chainId);
        expect(chainResult).toBeDefined();
        expect(chainResult!.tokens.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should collect chain-level errors without failing other chains', async () => {
      const { adapter: ethAdapter, mockDiscoverTokens: mockEth } = makeMockAdapter(1);
      const { adapter: polyAdapter, mockDiscoverTokens: mockPoly } = makeMockAdapter(137);

      mockEth.mockResolvedValue({
        address: TEST_ADDRESS,
        chainId: 1,
        tokens: [
          { contractAddress: USDC_ADDRESS, balance: '1000000', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        ],
        errors: [],
      });

      mockPoly.mockRejectedValue(new Error('RPC connection failed'));

      const adapters = new Map<number, EvmChainAdapter>([
        [1, ethAdapter],
        [137, polyAdapter],
      ]);
      const service = new TokenDiscoveryService(adapters);
      const result = await service.discoverTokensMultiChain(TEST_ADDRESS, [1, 137]);

      // Successful chain should still have results
      expect(result.results).toHaveLength(1);
      expect(result.results[0].chainId).toBe(1);

      // Failed chain should be in chainErrors
      expect(result.chainErrors).toHaveLength(1);
      expect(result.chainErrors[0].chainId).toBe(137);
      expect(result.chainErrors[0].message).toBe('RPC connection failed');
    });

    it('should return empty results for chains with no tokens', async () => {
      const { adapter, mockDiscoverTokens } = makeMockAdapter(1);
      mockDiscoverTokens.mockResolvedValue({
        address: TEST_ADDRESS,
        chainId: 1,
        tokens: [],
        errors: [],
      });

      const adapters = new Map<number, EvmChainAdapter>([[1, adapter]]);
      const service = new TokenDiscoveryService(adapters);
      const result = await service.discoverTokensMultiChain(TEST_ADDRESS, [1]);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].tokens).toHaveLength(0);
      expect(result.results[0].errors).toHaveLength(0);
    });

    it('should skip chains without registered adapters and report errors', async () => {
      const { adapter, mockDiscoverTokens } = makeMockAdapter(1);
      mockDiscoverTokens.mockResolvedValue({
        address: TEST_ADDRESS,
        chainId: 1,
        tokens: [],
        errors: [],
      });

      const adapters = new Map<number, EvmChainAdapter>([[1, adapter]]);
      const service = new TokenDiscoveryService(adapters);
      const result = await service.discoverTokensMultiChain(TEST_ADDRESS, [1, 999]);

      expect(result.results).toHaveLength(1);
      expect(result.chainErrors).toHaveLength(1);
      expect(result.chainErrors[0].chainId).toBe(999);
    });
  });
});
