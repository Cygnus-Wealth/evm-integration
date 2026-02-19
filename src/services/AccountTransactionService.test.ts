import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountTransactionService } from './AccountTransactionService.js';
import type { IChainAdapter } from '../types/IChainAdapter.js';
import type { AddressRequest, AccountId } from '../types/account.js';
import type { Transaction } from '@cygnus-wealth/data-models';
import { TransactionType } from '@cygnus-wealth/data-models';

function makeTx(hash: string): Transaction {
  return {
    id: hash,
    accountId: '',
    type: TransactionType.TRANSFER_IN,
    status: 'COMPLETED',
    hash,
    timestamp: new Date('2026-01-15'),
  };
}

function createMockAdapter(overrides?: Partial<IChainAdapter>): IChainAdapter {
  return {
    getBalance: vi.fn().mockResolvedValue({ assetId: 'eth', asset: {}, amount: '1.0' }),
    getTokenBalances: vi.fn().mockResolvedValue([]),
    getTransactions: vi.fn().mockResolvedValue([makeTx('0xabc'), makeTx('0xdef')]),
    subscribeToBalance: vi.fn().mockResolvedValue(() => {}),
    subscribeToTransactions: vi.fn().mockResolvedValue(() => {}),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    isHealthy: vi.fn().mockResolvedValue(true),
    getChainInfo: vi.fn().mockReturnValue({
      id: 1, name: 'Ethereum', symbol: 'ETH', decimals: 18, explorer: '',
    }),
    ...overrides,
  };
}

describe('AccountTransactionService', () => {
  let ethAdapter: IChainAdapter;
  let polygonAdapter: IChainAdapter;
  let service: AccountTransactionService;

  beforeEach(() => {
    ethAdapter = createMockAdapter();
    polygonAdapter = createMockAdapter({
      getTransactions: vi.fn().mockResolvedValue([makeTx('0x111')]),
    });

    const adapters = new Map<number, IChainAdapter>([
      [1, ethAdapter],
      [137, polygonAdapter],
    ]);
    service = new AccountTransactionService(adapters);
  });

  describe('getAccountTransactions', () => {
    it('should return transactions attributed to each accountId', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
      ];

      const result = await service.getAccountTransactions(requests);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].accountId).toBe('metamask:abc:0x111');
      expect(result.transactions[0].transactions).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should query multiple chains per address', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1, 137],
        },
      ];

      const result = await service.getAccountTransactions(requests);

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].chainId).toBe(1);
      expect(result.transactions[0].transactions).toHaveLength(2);
      expect(result.transactions[1].chainId).toBe(137);
      expect(result.transactions[1].transactions).toHaveLength(1);
    });

    it('should deduplicate queries for same address on same chain', async () => {
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

      const result = await service.getAccountTransactions(requests);

      expect(ethAdapter.getTransactions).toHaveBeenCalledTimes(1);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].accountId).toBe('metamask:abc:0x111');
      expect(result.transactions[1].accountId).toBe('rabby:xyz:0x111');
    });

    it('should report per-account errors without failing the batch', async () => {
      (ethAdapter.getTransactions as any).mockRejectedValue(new Error('timeout'));

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

      const result = await service.getAccountTransactions(requests);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].accountId).toBe('rabby:xyz:0x222');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].accountId).toBe('metamask:abc:0x111');
    });

    it('should return empty for empty requests', async () => {
      const result = await service.getAccountTransactions([]);
      expect(result.transactions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass transaction options through', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
      ];

      await service.getAccountTransactions(requests, { limit: 10 });

      expect(ethAdapter.getTransactions).toHaveBeenCalledWith(
        '0x111',
        { limit: 10 },
      );
    });
  });
});
