import { useBalance, useToken } from 'wagmi';
import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';
import { mapTokenToAsset } from '../utils/mappers';
import { useEffect, useState } from 'react';

interface TokenBalanceQuery {
    tokenAddress: Address;
    enabled?: boolean;
}

interface UseEvmTokenBalancesParams {
    address?: Address;
    tokens: TokenBalanceQuery[];
    chainId?: number;
}

interface TokenBalanceResult {
    tokenAddress: Address;
    balance?: Balance;
    isLoading: boolean;
    error: Error | null;
}

interface UseEvmTokenBalancesReturn {
    balances: TokenBalanceResult[];
    isLoading: boolean;
    isAnyLoading: boolean;
    errors: Array<{ tokenAddress: Address; error: Error }>;
    refetch: () => void;
    refetchToken: (tokenAddress: Address) => void;
}

export const useEvmTokenBalances = ({ 
    address, 
    tokens,
    chainId = 1 
}: UseEvmTokenBalancesParams): UseEvmTokenBalancesReturn => {
    const [balances, setBalances] = useState<TokenBalanceResult[]>([]);
    const [refetchTrigger, setRefetchTrigger] = useState(0);

    // Create hooks for each token
    const tokenHooks = tokens.map(({ tokenAddress, enabled = true }) => {
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

        return {
            tokenAddress,
            tokenData,
            balanceData,
            isLoading: enabled && !!address ? isLoading : false,
            error: enabled && !!address ? error : null,
            refetch,
            enabled,
        };
    });

    // Update balances when data changes
    useEffect(() => {
        const newBalances: TokenBalanceResult[] = tokenHooks.map(hook => {
            let balance: Balance | undefined;
            
            if (hook.balanceData && hook.tokenData && address && hook.enabled) {
                // Map token data to asset
                const asset = mapTokenToAsset(
                    hook.tokenAddress,
                    hook.tokenData.symbol || 'UNKNOWN',
                    hook.tokenData.name || 'Unknown Token',
                    hook.tokenData.decimals,
                    chainId
                );

                // Create balance object
                balance = {
                    assetId: asset.id,
                    asset: asset,
                    amount: hook.balanceData.value.toString(),
                    value: hook.balanceData.formatted ? {
                        amount: parseFloat(hook.balanceData.formatted),
                        currency: 'USD',
                        timestamp: new Date()
                    } : undefined,
                };
            }

            return {
                tokenAddress: hook.tokenAddress,
                balance,
                isLoading: hook.isLoading,
                error: hook.error,
            };
        });

        setBalances(newBalances);
    }, [tokenHooks, address, chainId, refetchTrigger]);

    // Collect errors
    const errors = tokenHooks
        .filter(hook => hook.error)
        .map(hook => ({ tokenAddress: hook.tokenAddress, error: hook.error! }));

    // Check if any are loading
    const isAnyLoading = tokenHooks.some(hook => hook.isLoading);
    const isLoading = tokenHooks.every(hook => hook.isLoading);

    // Refetch all
    const refetch = () => {
        tokenHooks.forEach(hook => hook.refetch());
        setRefetchTrigger(prev => prev + 1);
    };

    // Refetch specific token
    const refetchToken = (tokenAddress: Address) => {
        const hook = tokenHooks.find(h => h.tokenAddress === tokenAddress);
        if (hook) {
            hook.refetch();
            setRefetchTrigger(prev => prev + 1);
        }
    };

    return {
        balances,
        isLoading,
        isAnyLoading,
        errors,
        refetch,
        refetchToken,
    };
};