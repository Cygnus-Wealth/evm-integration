import { useBalance, useToken } from 'wagmi';
import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';
import { mapEvmBalanceToBalance, mapTokenToAsset } from '../utils/mappers';

interface UseEvmTokenBalanceParams {
    address?: Address;
    tokenAddress: Address;
    chainId?: number;
}

interface UseEvmTokenBalanceReturn {
    balance?: Balance;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

export const useEvmTokenBalance = ({ 
    address, 
    tokenAddress,
    chainId = 1 
}: UseEvmTokenBalanceParams): UseEvmTokenBalanceReturn => {
    // Get token metadata
    const { data: tokenData } = useToken({
        address: tokenAddress,
        chainId,
    });

    // Get token balance
    const { data: balanceData, isLoading, error, refetch } = useBalance({
        address,
        token: tokenAddress,
        chainId,
    });

    let balance: Balance | undefined;
    
    if (balanceData && tokenData && address) {
        // Map token data to asset
        const asset = mapTokenToAsset(
            tokenAddress,
            tokenData.symbol || 'UNKNOWN',
            tokenData.name || 'Unknown Token',
            tokenData.decimals,
            chainId
        );

        // Create balance object
        balance = {
            assetId: asset.id,
            asset: asset,
            amount: balanceData.value.toString(),
            value: balanceData.formatted ? {
                amount: parseFloat(balanceData.formatted),
                currency: 'USD',
                timestamp: new Date()
            } : undefined,
        };
    }

    return {
        balance,
        isLoading,
        error,
        refetch,
    };
};