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
        useBalance: vi.fn(() => ({ data: { value: BigInt(1000) }, isSuccess: true })),
    };
});

const mockConfig = createConfig({
    chains: [mainnet],
    transports: { [mainnet.id]: http() },
    storage: createStorage({ storage: cookieStorage }),
});

const queryClient = new QueryClient();

test('fetches balance successfully', async () => {
    const { result } = renderHook(() => useEvmBalance('0x1234567890123456789012345678901234567890'), {
        wrapper: ({ children }) => (
            <WagmiProvider config={mockConfig}>
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            </WagmiProvider>
        ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.value).toBe(BigInt(1000));
});