import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountDeFiService } from './AccountDeFiService.js';
import type { IDeFiProtocol, DeFiPositions } from '../defi/types.js';
import type { AddressRequest, AccountId } from '../types/account.js';
import { Chain, AssetType, LendingPositionType } from '@cygnus-wealth/data-models';
import type { LendingPosition } from '@cygnus-wealth/data-models';

function makeLendingPosition(id: string): LendingPosition {
  return {
    id,
    protocol: 'Aave',
    chain: Chain.ETHEREUM,
    type: LendingPositionType.SUPPLY,
    asset: { id: 'eth', symbol: 'ETH', name: 'Ether', type: AssetType.CRYPTOCURRENCY },
    amount: '1.0',
  };
}

function createMockProtocol(supportedChains: number[]): IDeFiProtocol {
  return {
    protocolName: 'MockProtocol',
    supportedChains,
    supportsChain: (chainId: number) => supportedChains.includes(chainId),
    getLendingPositions: vi.fn().mockResolvedValue([makeLendingPosition('lend-1')]),
    getStakedPositions: vi.fn().mockResolvedValue([]),
    getLiquidityPositions: vi.fn().mockResolvedValue([]),
  };
}

describe('AccountDeFiService', () => {
  let protocol: IDeFiProtocol;
  let service: AccountDeFiService;

  beforeEach(() => {
    protocol = createMockProtocol([1, 137]);
    service = new AccountDeFiService([protocol]);
  });

  describe('getAccountPositions', () => {
    it('should return DeFi positions attributed to each accountId', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [1],
        },
      ];

      const result = await service.getAccountPositions(requests);

      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].accountId).toBe('metamask:abc:0x111');
      expect(result.positions[0].chainId).toBe(1);
      expect(result.positions[0].lendingPositions).toHaveLength(1);
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

      const result = await service.getAccountPositions(requests);

      expect(result.positions).toHaveLength(2);
      expect(result.positions[0].chainId).toBe(1);
      expect(result.positions[1].chainId).toBe(137);
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

      const result = await service.getAccountPositions(requests);

      // Protocol methods called once per unique (address, chain)
      expect(protocol.getLendingPositions).toHaveBeenCalledTimes(1);

      // Results fanned out to both accountIds
      expect(result.positions).toHaveLength(2);
      expect(result.positions[0].accountId).toBe('metamask:abc:0x111');
      expect(result.positions[1].accountId).toBe('rabby:xyz:0x111');
    });

    it('should report errors per-account without failing the batch', async () => {
      const failingProtocol = createMockProtocol([1, 137]);
      (failingProtocol.getLendingPositions as any).mockImplementation(
        (_addr: string, chainId: number) => {
          if (chainId === 1) return Promise.reject(new Error('timeout'));
          return Promise.resolve([]);
        },
      );
      (failingProtocol.getStakedPositions as any).mockImplementation(
        (_addr: string, chainId: number) => {
          if (chainId === 1) return Promise.reject(new Error('timeout'));
          return Promise.resolve([]);
        },
      );
      (failingProtocol.getLiquidityPositions as any).mockImplementation(
        (_addr: string, chainId: number) => {
          if (chainId === 1) return Promise.reject(new Error('timeout'));
          return Promise.resolve([]);
        },
      );

      const svc = new AccountDeFiService([failingProtocol]);
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

      const result = await svc.getAccountPositions(requests);

      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].accountId).toBe('rabby:xyz:0x222');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].accountId).toBe('metamask:abc:0x111');
    });

    it('should return empty for empty requests', async () => {
      const result = await service.getAccountPositions([]);
      expect(result.positions).toHaveLength(0);
    });

    it('should handle chains with no applicable protocols', async () => {
      const requests: AddressRequest[] = [
        {
          accountId: 'metamask:abc:0x111' as AccountId,
          address: '0x111',
          chainScope: [999], // no protocol supports this chain
        },
      ];

      const result = await service.getAccountPositions(requests);

      // Should still return a result with empty positions (not an error)
      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].lendingPositions).toHaveLength(0);
    });
  });
});
