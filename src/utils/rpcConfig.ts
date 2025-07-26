import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

export const getPublicClient = (chainId: number = 1) => {
    const chain = chainId === 1 ? mainnet : mainnet;
    return createPublicClient({
        chain,
        transport: http(), // Uses public RPC like Infura by default
    });
};