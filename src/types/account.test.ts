import { describe, it, expect } from 'vitest';
import type {
  AccountId,
  AddressRequest,
  AccountBalance,
  AccountBalanceList,
  AccountTransaction,
  AccountTransactionList,
  AccountTokenBalance,
  AccountTokenList,
  AccountDeFiPositionList,
  AccountError,
  AccountNFTList,
} from './account.js';

describe('Account-Attributed Types', () => {
  describe('AddressRequest', () => {
    it('should accept valid AddressRequest with all fields', () => {
      const request: AddressRequest = {
        accountId: 'metamask:a1b2c3d4:0xAbC123' as AccountId,
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        chainScope: [1, 137, 42161],
      };

      expect(request.accountId).toBe('metamask:a1b2c3d4:0xAbC123');
      expect(request.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
      expect(request.chainScope).toEqual([1, 137, 42161]);
    });

    it('should accept watch address format accountId', () => {
      const request: AddressRequest = {
        accountId: 'watch:0xAbC123' as AccountId,
        address: '0xAbC123',
        chainScope: [1],
      };

      expect(request.accountId).toContain('watch:');
    });
  });

  describe('AccountBalanceList', () => {
    it('should structure balances with account attribution', () => {
      const result: AccountBalanceList = {
        balances: [
          {
            accountId: 'metamask:abc:0x123' as AccountId,
            address: '0x123',
            chainId: 1,
            nativeBalance: {
              assetId: 'eth',
              asset: { id: 'eth', symbol: 'ETH', name: 'Ether', type: 'CRYPTOCURRENCY' as any },
              amount: '1.5',
            },
            tokenBalances: [],
          },
        ],
        errors: [],
        timestamp: new Date().toISOString(),
      };

      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].accountId).toBe('metamask:abc:0x123');
      expect(result.errors).toHaveLength(0);
    });

    it('should support partial failure with errors', () => {
      const result: AccountBalanceList = {
        balances: [],
        errors: [
          {
            accountId: 'metamask:abc:0x123' as AccountId,
            address: '0x123',
            chainId: 137,
            error: 'RPC timeout',
            code: 'RPC_ERROR',
          },
        ],
        timestamp: new Date().toISOString(),
      };

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('RPC_ERROR');
    });
  });

  describe('AccountTransactionList', () => {
    it('should carry accountId on each transaction result', () => {
      const result: AccountTransactionList = {
        transactions: [
          {
            accountId: 'rabby:xyz:0x456' as AccountId,
            address: '0x456',
            chainId: 1,
            transactions: [],
          },
        ],
        errors: [],
        timestamp: new Date().toISOString(),
      };

      expect(result.transactions[0].accountId).toBe('rabby:xyz:0x456');
    });
  });

  describe('AccountTokenList', () => {
    it('should carry accountId on token discovery results', () => {
      const result: AccountTokenList = {
        tokens: [
          {
            accountId: 'metamask:abc:0x123' as AccountId,
            address: '0x123',
            chainId: 1,
            tokenBalances: [],
          },
        ],
        errors: [],
        timestamp: new Date().toISOString(),
      };

      expect(result.tokens[0].accountId).toBe('metamask:abc:0x123');
    });
  });

  describe('AccountDeFiPositionList', () => {
    it('should carry accountId on DeFi positions', () => {
      const result: AccountDeFiPositionList = {
        positions: [
          {
            accountId: 'metamask:abc:0x123' as AccountId,
            address: '0x123',
            chainId: 1,
            lendingPositions: [],
            stakedPositions: [],
            liquidityPositions: [],
          },
        ],
        errors: [],
        timestamp: new Date().toISOString(),
      };

      expect(result.positions[0].accountId).toBe('metamask:abc:0x123');
    });
  });

  describe('AccountNFTList', () => {
    it('should carry accountId on NFT results', () => {
      const result: AccountNFTList = {
        nfts: [
          {
            accountId: 'watch:0x789' as AccountId,
            address: '0x789',
            chainId: 1,
            nfts: [],
          },
        ],
        errors: [],
        timestamp: new Date().toISOString(),
      };

      expect(result.nfts[0].accountId).toBe('watch:0x789');
    });
  });

  describe('AccountError', () => {
    it('should include optional code field', () => {
      const error: AccountError = {
        accountId: 'metamask:abc:0x123' as AccountId,
        address: '0x123',
        chainId: 1,
        error: 'Chain not supported',
      };

      expect(error.code).toBeUndefined();
    });
  });
});
