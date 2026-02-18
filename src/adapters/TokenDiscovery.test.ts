import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Address, PublicClient } from 'viem';
import { EvmChainAdapter, isSpamToken } from './EvmChainAdapter.js';
import { ChainConfig } from '../types/ChainConfig.js';

const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678' as Address;
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address;
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address;
const BROKEN_TOKEN = '0xDEAD000000000000000000000000000000000000' as Address;
const SPAM_TOKEN = '0x5PAA000000000000000000000000000000000000' as Address;

function makeConfig(chainId: number = 1): ChainConfig {
  return {
    id: chainId,
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    endpoints: { http: ['https://eth-mainnet.g.alchemy.com/v2/test-key'] },
    explorer: 'https://etherscan.io',
  };
}

// Helper to create a mock client
function createMockClient() {
  return {
    request: vi.fn(),
    readContract: vi.fn(),
    getBalance: vi.fn(),
    getBlockNumber: vi.fn(),
    watchBlockNumber: vi.fn(),
    watchPendingTransactions: vi.fn(),
    getTransaction: vi.fn(),
    chain: { id: 1 },
  };
}

describe('EvmChainAdapter.discoverTokens', () => {
  let adapter: EvmChainAdapter;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    adapter = new EvmChainAdapter(makeConfig());
    mockClient = createMockClient();

    // Inject mock client via connect override
    (adapter as any).client = mockClient;
  });

  it('should call alchemy_getTokenBalances with DEFAULT_TOKENS', async () => {
    mockClient.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [],
    });

    await adapter.discoverTokens(TEST_ADDRESS);

    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'alchemy_getTokenBalances',
      params: [TEST_ADDRESS, 'DEFAULT_TOKENS'],
    });
  });

  it('should return discovered tokens with balances and metadata', async () => {
    // Mock Alchemy response
    mockClient.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [
        {
          contractAddress: USDC_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000989680', // 10000000
          error: null,
        },
        {
          contractAddress: DAI_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000001bc16d674ec80000', // 2e18
          error: null,
        },
      ],
    });

    // Mock metadata calls
    mockClient.readContract
      // USDC decimals
      .mockResolvedValueOnce(6)
      // USDC symbol
      .mockResolvedValueOnce('USDC')
      // USDC name
      .mockResolvedValueOnce('USD Coin')
      // DAI decimals
      .mockResolvedValueOnce(18)
      // DAI symbol
      .mockResolvedValueOnce('DAI')
      // DAI name
      .mockResolvedValueOnce('Dai Stablecoin');

    const result = await adapter.discoverTokens(TEST_ADDRESS);

    expect(result.address).toBe(TEST_ADDRESS);
    expect(result.chainId).toBe(1);
    expect(result.tokens).toHaveLength(2);

    expect(result.tokens[0].contractAddress).toBe(USDC_ADDRESS);
    expect(result.tokens[0].symbol).toBe('USDC');
    expect(result.tokens[0].name).toBe('USD Coin');
    expect(result.tokens[0].decimals).toBe(6);
    expect(result.tokens[0].balance).toBeDefined();

    expect(result.tokens[1].contractAddress).toBe(DAI_ADDRESS);
    expect(result.tokens[1].symbol).toBe('DAI');
    expect(result.errors).toHaveLength(0);
  });

  it('should skip zero-balance tokens', async () => {
    mockClient.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [
        {
          contractAddress: USDC_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000000000',
          error: null,
        },
        {
          contractAddress: DAI_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000001bc16d674ec80000',
          error: null,
        },
      ],
    });

    // Only DAI metadata should be fetched
    mockClient.readContract
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce('DAI')
      .mockResolvedValueOnce('Dai Stablecoin');

    const result = await adapter.discoverTokens(TEST_ADDRESS);

    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].symbol).toBe('DAI');
  });

  it('should report errors for tokens that fail in Alchemy response', async () => {
    mockClient.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [
        {
          contractAddress: USDC_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000989680',
          error: null,
        },
        {
          contractAddress: BROKEN_TOKEN,
          tokenBalance: null,
          error: 'Contract execution reverted',
        },
      ],
    });

    // USDC metadata
    mockClient.readContract
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce('USDC')
      .mockResolvedValueOnce('USD Coin');

    const result = await adapter.discoverTokens(TEST_ADDRESS);

    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].symbol).toBe('USDC');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].contractAddress).toBe(BROKEN_TOKEN);
    expect(result.errors[0].message).toContain('Contract execution reverted');
  });

  it('should report errors for tokens where metadata fetch fails', async () => {
    mockClient.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [
        {
          contractAddress: USDC_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000989680',
          error: null,
        },
        {
          contractAddress: BROKEN_TOKEN,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000000001',
          error: null,
        },
      ],
    });

    // USDC metadata succeeds
    mockClient.readContract
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce('USDC')
      .mockResolvedValueOnce('USD Coin')
      // BROKEN_TOKEN metadata fails
      .mockRejectedValueOnce(new Error('execution reverted'));

    const result = await adapter.discoverTokens(TEST_ADDRESS);

    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].symbol).toBe('USDC');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].contractAddress).toBe(BROKEN_TOKEN);
    expect(result.errors[0].code).toBe('METADATA_FETCH_FAILED');
  });

  it('should filter out spam tokens', async () => {
    mockClient.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [
        {
          contractAddress: USDC_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000989680',
          error: null,
        },
        {
          contractAddress: SPAM_TOKEN,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000000001',
          error: null,
        },
      ],
    });

    mockClient.readContract
      // USDC metadata
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce('USDC')
      .mockResolvedValueOnce('USD Coin')
      // Spam token metadata
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce('REWARD')
      .mockResolvedValueOnce('Claim Reward at https://scam.live');

    const result = await adapter.discoverTokens(TEST_ADDRESS);

    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].symbol).toBe('USDC');
    // Spam tokens are filtered, not reported as errors
  });

  it('should handle empty token list from Alchemy', async () => {
    mockClient.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [],
    });

    const result = await adapter.discoverTokens(TEST_ADDRESS);

    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle Alchemy API not available (fallback error)', async () => {
    mockClient.request.mockRejectedValue(
      new Error('Method alchemy_getTokenBalances not found')
    );

    const result = await adapter.discoverTokens(TEST_ADDRESS);

    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('DISCOVERY_API_UNAVAILABLE');
    expect(result.errors[0].message).toContain('not found');
  });

  it('should work for Polygon chain', async () => {
    const polyAdapter = new EvmChainAdapter(makeConfig(137));
    const polyMock = createMockClient();
    polyMock.chain = { id: 137 } as any;
    (polyAdapter as any).client = polyMock;

    polyMock.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [
        {
          contractAddress: USDC_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000989680',
          error: null,
        },
      ],
    });

    polyMock.readContract
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce('USDC')
      .mockResolvedValueOnce('USD Coin (PoS)');

    const result = await polyAdapter.discoverTokens(TEST_ADDRESS);

    expect(result.chainId).toBe(137);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].name).toBe('USD Coin (PoS)');
  });

  it('should convert token balances as Balance objects', async () => {
    mockClient.request.mockResolvedValue({
      address: TEST_ADDRESS,
      tokenBalances: [
        {
          contractAddress: USDC_ADDRESS,
          tokenBalance: '0x0000000000000000000000000000000000000000000000000000000000989680',
          error: null,
        },
      ],
    });

    mockClient.readContract
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce('USDC')
      .mockResolvedValueOnce('USD Coin');

    const result = await adapter.discoverTokens(TEST_ADDRESS);

    // The balance should be the raw bigint string representation
    expect(result.tokens[0].balance).toBeDefined();
    expect(typeof result.tokens[0].balance).toBe('string');
    expect(result.tokens[0].decimals).toBe(6);
  });
});
