import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Address } from 'viem';
import { Chain, AssetType, LendingPositionType } from '@cygnus-wealth/data-models';
import { AaveAdapter, AAVE_V3_DEPLOYMENTS } from './AaveAdapter.js';

describe('AaveAdapter', () => {
  let adapter: AaveAdapter;
  const testAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

  // Mock Aave reserve data for a user
  const mockUserReserveData = {
    currentATokenBalance: BigInt('50000000000'),  // 50,000 USDC (6 decimals)
    currentStableDebtTokenBalance: BigInt('0'),
    currentVariableDebtTokenBalance: BigInt('10000000000'), // 10,000 USDC borrowed
    principalStableDebt: BigInt('0'),
    scaledVariableDebt: BigInt('9800000000'),
    stableBorrowRate: BigInt('0'),
    liquidityRate: BigInt('35000000000000000000000000'), // ~3.5% supply rate
    stableRateLastUpdated: 0,
    usageAsCollateralEnabled: true,
  };

  // Mock reserve token info
  const mockReserveTokenAddresses = {
    aTokenAddress: '0xBcca60bB61934080951369a648Fb03DF4F96263C' as Address,
    stableDebtTokenAddress: '0xE4922afAB0BbaDd8ab2a88E0C79d884Ad337fcA6' as Address,
    variableDebtTokenAddress: '0x619beb58998eD2278e08620f97007e1116D5D25b' as Address,
  };

  // Mock user account data (aggregate)
  const mockUserAccountData = {
    totalCollateralBase: BigInt('50000000000000'),   // $50,000 in base currency (8 decimals)
    totalDebtBase: BigInt('10000000000000'),          // $10,000 debt
    availableBorrowsBase: BigInt('25000000000000'),   // $25,000 available
    currentLiquidationThreshold: BigInt('8500'),      // 85%
    ltv: BigInt('8000'),                              // 80%
    healthFactor: BigInt('4250000000000000000'),       // 4.25
  };

  // Mock reserve list
  const mockReservesList: Address[] = [
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  ];

  // Mock reserve configuration
  const mockReserveConfigurationData = {
    decimals: BigInt('6'),
    ltv: BigInt('8000'),
    liquidationThreshold: BigInt('8500'),
    liquidationBonus: BigInt('10500'),
    reserveFactor: BigInt('1000'),
    usageAsCollateralEnabled: true,
    borrowingEnabled: true,
    stableBorrowRateEnabled: false,
    isActive: true,
    isFrozen: false,
  };

  let mockReadContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadContract = vi.fn();
    adapter = new AaveAdapter({ readContract: mockReadContract });
  });

  describe('protocolName', () => {
    it('should return "Aave V3"', () => {
      expect(adapter.protocolName).toBe('Aave V3');
    });
  });

  describe('supportedChains', () => {
    it('should support Aave V3 deployment chains', () => {
      expect(adapter.supportedChains).toContain(1);     // Ethereum
      expect(adapter.supportedChains).toContain(137);   // Polygon
      expect(adapter.supportedChains).toContain(42161); // Arbitrum
      expect(adapter.supportedChains).toContain(10);    // Optimism
      expect(adapter.supportedChains).toContain(8453);  // Base
    });
  });

  describe('supportsChain', () => {
    it('should return true for chains with Aave V3 deployments', () => {
      expect(adapter.supportsChain(1)).toBe(true);
      expect(adapter.supportsChain(137)).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(adapter.supportsChain(999999)).toBe(false);
    });
  });

  describe('getLendingPositions', () => {
    it('should return empty array for unsupported chain', async () => {
      const result = await adapter.getLendingPositions(testAddress, 999999);
      expect(result).toEqual([]);
    });

    it('should fetch supply and borrow positions', async () => {
      // Setup mock responses for getReservesList, then per-reserve data
      mockReadContract
        // getReservesList()
        .mockResolvedValueOnce(mockReservesList)
        // getUserAccountData() for health factor
        .mockResolvedValueOnce([
          mockUserAccountData.totalCollateralBase,
          mockUserAccountData.totalDebtBase,
          mockUserAccountData.availableBorrowsBase,
          mockUserAccountData.currentLiquidationThreshold,
          mockUserAccountData.ltv,
          mockUserAccountData.healthFactor,
        ])
        // getUserReserveData(USDC)
        .mockResolvedValueOnce([
          mockUserReserveData.currentATokenBalance,
          mockUserReserveData.currentStableDebtTokenBalance,
          mockUserReserveData.currentVariableDebtTokenBalance,
          mockUserReserveData.principalStableDebt,
          mockUserReserveData.scaledVariableDebt,
          mockUserReserveData.stableBorrowRate,
          mockUserReserveData.liquidityRate,
          mockUserReserveData.stableRateLastUpdated,
          mockUserReserveData.usageAsCollateralEnabled,
        ])
        // getReserveConfigurationData(USDC)
        .mockResolvedValueOnce([
          mockReserveConfigurationData.decimals,
          mockReserveConfigurationData.ltv,
          mockReserveConfigurationData.liquidationThreshold,
          mockReserveConfigurationData.liquidationBonus,
          mockReserveConfigurationData.reserveFactor,
          mockReserveConfigurationData.usageAsCollateralEnabled,
          mockReserveConfigurationData.borrowingEnabled,
          mockReserveConfigurationData.stableBorrowRateEnabled,
          mockReserveConfigurationData.isActive,
          mockReserveConfigurationData.isFrozen,
        ])
        // getReserveTokensAddresses(USDC)
        .mockResolvedValueOnce([
          mockReserveTokenAddresses.aTokenAddress,
          mockReserveTokenAddresses.stableDebtTokenAddress,
          mockReserveTokenAddresses.variableDebtTokenAddress,
        ])
        // ERC20 symbol(USDC)
        .mockResolvedValueOnce('USDC')
        // ERC20 name(USDC)
        .mockResolvedValueOnce('USD Coin')
        // getUserReserveData(WETH) — no position
        .mockResolvedValueOnce([
          BigInt('0'), BigInt('0'), BigInt('0'),
          BigInt('0'), BigInt('0'), BigInt('0'),
          BigInt('0'), 0, false,
        ])
        // getReserveConfigurationData(WETH)
        .mockResolvedValueOnce([
          BigInt('18'), BigInt('8000'), BigInt('8250'),
          BigInt('10500'), BigInt('1000'), true,
          true, false, true, false,
        ])
        // getReserveTokensAddresses(WETH)
        .mockResolvedValueOnce([
          '0xaaa' as Address, '0xbbb' as Address, '0xccc' as Address,
        ])
        // ERC20 symbol(WETH)
        .mockResolvedValueOnce('WETH')
        // ERC20 name(WETH)
        .mockResolvedValueOnce('Wrapped Ether');

      const positions = await adapter.getLendingPositions(testAddress, 1);

      // Should have supply + borrow for USDC, nothing for WETH
      expect(positions.length).toBeGreaterThanOrEqual(2);

      const supplyPosition = positions.find(p => p.type === LendingPositionType.SUPPLY);
      expect(supplyPosition).toBeDefined();
      expect(supplyPosition!.protocol).toBe('Aave V3');
      expect(supplyPosition!.chain).toBe(Chain.ETHEREUM);
      expect(supplyPosition!.asset.symbol).toBe('USDC');
      expect(parseFloat(supplyPosition!.amount)).toBeGreaterThan(0);

      const borrowPosition = positions.find(p => p.type === LendingPositionType.BORROW);
      expect(borrowPosition).toBeDefined();
      expect(borrowPosition!.protocol).toBe('Aave V3');
      expect(parseFloat(borrowPosition!.amount)).toBeGreaterThan(0);
    });

    it('should include health factor on borrow positions', async () => {
      mockReadContract
        .mockResolvedValueOnce(mockReservesList.slice(0, 1)) // only USDC
        .mockResolvedValueOnce([
          mockUserAccountData.totalCollateralBase,
          mockUserAccountData.totalDebtBase,
          mockUserAccountData.availableBorrowsBase,
          mockUserAccountData.currentLiquidationThreshold,
          mockUserAccountData.ltv,
          mockUserAccountData.healthFactor,
        ])
        .mockResolvedValueOnce([
          mockUserReserveData.currentATokenBalance,
          BigInt('0'),
          mockUserReserveData.currentVariableDebtTokenBalance,
          BigInt('0'),
          mockUserReserveData.scaledVariableDebt,
          BigInt('0'),
          mockUserReserveData.liquidityRate,
          0,
          true,
        ])
        .mockResolvedValueOnce([
          mockReserveConfigurationData.decimals,
          mockReserveConfigurationData.ltv,
          mockReserveConfigurationData.liquidationThreshold,
          mockReserveConfigurationData.liquidationBonus,
          mockReserveConfigurationData.reserveFactor,
          true, true, false, true, false,
        ])
        .mockResolvedValueOnce([
          mockReserveTokenAddresses.aTokenAddress,
          mockReserveTokenAddresses.stableDebtTokenAddress,
          mockReserveTokenAddresses.variableDebtTokenAddress,
        ])
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin');

      const positions = await adapter.getLendingPositions(testAddress, 1);

      const borrowPosition = positions.find(p => p.type === LendingPositionType.BORROW);
      expect(borrowPosition).toBeDefined();
      expect(borrowPosition!.healthFactor).toBeCloseTo(4.25, 1);
    });

    it('should skip reserves with zero balances', async () => {
      mockReadContract
        .mockResolvedValueOnce(mockReservesList.slice(0, 1))
        .mockResolvedValueOnce([
          BigInt('0'), BigInt('0'), BigInt('0'),
          BigInt('0'), BigInt('0'), BigInt('0'),
        ])
        // getUserReserveData — all zeros
        .mockResolvedValueOnce([
          BigInt('0'), BigInt('0'), BigInt('0'),
          BigInt('0'), BigInt('0'), BigInt('0'),
          BigInt('0'), 0, false,
        ])
        .mockResolvedValueOnce([
          BigInt('6'), BigInt('8000'), BigInt('8500'),
          BigInt('10500'), BigInt('1000'), true,
          true, false, true, false,
        ])
        .mockResolvedValueOnce([
          '0xaaa' as Address, '0xbbb' as Address, '0xccc' as Address,
        ])
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce('USD Coin');

      const positions = await adapter.getLendingPositions(testAddress, 1);
      expect(positions).toHaveLength(0);
    });

    it('should handle RPC errors gracefully', async () => {
      mockReadContract.mockRejectedValueOnce(new Error('RPC error'));

      const positions = await adapter.getLendingPositions(testAddress, 1);
      expect(positions).toEqual([]);
    });
  });

  describe('getStakedPositions', () => {
    it('should return empty array (Aave positions are modeled as lending)', async () => {
      const result = await adapter.getStakedPositions(testAddress, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getLiquidityPositions', () => {
    it('should return empty array (Aave is not an LP protocol)', async () => {
      const result = await adapter.getLiquidityPositions(testAddress, 1);
      expect(result).toEqual([]);
    });
  });

  describe('AAVE_V3_DEPLOYMENTS', () => {
    it('should export deployment addresses for each chain', () => {
      expect(AAVE_V3_DEPLOYMENTS).toBeDefined();
      expect(AAVE_V3_DEPLOYMENTS[1]).toBeDefined();    // Ethereum
      expect(AAVE_V3_DEPLOYMENTS[1].pool).toBeDefined();
      expect(AAVE_V3_DEPLOYMENTS[1].poolDataProvider).toBeDefined();
    });
  });
});
