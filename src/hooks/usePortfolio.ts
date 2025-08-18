import { useEffect, useState } from 'react';
import { PortfolioService } from '../application/services/PortfolioService';
import { EvmRepository } from '../infrastructure/blockchain/EvmRepository';
import { ConfigurationService } from '../infrastructure/config/ConfigurationService';
import { Portfolio } from '../domain/portfolio/Portfolio';

// Singleton service instances
const config = ConfigurationService.getInstance();
const repository = new EvmRepository(config);
const portfolioService = new PortfolioService(repository);

interface UsePortfolioParams {
    address?: string;
    chainId?: number;
}

interface UsePortfolioReturn {
    portfolio?: Portfolio;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    isValidAddress: boolean;
    isChainSupported: boolean;
}

/**
 * Hook for accessing portfolio data using the new DDD architecture
 * Provides a clean interface to the domain model
 */
export const usePortfolio = ({ 
    address, 
    chainId = 1 
}: UsePortfolioParams): UsePortfolioReturn => {
    const [portfolio, setPortfolio] = useState<Portfolio | undefined>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const isValidAddress = address ? portfolioService.isValidAddress(address) : false;
    const isChainSupported = portfolioService.isChainSupported(chainId);

    const fetchPortfolio = async () => {
        if (!address || !isValidAddress || !isChainSupported) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const portfolioData = await portfolioService.getPortfolio(address, chainId);
            setPortfolio(portfolioData);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch portfolio'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPortfolio();
    }, [address, chainId]);

    return {
        portfolio,
        isLoading,
        error,
        refetch: fetchPortfolio,
        isValidAddress,
        isChainSupported,
    };
};

/**
 * Hook for subscribing to real-time portfolio updates
 */
export const usePortfolioRealTime = ({ 
    address, 
    chainId = 1 
}: UsePortfolioParams): UsePortfolioReturn & { isConnected: boolean } => {
    const [portfolio, setPortfolio] = useState<Portfolio | undefined>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const isValidAddress = address ? portfolioService.isValidAddress(address) : false;
    const isChainSupported = portfolioService.isChainSupported(chainId);

    useEffect(() => {
        if (!address || !isValidAddress || !isChainSupported) {
            setIsConnected(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        const unsubscribe = portfolioService.subscribeToPortfolio(
            address,
            chainId,
            (updatedPortfolio) => {
                setPortfolio(updatedPortfolio);
                setIsLoading(false);
                setIsConnected(true);
            }
        );

        return () => {
            unsubscribe();
            setIsConnected(false);
        };
    }, [address, chainId, isValidAddress, isChainSupported]);

    const refetch = async () => {
        if (!address || !isValidAddress || !isChainSupported) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const portfolioData = await portfolioService.getPortfolio(address, chainId);
            setPortfolio(portfolioData);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch portfolio'));
        } finally {
            setIsLoading(false);
        }
    };

    return {
        portfolio,
        isLoading,
        error,
        refetch,
        isValidAddress,
        isChainSupported,
        isConnected,
    };
};