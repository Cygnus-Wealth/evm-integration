import { useBalance } from 'wagmi';
import { Address } from 'viem';

export const useEvmBalance = (address: Address | undefined, chainId: number = 1) => {
    return useBalance({
        address,
        chainId,
    });
};