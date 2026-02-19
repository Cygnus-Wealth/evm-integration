import { Address, formatUnits, keccak256, encodePacked, getAddress } from 'viem';
import {
  LendingPosition,
  StakedPosition,
  LiquidityPosition,
  AssetType,
} from '@cygnus-wealth/data-models';
import { IDeFiProtocol } from '../types.js';
import { mapChainIdToChain } from '../../utils/mappers.js';

/**
 * Uniswap V3 NonfungiblePositionManager + Factory addresses per chain.
 * Position manager is the same canonical address on all standard deployments.
 */
export const UNISWAP_V3_DEPLOYMENTS: Record<number, { positionManager: Address; factory: Address }> = {
  1: {
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  137: {
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  42161: {
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  10: {
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  8453: {
    positionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  },
};

/** ABI fragments for NonfungiblePositionManager */
const POSITION_MANAGER_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'positions',
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** ABI fragments for Uniswap V3 Pool */
const POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
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
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** Uniswap V3 pool init code hash for CREATE2 pool address computation */
const POOL_INIT_CODE_HASH = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54';

export type ReadContractFn = (args: {
  address: Address;
  abi: readonly any[];
  functionName: string;
  args?: readonly any[];
}) => Promise<any>;

export interface UniswapV3AdapterOptions {
  readContract?: ReadContractFn;
}

/**
 * Computes the Uniswap V3 pool address from token pair and fee tier using CREATE2.
 */
function computePoolAddress(factory: Address, token0: Address, token1: Address, fee: number): Address {
  const [sortedToken0, sortedToken1] = token0.toLowerCase() < token1.toLowerCase()
    ? [token0, token1]
    : [token1, token0];

  const salt = keccak256(
    encodePacked(
      ['address', 'address', 'uint24'],
      [sortedToken0, sortedToken1, fee],
    ),
  );

  const hash = keccak256(
    encodePacked(
      ['bytes1', 'address', 'bytes32', 'bytes32'],
      ['0xff', factory, salt, POOL_INIT_CODE_HASH as `0x${string}`],
    ),
  );

  return getAddress(`0x${hash.slice(26)}`) as Address;
}

/**
 * Computes underlying token amounts from concentrated liquidity position data.
 *
 * Uses Uniswap V3 math:
 *   sqrtPrice = sqrt(1.0001^tick)
 *   If currentTick < tickLower: all in token0
 *   If currentTick >= tickUpper: all in token1
 *   Otherwise: split between token0 and token1
 */
function computeTokenAmounts(
  liquidity: bigint,
  currentTick: number,
  tickLower: number,
  tickUpper: number,
): { amount0: bigint; amount1: bigint } {
  const sqrtPriceLower = Math.sqrt(1.0001 ** tickLower);
  const sqrtPriceUpper = Math.sqrt(1.0001 ** tickUpper);
  const liq = Number(liquidity);

  let amount0 = 0;
  let amount1 = 0;

  if (currentTick < tickLower) {
    // Position entirely in token0
    amount0 = liq * (1 / sqrtPriceLower - 1 / sqrtPriceUpper);
  } else if (currentTick >= tickUpper) {
    // Position entirely in token1
    amount1 = liq * (sqrtPriceUpper - sqrtPriceLower);
  } else {
    // Position is in range — split between both tokens
    const sqrtPriceCurrent = Math.sqrt(1.0001 ** currentTick);
    amount0 = liq * (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper);
    amount1 = liq * (sqrtPriceCurrent - sqrtPriceLower);
  }

  return {
    amount0: BigInt(Math.max(0, Math.floor(amount0))),
    amount1: BigInt(Math.max(0, Math.floor(amount1))),
  };
}

export class UniswapV3Adapter implements IDeFiProtocol {
  readonly protocolName = 'Uniswap V3';
  readonly supportedChains: number[];

  private readContract: ReadContractFn | null;

  constructor(options?: UniswapV3AdapterOptions) {
    this.supportedChains = Object.keys(UNISWAP_V3_DEPLOYMENTS).map(Number);
    this.readContract = options?.readContract ?? null;
  }

  supportsChain(chainId: number): boolean {
    return chainId in UNISWAP_V3_DEPLOYMENTS;
  }

  async getLiquidityPositions(address: Address, chainId: number): Promise<LiquidityPosition[]> {
    if (!this.supportsChain(chainId) || !this.readContract) {
      return [];
    }

    try {
      const deployment = UNISWAP_V3_DEPLOYMENTS[chainId];
      const chain = mapChainIdToChain(chainId);

      // Get the number of NFT positions owned by this address
      const balance = await this.readContract({
        address: deployment.positionManager,
        abi: POSITION_MANAGER_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;

      if (balance === 0n) {
        return [];
      }

      // Fetch all token IDs
      const tokenIds: bigint[] = [];
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await this.readContract({
          address: deployment.positionManager,
          abi: POSITION_MANAGER_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [address, BigInt(i)],
        }) as bigint;
        tokenIds.push(tokenId);
      }

      // Read each position
      const positions: LiquidityPosition[] = [];
      for (const tokenId of tokenIds) {
        try {
          const position = await this.readPosition(
            tokenId,
            deployment,
            chainId,
            chain,
            address,
          );
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

  private async readPosition(
    tokenId: bigint,
    deployment: { positionManager: Address; factory: Address },
    chainId: number,
    chain: ReturnType<typeof mapChainIdToChain>,
    userAddress: Address,
  ): Promise<LiquidityPosition | null> {
    if (!this.readContract) return null;

    // Read position data from NonfungiblePositionManager
    const positionData = await this.readContract({
      address: deployment.positionManager,
      abi: POSITION_MANAGER_ABI,
      functionName: 'positions',
      args: [tokenId],
    }) as [bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint];

    const token0 = positionData[2];
    const token1 = positionData[3];
    const fee = positionData[4];
    const tickLower = positionData[5];
    const tickUpper = positionData[6];
    const liquidity = positionData[7];
    const tokensOwed0 = positionData[10];
    const tokensOwed1 = positionData[11];

    // Skip closed positions (no liquidity and no uncollected fees)
    if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) {
      return null;
    }

    // Fetch token metadata
    const [symbol0, name0, decimals0, symbol1, name1, decimals1] = await Promise.all([
      this.readContract({
        address: token0,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }) as Promise<string>,
      this.readContract({
        address: token0,
        abi: ERC20_ABI,
        functionName: 'name',
      }) as Promise<string>,
      this.readContract({
        address: token0,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }) as Promise<number>,
      this.readContract({
        address: token1,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }) as Promise<string>,
      this.readContract({
        address: token1,
        abi: ERC20_ABI,
        functionName: 'name',
      }) as Promise<string>,
      this.readContract({
        address: token1,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }) as Promise<number>,
    ]);

    // Compute pool address
    const poolAddress = computePoolAddress(deployment.factory, token0, token1, fee);

    // Read current tick from pool's slot0
    const slot0 = await this.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'slot0',
    }) as [bigint, number, number, number, number, number, boolean];

    const currentTick = slot0[1];
    const inRange = currentTick >= tickLower && currentTick < tickUpper;

    // Compute underlying token amounts
    const { amount0, amount1 } = computeTokenAmounts(liquidity, currentTick, tickLower, tickUpper);

    const position: LiquidityPosition = {
      id: `uniswap-v3-${tokenId}-${userAddress.slice(0, 8)}`,
      protocol: 'Uniswap V3',
      poolAddress,
      poolName: `${symbol0}/${symbol1}`,
      chain,
      tokens: [
        {
          assetId: `${chain.toLowerCase()}-${token0.toLowerCase()}`,
          asset: {
            id: `${chain.toLowerCase()}-${token0.toLowerCase()}`,
            symbol: symbol0,
            name: name0,
            type: AssetType.CRYPTOCURRENCY,
            decimals: decimals0,
            contractAddress: token0,
            chain,
          },
          amount: formatUnits(amount0, decimals0),
        },
        {
          assetId: `${chain.toLowerCase()}-${token1.toLowerCase()}`,
          asset: {
            id: `${chain.toLowerCase()}-${token1.toLowerCase()}`,
            symbol: symbol1,
            name: name1,
            type: AssetType.CRYPTOCURRENCY,
            decimals: decimals1,
            contractAddress: token1,
            chain,
          },
          amount: formatUnits(amount1, decimals1),
        },
      ],
      metadata: {
        tokenId: tokenId.toString(),
        tickLower,
        tickUpper,
        currentTick,
        feeTier: fee,
        inRange,
        liquidity: liquidity.toString(),
        uncollectedFees: {
          token0: formatUnits(tokensOwed0, decimals0),
          token1: formatUnits(tokensOwed1, decimals1),
        },
      },
    };

    return position;
  }
}
