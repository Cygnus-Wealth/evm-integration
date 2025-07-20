# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a read-only EVM integration library for CygnusWealth portfolio aggregation. It provides React hooks for interacting with Ethereum and other EVM-compatible blockchains using wagmi, viem, and ethers.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to dist/
- **Test**: `npm run test` - Runs Vitest tests
- **Test UI**: `npm run test:ui` - Opens Vitest UI for interactive testing
- **Test Single File**: `vitest run path/to/test.test.ts` - Run specific test file

## Architecture

### Core Structure
- `src/hooks/` - React hooks for EVM interactions (useEvmBalance, useEvmConnect, useEvmTransactions)
- `src/types/` - TypeScript type definitions (EvmAsset interface)
- `src/utils/` - Utilities including RPC client configuration
- `src/index.ts` - Main entry point, exports all hooks

### Key Technologies
- **wagmi**: Primary Web3 React hooks library
- **viem**: Low-level Ethereum interactions and type-safe client
- **ethers**: Ethereum library for additional utilities
- **Vitest**: Testing framework with React Testing Library
- **TypeScript**: Strict mode enabled with ES2020 target

### Testing Setup
- Environment: jsdom for DOM simulation
- Setup file: `setupTests.ts` for global test configuration
- React Testing Library included for component testing
- Tests use `.test.tsx` extension for React hook tests

### Hook Patterns
All hooks follow wagmi patterns and accept:
- `address`: Ethereum address (Address type from viem)
- `chainId`: Network identifier (defaults to mainnet = 1)

### Build Output
- Compiled to `dist/` directory
- Includes TypeScript declarations (.d.ts files)
- Main entry: `dist/index.js`