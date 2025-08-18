import { renderHook, waitFor } from '@testing-library/react';
import { useEvmBalance } from './useEvmBalance';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, cookieStorage, createStorage } from 'wagmi';
import { http } from 'viem';
import { mainnet } from 'viem/chains';
import { vi } from 'vitest';

vi.mock('wagmi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('wagmi')>();
    return {
        ...actual,
        useBalance: vi.fn(() => ({ 
            data: { 
                value: BigInt(1000),
                decimals: 18,
                symbol: 'ETH',
                formatted: '0.000000000000001'
            }, 
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })),
    };
});

const mockConfig = createConfig({
    chains: [mainnet],
    transports: { [mainnet.id]: http() },
    storage: createStorage({ storage: cookieStorage }),
});

const queryClient = new QueryClient();

test('fetches balance successfully', async () => {
    const { result } = renderHook(() => useEvmBalance({ 
        address: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        chainId: 1
    }), {
        wrapper: ({ children }) => (
            <WagmiProvider config={mockConfig}>
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            </WagmiProvider>
        ),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.balance).toBeDefined();
    expect(result.current.balance?.amount).toBe('1000');
});