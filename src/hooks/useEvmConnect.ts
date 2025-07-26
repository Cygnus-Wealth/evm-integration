import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Chain } from '@cygnus-wealth/data-models';
import { mapChainIdToChain } from '../utils/mappers';

interface UseEvmConnectReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;
  
  // Account info
  address?: `0x${string}`;
  chainId?: number;
  chain?: Chain;
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  
  // Errors
  error: Error | null;
}

export const useEvmConnect = (): UseEvmConnectReturn => {
  const { address, isConnected, isConnecting, isDisconnected, chainId } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  // Find the first available connector (usually injected wallet like MetaMask)
  const handleConnect = () => {
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    }
  };

  const chain = chainId ? mapChainIdToChain(chainId) : undefined;

  return {
    // Connection state
    isConnected,
    isConnecting,
    isDisconnected,
    
    // Account info
    address,
    chainId,
    chain,
    
    // Actions
    connect: handleConnect,
    disconnect,
    
    // Errors
    error: connectError,
  };
};