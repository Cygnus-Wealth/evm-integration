import { Address, formatUnits } from 'viem';
import {
  LendingPosition,
  StakedPosition,
  LiquidityPosition,
  AssetType,
} from '@cygnus-wealth/data-models';
import { IDeFiProtocol } from '../types.js';
import { mapChainIdToChain } from '../../utils/mappers.js';

const CURVE_API_BASE = 'https://api.curve.fi/v1';

const CURVE_CHAIN_MAP: Record<number, string> = {
  1: 'ethereum',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism',
  43114: 'avalanche',
  8453: 'base',
  250: 'fantom',
};

interface CurveCoin {
  address: string;
  symbol: string;
  decimals: string;
}

interface CurvePool {
  id: string;
  name: string;
  address: string;
  lpTokenAddress: string;
  coins: CurveCoin[];
  usdTotal: number;
  totalSupply: string;
}

/** ABI fragments for on-chain reads */
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const CURVE_POOL_ABI = [
  {
    inputs: [{ name: 'i', type: 'uint256' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type ReadContractFn = (args: {
  address: Address;
  abi: readonly any[];
  functionName: string;
  args?: readonly any[];
}) => Promise<any>;

export interface CurveAdapterOptions {
  readContract?: ReadContractFn;
  apiBase?: string;
}

export class CurveAdapter implements IDeFiProtocol {
  readonly protocolName = 'Curve Finance';
  readonly supportedChains: number[];

  private readContract: ReadContractFn | null;
  private apiBase: string;

  constructor(options?: CurveAdapterOptions) {
    this.supportedChains = Object.keys(CURVE_CHAIN_MAP).map(Number);
    this.readContract = options?.readContract ?? null;
    this.apiBase = options?.apiBase ?? CURVE_API_BASE;
  }

  supportsChain(chainId: number): boolean {
    return this.supportedChains.includes(chainId);
  }

  async getLiquidityPositions(address: Address, chainId: number): Promise<LiquidityPosition[]> {
    if (!this.supportsChain(chainId) || !this.readContract) {
      return [];
    }

    try {
      const pools = await this.fetchPools(chainId);
      const positions: LiquidityPosition[] = [];

      for (const pool of pools) {
        try {
          const position = await this.readPoolPosition(address, pool, chainId);
          if (position) {
            positions.push(position);
          }
        } catch {
          continue;
        }
      }

      return positions;
    } catch {
      return [];
    }
  }

  async getLendingPositions(_address: Address, _chainId: number): Promise<LendingPosition[]> {
    return [];
  }

  async getStakedPositions(_address: Address, _chainId: number): Promise<StakedPosition[]> {
    return [];
  }

  private async fetchPools(chainId: number): Promise<CurvePool[]> {
    const chainName = CURVE_CHAIN_MAP[chainId];
    const response = await fetch(`${this.apiBase}/getPools/${chainName}/main`);
    if (!response.ok) {
      throw new Error(`Curve API error: ${response.status}`);
    }
    const result = await response.json();
    return result.data.poolData;
  }

  private async readPoolPosition(
    address: Address,
    pool: CurvePool,
    chainId: number,
  ): Promise<LiquidityPosition | null> {
    if (!this.readContract) return null;

    const lpTokenAddress = pool.lpTokenAddress as Address;

    // Read user's LP token balance
    const balance = await this.readContract({
      address: lpTokenAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as bigint;

    if (balance === 0n) {
      return null;
    }

    // Read total supply for share calculation
    const totalSupply = await this.readContract({
      address: lpTokenAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: 'totalSupply',
    }) as bigint;

    const share = totalSupply > 0n
      ? Number(balance) / Number(totalSupply)
      : 0;

    // Read on-chain coin balances from the pool contract
    const poolAddress = pool.address as Address;
    const coinBalances: bigint[] = [];
    for (let i = 0; i < pool.coins.length; i++) {
      const coinBalance = await this.readContract({
        address: poolAddress,
        abi: CURVE_POOL_ABI,
        functionName: 'balances',
        args: [BigInt(i)],
      }) as bigint;
      coinBalances.push(coinBalance);
    }

    const chain = mapChainIdToChain(chainId);
    const lpTokenBalance = formatUnits(balance, 18);

    // Build token balances proportional to user's share
    const tokens = pool.coins.map((coin, i) => {
      const decimals = parseInt(coin.decimals, 10);
      const totalCoinBalance = coinBalances[i];
      const userCoinAmount = (totalCoinBalance * balance) / totalSupply;
      const formattedAmount = formatUnits(userCoinAmount, decimals);

      return {
        assetId: `${chain.toLowerCase()}-${coin.address.toLowerCase()}`,
        asset: {
          id: `${chain.toLowerCase()}-${coin.address.toLowerCase()}`,
          symbol: coin.symbol,
          name: coin.symbol,
          type: AssetType.CRYPTOCURRENCY,
          decimals,
          contractAddress: coin.address,
          chain,
        },
        amount: formattedAmount,
      };
    });

    return {
      id: `curve-${pool.id}-${address.slice(0, 8)}`,
      protocol: 'Curve Finance',
      poolAddress: pool.address,
      poolName: pool.name,
      chain,
      tokens,
      lpTokenBalance,
      share,
      metadata: {
        poolId: pool.id,
        lpTokenAddress: pool.lpTokenAddress,
        tvlUsd: pool.usdTotal,
      },
    };
  }
}
