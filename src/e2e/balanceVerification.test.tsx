import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { createPublicClient, http, formatEther } from 'viem';
import { mainnet, polygon, arbitrum } from 'viem/chains';
import { useEvmBalance } from '../hooks/useEvmBalance';
import { renderHook, waitFor } from '@testing-library/react';
import { WagmiProvider, createConfig } from 'wagmi';
import React from 'react';

const TEST_ADDRESS = '0xb3f87099943eC9A6D2ee102D55CE961589b7fDe2' as const;

// RPC endpoints
const RPC_ENDPOINTS = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  arbitrum: 'https://arbitrum-one-rpc.publicnode.com',
};

describe('End-to-End Balance Verification', () => {
  // Helper function to get balance via direct RPC call using curl
  const getBalanceViaRPC = (rpcUrl: string, address: string): bigint => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: 1,
    });

    try {
      const response = execSync(
        `curl -s -X POST -H "Content-Type: application/json" -d '${payload}' ${rpcUrl}`,
        { encoding: 'utf-8' }
      );
      
      const result = JSON.parse(response);
      if (result.error) {
        throw new Error(`RPC Error: ${result.error.message}`);
      }
      
      // Convert hex string to bigint
      return BigInt(result.result);
    } catch (error) {
      console.error('Failed to fetch balance via RPC:', error);
      throw error;
    }
  };

  // Helper function to get balance via viem (for comparison)
  const getBalanceViaViem = async (chainId: number, address: string): Promise<bigint> => {
    const chain = chainId === 1 ? mainnet : chainId === 137 ? polygon : arbitrum;
    const rpcUrl = chainId === 1 ? RPC_ENDPOINTS.ethereum : 
                   chainId === 137 ? RPC_ENDPOINTS.polygon : 
                   RPC_ENDPOINTS.arbitrum;

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const balance = await client.getBalance({ address: TEST_ADDRESS });
    return balance;
  };

  // Test configuration for wagmi
  const config = createConfig({
    chains: [mainnet, polygon, arbitrum],
    transports: {
      [mainnet.id]: http(RPC_ENDPOINTS.ethereum),
      [polygon.id]: http(RPC_ENDPOINTS.polygon),
      [arbitrum.id]: http(RPC_ENDPOINTS.arbitrum),
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WagmiProvider config={config}>{children}</WagmiProvider>
  );

  describe('Ethereum Mainnet', () => {
    it('should return the same balance as direct RPC call', async () => {
      // Get balance via direct RPC call
      const rpcBalance = getBalanceViaRPC(RPC_ENDPOINTS.ethereum, TEST_ADDRESS);
      console.log('Direct RPC Balance (wei):', rpcBalance.toString());
      console.log('Direct RPC Balance (ETH):', formatEther(rpcBalance));

      // Get balance via viem for additional verification
      const viemBalance = await getBalanceViaViem(1, TEST_ADDRESS);
      console.log('Viem Balance (wei):', viemBalance.toString());
      console.log('Viem Balance (ETH):', formatEther(viemBalance));

      // Get balance via our library
      const { result } = renderHook(
        () => useEvmBalance({ address: TEST_ADDRESS, chainId: 1 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });

      expect(result.current.error).toBeNull();
      expect(result.current.balance).toBeDefined();

      const libraryBalance = BigInt(result.current.balance!.amount);
      console.log('Library Balance (wei):', libraryBalance.toString());
      console.log('Library Balance formatted:', result.current.balance!.value?.amount);

      // Verify all three methods return the same balance
      expect(libraryBalance).toBe(rpcBalance);
      expect(libraryBalance).toBe(viemBalance);
      
      // Verify the Balance model structure
      expect(result.current.balance).toMatchObject({
        assetId: 'ethereum-native',
        amount: libraryBalance.toString(),
        asset: {
          id: 'ethereum-native',
          symbol: 'ETH',
          name: 'ETH',
          type: 'CRYPTOCURRENCY',
          decimals: 18,
          chain: 'ETHEREUM',
        },
      });
    });
  });

  describe('Polygon', () => {
    it('should return the same balance as direct RPC call', async () => {
      // Get balance via direct RPC call
      const rpcBalance = getBalanceViaRPC(RPC_ENDPOINTS.polygon, TEST_ADDRESS);
      console.log('Polygon Direct RPC Balance (wei):', rpcBalance.toString());
      console.log('Polygon Direct RPC Balance (MATIC):', formatEther(rpcBalance));

      // Get balance via viem
      const viemBalance = await getBalanceViaViem(137, TEST_ADDRESS);

      // Get balance via our library
      const { result } = renderHook(
        () => useEvmBalance({ address: TEST_ADDRESS, chainId: 137 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });

      expect(result.current.error).toBeNull();
      expect(result.current.balance).toBeDefined();

      const libraryBalance = BigInt(result.current.balance!.amount);

      // Verify all methods return the same balance
      expect(libraryBalance).toBe(rpcBalance);
      expect(libraryBalance).toBe(viemBalance);
      
      // Verify the Balance model structure for Polygon
      expect(result.current.balance).toMatchObject({
        assetId: 'polygon-native',
        amount: libraryBalance.toString(),
        asset: {
          id: 'polygon-native',
          symbol: 'MATIC',
          name: 'MATIC',
          type: 'CRYPTOCURRENCY',
          decimals: 18,
          chain: 'POLYGON',
        },
      });
    });
  });

  describe('Balance formatting', () => {
    it('should correctly format balance values', async () => {
      const { result } = renderHook(
        () => useEvmBalance({ address: TEST_ADDRESS, chainId: 1 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });

      const balance = result.current.balance!;
      const balanceInWei = BigInt(balance.amount);
      const expectedFormatted = parseFloat(formatEther(balanceInWei));

      // The library should provide a formatted value
      if (balance.value) {
        expect(balance.value.amount).toBeCloseTo(expectedFormatted, 6);
        expect(balance.value.currency).toBe('USD');
        expect(balance.value.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe('Error handling', () => {
    it('should handle invalid addresses gracefully', async () => {
      const { result } = renderHook(
        () => useEvmBalance({ address: '0xinvalid' as any, chainId: 1 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 5000 });

      expect(result.current.error).toBeDefined();
      expect(result.current.balance).toBeUndefined();
    });

    it('should handle unsupported chain IDs', async () => {
      const { result } = renderHook(
        () => useEvmBalance({ address: TEST_ADDRESS, chainId: 999999 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 5000 });

      // Should either error or return with chain type OTHER
      if (result.current.balance) {
        expect(result.current.balance.asset.chain).toBe('OTHER');
      }
    });
  });
});