import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountBalanceService } from './AccountBalanceService.js';
import type { IChainAdapter } from '../types/IChainAdapter.js';
import type { AddressRequest, AccountId } from '../types/account.js';
import type { Balance } from '@cygnus-wealth/data-models';
import { AssetType, Chain } from '@cygnus-wealth/data-models';

function makeBalance(symbol: string, amount: string): Balance {
  return {
    assetId: `test-${symbol.toLowerCase()}`,
    asset: {
      id: `test-${symbol.toLowerCase()}`,
      symbol,
      name: symbol,
      type: AssetType.CRYPTOCURRENCY,
    },
    amount,
  };
}

function createMockAdapter(overrides?: Partial<IChainAdapter>): IChainAdapter {
  return {
    getBalance: vi.fn().mockResolvedValue(makeBalance('ETH', '1.0')),
    getTokenBalances: vi.fn().mockResolvedValue([makeBalance('USDC', '100')]),
    getTransactions: vi.fn().mockResolvedValue([]),
    subscribeToBalance: vi.fn().mockResolvedValue(() => {}),
    subscribeToTransactions: vi.fn().mockResolvedValue(() => {}),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    isHealthy: vi.fn().mockResolvedValue(true),
    getChainInfo: vi.fn().mockReturnValue({
      id: 1,
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      explorer: 'https://etherscan.io',
    }),
    ...overrides,
  };
}

describe('AccountBalanceService', () => {
  let ethAdapter: IChainAdapter;
  let polygonAdapter: IChainAdapter;
  let adapters: Map<number, IChainAdapter>;
  let service: AccountBalanceService;

  beforeEach(() => {
    ethAdapter = createMockAdapter();
    polygonAdapter = createMockAdapter({
      getBalance: vi.fn().mockResolvedValue(makeBalance('MATIC', '50.0')),
      getTokenBalances: vi.fn().mockResolvedValue([makeBalance('USDC', '200')]),
    });

    adapters = new Map([
      [1, ethAdapter],
      [137, polygonAdapter],
    ]);

    service = new AccountBalanceService(adapters);
  });

  describe('getAccountBalances', () => {
    it('should return balances attributed to each accountId', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          chainScope: [1],
        },
      ];

      const result = await service.getAccountBalances(requests);

      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].accountId).toBe('metamask:abc:0x111');
      expect(result.balances[0].chainId).toBe(1);
      expect(result.balances[0].nativeBalance.amount).toBe('1.0');
      expect(result.errors).toHaveLength(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should query multiple chains per address based on chainScope', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          chainScope: [1, 137],
        },
      ];

      const result = await service.getAccountBalances(requests);

      expect(result.balances).toHaveLength(2);
      expect(result.balances[0].chainId).toBe(1);
      expect(result.balances[1].chainId).toBe(137);
      expect(ethAdapter.getBalance).toHaveBeenCalledTimes(1);
      expect(polygonAdapter.getBalance).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate queries for same address on same chain', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          chainScope: [1],
        },
        {
          accountId: 'rabby:xyz:0x111' as AccountId,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          chainScope: [1],
        },
      ];

      const result = await service.getAccountBalances(requests);

      // One RPC call despite two account requests
      expect(ethAdapter.getBalance).toHaveBeenCalledTimes(1);
      expect(ethAdapter.getTokenBalances).toHaveBeenCalledTimes(1);

      // But results fanned out to both accountIds
      expect(result.balances).toHaveLength(2);
      expect(result.balances[0].accountId).toBe('metamask:abc:0x111');
      expect(result.balances[1].accountId).toBe('rabby:xyz:0x111');

      // Both get the same balance data
      expect(result.balances[0].nativeBalance.amount).toBe('1.0');
      expect(result.balances[1].nativeBalance.amount).toBe('1.0');
    });

    it('should handle multiple addresses with partial overlap', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
        {
          accountId: 'rabby:xyz:0x111' as AccountId,
          address: '0x111',
          chainScope: [1, 137],
        },
        {
          accountId: 'metamask:abc:0x222' as AccountId,
          address: '0x222',
          chainScope: [1],
        },
      ];

      const result = await service.getAccountBalances(requests);

      // Chain 1: 0x111 queried once (shared), 0x222 queried once = 2 calls
      // Chain 137: 0x111 queried once = 1 call
      expect(ethAdapter.getBalance).toHaveBeenCalledTimes(2);
      expect(polygonAdapter.getBalance).toHaveBeenCalledTimes(1);

      // Results: metamask:0x111 on chain 1, rabby:0x111 on chains 1+137, metamask:0x222 on chain 1
      expect(result.balances).toHaveLength(4);
    });

    it('should report per-account errors without failing the whole batch', async () => {
      (ethAdapter.getBalance as any).mockRejectedValue(new Error('RPC timeout'));

      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
        {
          accountId: 'rabby:xyz:0x222' as AccountId,
          address: '0x222',
          chainScope: [137],
        },
      ];

      const result = await service.getAccountBalances(requests);

      // Polygon succeeded
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].accountId).toBe('rabby:xyz:0x222');

      // Ethereum failed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].accountId).toBe('metamask:abc:0x111');
      expect(result.errors[0].chainId).toBe(1);
      expect(result.errors[0].error).toContain('RPC timeout');
    });

    it('should fan out errors to all accountIds sharing a failed address+chain', async () => {
      (ethAdapter.getBalance as any).mockRejectedValue(new Error('RPC timeout'));

      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
        {
          accountId: 'rabby:xyz:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
      ];

      const result = await service.getAccountBalances(requests);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].accountId).toBe('metamask:abc:0x111');
      expect(result.errors[1].accountId).toBe('rabby:xyz:0x111');
    });

    it('should return empty results for empty requests', async () => {
      const result = await service.getAccountBalances([]);

      expect(result.balances).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip unsupported chains and report errors', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [999], // unsupported chain
        },
      ];

      const result = await service.getAccountBalances(requests);

      expect(result.balances).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].chainId).toBe(999);
      expect(result.errors[0].error).toContain('not supported');
    });
  });

  describe('getBatchAccountBalances', () => {
    it('should work identically to getAccountBalances for batch optimization', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
        {
          accountId: 'rabby:xyz:0x222' as AccountId,
          address: '0x222',
          chainScope: [137],
        },
      ];

      const result = await service.getBatchAccountBalances(requests);

      expect(result.balances).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });
  });
});
