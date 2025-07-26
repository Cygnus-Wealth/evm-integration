import { useBalance } from 'wagmi';
import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';
import { mapEvmBalanceToBalance } from '../utils/mappers';

interface UseEvmBalanceParams {
    address?: Address;
    chainId?: number;
}

interface UseEvmBalanceReturn {
    balance?: Balance;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

export const useEvmBalance = ({ 
    address, 
    chainId = 1 
}: UseEvmBalanceParams): UseEvmBalanceReturn => {
    const { data, isLoading, error, refetch } = useBalance({
        address,
        chainId,
    });

    const balance = data && address ? mapEvmBalanceToBalance(data, address, chainId) : undefined;

    return {
        balance,
        isLoading,
        error,
        refetch,
    };
};