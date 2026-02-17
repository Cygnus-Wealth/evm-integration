import { Address, formatUnits } from 'viem';
import {
  StakedPosition,
  LendingPosition,
  LiquidityPosition,
  AssetType,
} from '@cygnus-wealth/data-models';
import { IDeFiProtocol } from '../types.js';
import { mapChainIdToChain } from '../../utils/mappers.js';

const BEEFY_API_BASE = 'https://api.beefy.finance';

const BEEFY_CHAIN_MAP: Record<number, string> = {
  1: 'ethereum',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism',
  56: 'bsc',
  43114: 'avax',
  8453: 'base',
  250: 'fantom',
};

interface BeefyVault {
  id: string;
  name: string;
  token: string;
  tokenAddress: string;
  tokenDecimals: number;
  earnedToken: string;
  earnedTokenAddress: string;
  earnContractAddress: string;
  chain: string;
  status: string;
  platformId: string;
}

/** ABI fragments for Beefy vault on-chain reads */
const BEEFY_VAULT_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getPricePerFullShare',
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

export interface BeefyAdapterOptions {
  readContract?: ReadContractFn;
  apiBase?: string;
}

export class BeefyAdapter implements IDeFiProtocol {
  readonly protocolName = 'Beefy Finance';
  readonly supportedChains: number[];

  private readContract: ReadContractFn | null;
  private apiBase: string;

  constructor(options?: BeefyAdapterOptions) {
    this.supportedChains = Object.keys(BEEFY_CHAIN_MAP).map(Number);
    this.readContract = options?.readContract ?? null;
    this.apiBase = options?.apiBase ?? BEEFY_API_BASE;
  }

  supportsChain(chainId: number): boolean {
    return this.supportedChains.includes(chainId);
  }

  async getStakedPositions(address: Address, chainId: number): Promise<StakedPosition[]> {
    if (!this.supportsChain(chainId)) {
      return [];
    }

    try {
      const [vaults, apys] = await Promise.all([
        this.fetchVaults(chainId),
        this.fetchApys(),
      ]);

      const activeVaults = vaults.filter(v => v.status === 'active');
      const positions: StakedPosition[] = [];

      for (const vault of activeVaults) {
        try {
          const position = await this.readVaultPosition(address, vault, apys, chainId);
          if (position) {
            positions.push(position);
          }
        } catch {
          // Skip individual vault errors
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

  async getLiquidityPositions(_address: Address, _chainId: number): Promise<LiquidityPosition[]> {
    return [];
  }

  private async fetchVaults(chainId: number): Promise<BeefyVault[]> {
    const chainName = BEEFY_CHAIN_MAP[chainId];
    const response = await fetch(`${this.apiBase}/vaults`);
    if (!response.ok) {
      throw new Error(`Beefy API error: ${response.status}`);
    }
    const allVaults: BeefyVault[] = await response.json();
    return allVaults.filter(v => v.chain === chainName);
  }

  private async fetchApys(): Promise<Record<string, number>> {
    const response = await fetch(`${this.apiBase}/apy`);
    if (!response.ok) {
      return {};
    }
    return response.json();
  }

  private async readVaultPosition(
    address: Address,
    vault: BeefyVault,
    apys: Record<string, number>,
    chainId: number,
  ): Promise<StakedPosition | null> {
    if (!this.readContract) {
      return null;
    }

    const vaultAddress = vault.earnContractAddress as Address;

    const [balance, pricePerShare] = await Promise.all([
      this.readContract({
        address: vaultAddress,
        abi: BEEFY_VAULT_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
      this.readContract({
        address: vaultAddress,
        abi: BEEFY_VAULT_ABI,
        functionName: 'getPricePerFullShare',
        args: [],
      }) as Promise<bigint>,
    ]);

    if (balance === 0n) {
      return null;
    }

    const decimals = vault.tokenDecimals;
    const underlyingAmount = (balance * pricePerShare) / BigInt(10 ** 18);
    const formattedAmount = formatUnits(underlyingAmount, decimals);

    const chain = mapChainIdToChain(chainId);
    const apy = apys[vault.id];

    return {
      id: `beefy-${vault.id}-${address.slice(0, 8)}`,
      protocol: 'Beefy Finance',
      chain,
      asset: {
        id: `${chain.toLowerCase()}-${vault.tokenAddress.toLowerCase()}`,
        symbol: vault.token,
        name: vault.name,
        type: AssetType.STAKED_POSITION,
        decimals,
        contractAddress: vault.tokenAddress,
        chain,
      },
      stakedAmount: formattedAmount,
      rewards: [],
      apr: apy !== undefined ? apy * 100 : undefined,
      metadata: {
        vaultId: vault.id,
        vaultAddress: vault.earnContractAddress,
        earnedToken: vault.earnedToken,
        platformId: vault.platformId,
        vaultStatus: vault.status,
        pricePerFullShare: pricePerShare.toString(),
        mooTokenBalance: formatUnits(balance, 18),
      },
    };
  }
}
