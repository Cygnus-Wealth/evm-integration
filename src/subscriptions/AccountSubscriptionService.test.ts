import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountSubscriptionService } from './AccountSubscriptionService.js';
import type { ISubscriptionService, SubscriptionHandle, LiveBalanceUpdate } from './types.js';
import type { AddressRequest, AccountId } from '../types/account.js';

function createMockSubscriptionService(): ISubscriptionService {
  const handles = new Map<string, any>();
  let nextId = 1;

  return {
    subscribeBalances: vi.fn().mockImplementation((chainId: number, addresses: string[]) => {
      const id = `sub-${nextId++}`;
      const dataCallbacks = new Set<(data: any) => void>();
      const handle: SubscriptionHandle<LiveBalanceUpdate> = {
        id,
        type: 'balances',
        chainId,
        status: 'active',
        transport: 'websocket',
        createdAt: new Date(),
        onData: (cb) => { dataCallbacks.add(cb); },
        onError: vi.fn(),
        onStatusChange: vi.fn(),
        unsubscribe: vi.fn(),
      };
      handles.set(id, { handle, dataCallbacks });
      return handle;
    }),
    subscribeTokenTransfers: vi.fn(),
    subscribeNewBlocks: vi.fn(),
    subscribePendingTransactions: vi.fn(),
    subscribeContractEvents: vi.fn(),
    unsubscribe: vi.fn(),
    getSubscriptionStatus: vi.fn(),
    getConnectionInfo: vi.fn(),
    getAllSubscriptions: vi.fn().mockReturnValue([]),
    destroy: vi.fn(),
    // Helper to simulate data events (not part of the interface)
    _simulateBalanceUpdate: (subId: string, update: LiveBalanceUpdate) => {
      const entry = handles.get(subId);
      if (entry) {
        for (const cb of entry.dataCallbacks) cb(update);
      }
    },
  } as any;
}

describe('AccountSubscriptionService', () => {
  let mockSubService: ReturnType<typeof createMockSubscriptionService>;
  let service: AccountSubscriptionService;

  beforeEach(() => {
    mockSubService = createMockSubscriptionService();
    service = new AccountSubscriptionService(mockSubService as any);
  });

  describe('subscribeAccountBalances', () => {
    it('should return a handle that fires with accountIds', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
      ];

      const handle = service.subscribeAccountBalances(requests);

      expect(handle).toBeDefined();
      expect(handle.id).toBeDefined();
      expect(mockSubService.subscribeBalances).toHaveBeenCalledWith(1, ['0x111']);
    });

    it('should enrich balance updates with accountIds', () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
      ];

      const handle = service.subscribeAccountBalances(requests);
      const received: any[] = [];
      handle.onData((data) => received.push(data));

      // Simulate a balance update for address 0x111
      const subId = (mockSubService.subscribeBalances as any).mock.results[0].value.id;
      (mockSubService as any)._simulateBalanceUpdate(subId, {
        address: '0x111',
        chainId: 1,
        balance: 1000n,
        blockNumber: 100n,
        timestamp: new Date(),
      });

      expect(received).toHaveLength(1);
      expect(received[0].accountIds).toEqual(['metamask:abc:0x111']);
      expect(received[0].address).toBe('0x111');
    });

    it('should attribute to multiple accountIds for duplicate addresses', () => {
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

      const handle = service.subscribeAccountBalances(requests);
      const received: any[] = [];
      handle.onData((data) => received.push(data));

      // Only one subscription created (deduplicated)
      expect(mockSubService.subscribeBalances).toHaveBeenCalledTimes(1);

      const subId = (mockSubService.subscribeBalances as any).mock.results[0].value.id;
      (mockSubService as any)._simulateBalanceUpdate(subId, {
        address: '0x111',
        chainId: 1,
        balance: 1000n,
        blockNumber: 100n,
        timestamp: new Date(),
      });

      expect(received).toHaveLength(1);
      expect(received[0].accountIds).toEqual([
        'metamask:abc:0x111',
        'rabby:xyz:0x111',
      ]);
    });

    it('should create separate subscriptions per chain', () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1, 137],
        },
      ];

      service.subscribeAccountBalances(requests);

      expect(mockSubService.subscribeBalances).toHaveBeenCalledTimes(2);
      expect(mockSubService.subscribeBalances).toHaveBeenCalledWith(1, ['0x111']);
      expect(mockSubService.subscribeBalances).toHaveBeenCalledWith(137, ['0x111']);
    });

    it('should unsubscribe from all underlying subscriptions on unsubscribe', () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
      ];

      const handle = service.subscribeAccountBalances(requests);
      handle.unsubscribe();

      const innerHandle = (mockSubService.subscribeBalances as any).mock.results[0].value;
      expect(innerHandle.unsubscribe).toHaveBeenCalled();
    });
  });
});
