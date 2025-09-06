import { Asset, Balance, Transaction, AssetType, Chain, TransactionType } from '@cygnus-wealth/data-models';
import { Address } from 'viem';

/**
 * Balance data structure returned from blockchain queries
 */
interface BalanceData {
    value: bigint;
    symbol: string;
    decimals: number;
    formatted?: string;
}

/**
 * Maps chain ID to Chain enum
 */
export function mapChainIdToChain(chainId: number): Chain {
    switch (chainId) {
        case 1:
            return Chain.ETHEREUM;
        case 137:
            return Chain.POLYGON;
        case 42161:
            return Chain.ARBITRUM;
        case 10:
            return Chain.OPTIMISM;
        case 43114:
            return Chain.AVALANCHE;
        case 56:
            return Chain.BSC;
        default:
            return Chain.OTHER;
    }
}

/**
 * Maps chain enum to chain ID
 */
export function mapChainToChainId(chain: Chain): number {
    switch (chain) {
        case Chain.ETHEREUM:
            return 1;
        case Chain.POLYGON:
            return 137;
        case Chain.ARBITRUM:
            return 42161;
        case Chain.OPTIMISM:
            return 10;
        case Chain.AVALANCHE:
            return 43114;
        case Chain.BSC:
            return 56;
        default:
            return 1; // Default to Ethereum mainnet
    }
}

/**
 * Maps EVM balance data to standard Balance interface
 */
export function mapEvmBalanceToBalance(
    balanceData: BalanceData,
    address: Address,
    chainId: number
): Balance {
    const chain = mapChainIdToChain(chainId);
    
    // Create native token asset
    const asset: Asset = {
        id: `${chain.toLowerCase()}-native`,
        symbol: balanceData.symbol,
        name: balanceData.symbol, // For native tokens, name often equals symbol
        type: AssetType.CRYPTOCURRENCY,
        decimals: balanceData.decimals,
        chain: chain,
    };

    return {
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

/**
 * Maps ERC20 token data to Asset interface
 */
export function mapTokenToAsset(
    tokenAddress: Address,
    symbol: string,
    name: string,
    decimals: number,
    chainId: number
): Asset {
    const chain = mapChainIdToChain(chainId);
    
    return {
        id: `${chain.toLowerCase()}-${tokenAddress.toLowerCase()}`,
        symbol: symbol,
        name: name,
        type: AssetType.CRYPTOCURRENCY,
        decimals: decimals,
        contractAddress: tokenAddress,
        chain: chain,
    };
}

/**
 * Maps EVM transaction data to standard Transaction interface
 */
export function mapEvmTransaction(
    txData: {
        hash: string;
        from: Address;
        to?: Address | null;
        value: bigint;
        blockNumber?: bigint;
        timestamp?: bigint;
        gasUsed?: bigint;
        gasPrice?: bigint;
        status?: 'success' | 'reverted';
    },
    chainId: number,
    accountId: string
): Transaction {
    const chain = mapChainIdToChain(chainId);
    
    // Determine transaction type based on available data
    let type: TransactionType = TransactionType.TRANSFER;
    if (!txData.to || txData.to === '0x0000000000000000000000000000000000000000') {
        type = TransactionType.CONTRACT_INTERACTION;
    }

    // Map status
    let status: Transaction['status'] = 'COMPLETED';
    if (txData.status === 'reverted') {
        status = 'FAILED';
    }

    const transaction: Transaction = {
        id: txData.hash,
        accountId: accountId,
        type: type,
        status: status,
        hash: txData.hash,
        chain: chain,
        from: txData.from,
        to: txData.to || undefined,
        timestamp: txData.timestamp ? new Date(Number(txData.timestamp) * 1000) : new Date(),
        blockNumber: txData.blockNumber ? Number(txData.blockNumber) : undefined,
    };

    // Add native token transfer if value > 0
    if (txData.value > 0n) {
        const nativeAsset: Asset = {
            id: `${chain.toLowerCase()}-native`,
            symbol: chain === Chain.ETHEREUM ? 'ETH' : 
                    chain === Chain.POLYGON ? 'MATIC' :
                    chain === Chain.BSC ? 'BNB' :
                    chain === Chain.AVALANCHE ? 'AVAX' : 'ETH',
            name: chain === Chain.ETHEREUM ? 'Ethereum' : 
                  chain === Chain.POLYGON ? 'Polygon' :
                  chain === Chain.BSC ? 'BNB' :
                  chain === Chain.AVALANCHE ? 'Avalanche' : 'Native Token',
            type: AssetType.CRYPTOCURRENCY,
            decimals: 18,
            chain: chain,
        };

        transaction.assets_out = [{
            asset: nativeAsset,
            amount: txData.value.toString(),
        }];
    }

    // Add gas fees if available
    if (txData.gasUsed && txData.gasPrice) {
        const gasAmount = txData.gasUsed * txData.gasPrice;
        const nativeAsset: Asset = {
            id: `${chain.toLowerCase()}-native`,
            symbol: chain === Chain.ETHEREUM ? 'ETH' : 
                    chain === Chain.POLYGON ? 'MATIC' :
                    chain === Chain.BSC ? 'BNB' :
                    chain === Chain.AVALANCHE ? 'AVAX' : 'ETH',
            name: chain === Chain.ETHEREUM ? 'Ethereum' : 
                  chain === Chain.POLYGON ? 'Polygon' :
                  chain === Chain.BSC ? 'BNB' :
                  chain === Chain.AVALANCHE ? 'Avalanche' : 'Native Token',
            type: AssetType.CRYPTOCURRENCY,
            decimals: 18,
            chain: chain,
        };

        transaction.fees = [{
            asset: nativeAsset,
            amount: gasAmount.toString(),
        }];
    }

    return transaction;
}