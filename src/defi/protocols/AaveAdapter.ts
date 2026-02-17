import { Address, formatUnits } from 'viem';
import {
  LendingPosition,
  LendingPositionType,
  StakedPosition,
  LiquidityPosition,
  AssetType,
} from '@cygnus-wealth/data-models';
import { IDeFiProtocol } from '../types.js';
import { mapChainIdToChain } from '../../utils/mappers.js';

/**
 * Aave V3 contract deployment addresses per chain
 */
export const AAVE_V3_DEPLOYMENTS: Record<number, { pool: Address; poolDataProvider: Address }> = {
  1: {
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    poolDataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426c4C998726',
  },
  137: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  },
  42161: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  },
  10: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  },
  8453: {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolDataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
  },
  43114: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  },
};

/** ABI fragments for Aave V3 Pool */
const AAVE_POOL_ABI = [
  {
    inputs: [],
    name: 'getReservesList',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserAccountData',
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** ABI fragments for Aave V3 Pool Data Provider */
const AAVE_DATA_PROVIDER_ABI = [
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    name: 'getUserReserveData',
    outputs: [
      { name: 'currentATokenBalance', type: 'uint256' },
      { name: 'currentStableDebtTokenBalance', type: 'uint256' },
      { name: 'currentVariableDebtTokenBalance', type: 'uint256' },
      { name: 'principalStableDebt', type: 'uint256' },
      { name: 'scaledVariableDebt', type: 'uint256' },
      { name: 'stableBorrowRate', type: 'uint256' },
      { name: 'liquidityRate', type: 'uint256' },
      { name: 'stableRateLastUpdated', type: 'uint40' },
      { name: 'usageAsCollateralEnabled', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getReserveConfigurationData',
    outputs: [
      { name: 'decimals', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'liquidationThreshold', type: 'uint256' },
      { name: 'liquidationBonus', type: 'uint256' },
      { name: 'reserveFactor', type: 'uint256' },
      { name: 'usageAsCollateralEnabled', type: 'bool' },
      { name: 'borrowingEnabled', type: 'bool' },
      { name: 'stableBorrowRateEnabled', type: 'bool' },
      { name: 'isActive', type: 'bool' },
      { name: 'isFrozen', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getReserveTokensAddresses',
    outputs: [
      { name: 'aTokenAddress', type: 'address' },
      { name: 'stableDebtTokenAddress', type: 'address' },
      { name: 'variableDebtTokenAddress', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** ERC20 ABI fragments */
const ERC20_ABI = [
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
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

export interface AaveAdapterOptions {
  readContract?: ReadContractFn;
}

/** Aave's RAY unit (1e27) for rate conversions */
const RAY = BigInt(10) ** BigInt(27);

export class AaveAdapter implements IDeFiProtocol {
  readonly protocolName = 'Aave V3';
  readonly supportedChains: number[];

  private readContract: ReadContractFn | null;

  constructor(options?: AaveAdapterOptions) {
    this.supportedChains = Object.keys(AAVE_V3_DEPLOYMENTS).map(Number);
    this.readContract = options?.readContract ?? null;
  }

  supportsChain(chainId: number): boolean {
    return chainId in AAVE_V3_DEPLOYMENTS;
  }

  async getLendingPositions(address: Address, chainId: number): Promise<LendingPosition[]> {
    if (!this.supportsChain(chainId) || !this.readContract) {
      return [];
    }

    try {
      const deployment = AAVE_V3_DEPLOYMENTS[chainId];
      const chain = mapChainIdToChain(chainId);

      // Fetch reserves list
      const reserves = await this.readContract({
        address: deployment.pool,
        abi: AAVE_POOL_ABI,
        functionName: 'getReservesList',
      }) as Address[];

      // Fetch user account-level data (health factor, etc.)
      const accountDataRaw = await this.readContract({
        address: deployment.pool,
        abi: AAVE_POOL_ABI,
        functionName: 'getUserAccountData',
        args: [address],
      }) as [bigint, bigint, bigint, bigint, bigint, bigint];

      const healthFactor = Number(accountDataRaw[5]) / 1e18;

      const positions: LendingPosition[] = [];

      for (const reserveAddress of reserves) {
        try {
          const reservePositions = await this.readReservePosition(
            address,
            reserveAddress,
            deployment.poolDataProvider,
            chainId,
            chain,
            healthFactor,
          );
          positions.push(...reservePositions);
        } catch {
          continue;
        }
      }

      return positions;
    } catch {
      return [];
    }
  }

  async getStakedPositions(_address: Address, _chainId: number): Promise<StakedPosition[]> {
    return [];
  }

  async getLiquidityPositions(_address: Address, _chainId: number): Promise<LiquidityPosition[]> {
    return [];
  }

  private async readReservePosition(
    userAddress: Address,
    reserveAddress: Address,
    dataProviderAddress: Address,
    chainId: number,
    chain: ReturnType<typeof mapChainIdToChain>,
    healthFactor: number,
  ): Promise<LendingPosition[]> {
    if (!this.readContract) return [];

    // Fetch user reserve data
    const userReserveRaw = await this.readContract({
      address: dataProviderAddress,
      abi: AAVE_DATA_PROVIDER_ABI,
      functionName: 'getUserReserveData',
      args: [reserveAddress, userAddress],
    }) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, boolean];

    const aTokenBalance = userReserveRaw[0];
    const stableDebt = userReserveRaw[1];
    const variableDebt = userReserveRaw[2];
    const liquidityRate = userReserveRaw[6];

    // Skip if user has no position in this reserve
    if (aTokenBalance === 0n && stableDebt === 0n && variableDebt === 0n) {
      return [];
    }

    // Fetch reserve config for decimals and thresholds
    const configRaw = await this.readContract({
      address: dataProviderAddress,
      abi: AAVE_DATA_PROVIDER_ABI,
      functionName: 'getReserveConfigurationData',
      args: [reserveAddress],
    }) as [bigint, bigint, bigint, bigint, bigint, boolean, boolean, boolean, boolean, boolean];

    const decimals = Number(configRaw[0]);
    const liquidationThreshold = Number(configRaw[2]) / 10000;

    // Fetch token addresses (for identification)
    await this.readContract({
      address: dataProviderAddress,
      abi: AAVE_DATA_PROVIDER_ABI,
      functionName: 'getReserveTokensAddresses',
      args: [reserveAddress],
    });

    // Fetch token symbol and name
    const [symbol, name] = await Promise.all([
      this.readContract({
        address: reserveAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }) as Promise<string>,
      this.readContract({
        address: reserveAddress,
        abi: ERC20_ABI,
        functionName: 'name',
      }) as Promise<string>,
    ]);

    const positions: LendingPosition[] = [];

    // Supply position
    if (aTokenBalance > 0n) {
      const supplyApy = Number(liquidityRate) / Number(RAY) * 100;

      positions.push({
        id: `aave-v3-supply-${reserveAddress.slice(0, 10)}-${userAddress.slice(0, 8)}`,
        protocol: 'Aave V3',
        chain,
        type: LendingPositionType.SUPPLY,
        asset: {
          id: `${chain.toLowerCase()}-${reserveAddress.toLowerCase()}`,
          symbol,
          name,
          type: AssetType.CRYPTOCURRENCY,
          decimals,
          contractAddress: reserveAddress,
          chain,
        },
        amount: formatUnits(aTokenBalance, decimals),
        apy: supplyApy,
        metadata: {
          usageAsCollateralEnabled: userReserveRaw[8],
          reserveAddress,
        },
      });
    }

    // Borrow position (variable + stable combined)
    const totalDebt = variableDebt + stableDebt;
    if (totalDebt > 0n) {
      positions.push({
        id: `aave-v3-borrow-${reserveAddress.slice(0, 10)}-${userAddress.slice(0, 8)}`,
        protocol: 'Aave V3',
        chain,
        type: LendingPositionType.BORROW,
        asset: {
          id: `${chain.toLowerCase()}-${reserveAddress.toLowerCase()}`,
          symbol,
          name,
          type: AssetType.CRYPTOCURRENCY,
          decimals,
          contractAddress: reserveAddress,
          chain,
        },
        amount: formatUnits(totalDebt, decimals),
        healthFactor,
        liquidationThreshold,
        metadata: {
          variableDebt: formatUnits(variableDebt, decimals),
          stableDebt: formatUnits(stableDebt, decimals),
          reserveAddress,
        },
      });
    }

    return positions;
  }
}
