# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CygnusWealth Overview

CygnusWealth is a decentralized, client-side dApp for portfolio aggregation and tracking, emphasizing user sovereignty, privacy, and read-only integrations without handling private keys or transaction signing. Built as a browser-first application in a single React + TypeScript codebase, it aggregates data from CEXs, DEXs, and multi-chain wallets, with future cross-platform extensions. The design focuses on intuitive, hierarchical UI/UX to provide seamless overviews, drills, and visualizations while reinforcing decentralization through visual cues and local encryption.

### Key Features
- **CEX Integration**: Read-only access to Robinhood, Kraken, and Coinbase via user-provided API keys, fetched client-side with Axios and encrypted locally.
- **DEX and On-Chain Tracking**: Real-time data from subgraphs and RPCs for positions, NFTs, and histories across Ethereum/EVM, Solana, and SUI.
- **Multi-Wallet Support**: Read-only connections to MetaMask/Rabby (EVM), Phantom (Solana), and Slush (SUI) for balance and transaction aggregation; manual inputs for unsupported platforms stored encrypted on IPFS.
- **Usability Enhancements**: Hierarchical dashboard with charts (Recharts), real-time alerts, exports, and progressive disclosure; privacy-forward elements like lock icons and ZK proofs.
- **Decentralization & Security**: All operations in-browser, using Web Crypto API + tweetnacl for encryption via BIP39-derived keys; no servers, deployed on IPFS via Fleek.
- **Monetization Potential**: Freemium model with optional premium features like advanced analytics.

### Technology Stack
- **Frontend Framework**: React + TypeScript with Chakra UI and React Router.
- **State & Data**: Zustand for management; Axios for APIs; ethers.js, viem/wagmi, @solana/web3.js, @mysten/sui.js for Web3 reads.
- **Security & Tools**: Web Crypto API, tweetnacl, zk.js; Formik/Yup for forms; Vitest for testing.
- **Deployment**: IPFS (Fleek); future Capacitor/Tauri for mobile/desktop.
- **UI/UX Elements**: Minimalist layouts, neutral palette, WCAG-compliant accessibility, micro-interactions, and modular screens (onboarding, dashboard, drills).

### Goals & Constraints
Primary goals include secure, effortless multi-chain tracking with high decentralization and extensibility for features like simulations. Constraints encompass browser limitations, RPC reliabilities, audit costs (~$5k-10k), and no server infrastructure, mitigated by client-side focus and modular repositories.

## EVM Integration Library

This repository contains the read-only EVM integration library for CygnusWealth portfolio aggregation. It provides React hooks for interacting with Ethereum and other EVM-compatible blockchains using wagmi, viem, and ethers.

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

## DDD Architecture Agent Selection Guide

When working on CygnusWealth, use the appropriate specialized agent based on the architectural level:

### ddd-enterprise-architect
Use for strategic domain decomposition and high-level architecture:
- Defining bounded contexts between CEX, DEX, and wallet integrations
- Establishing communication patterns between portfolio aggregation domains
- Setting enterprise-wide standards for decentralized architecture
- Planning migration from monolithic to modular repository structure

### ddd-domain-architect
Use for domain-specific implementations within bounded contexts:
- Designing the EVM integration module structure
- Defining aggregates for portfolio data and wallet connections
- Establishing contracts between chain-specific repositories
- Translating decentralization requirements into domain models

### ddd-system-architect
Use for single repository/system architecture:
- Module decomposition within the EVM integration library
- Library selection for Web3 interactions (wagmi vs viem vs ethers)
- E2E test planning for wallet connection flows
- Ensuring client-side sovereignty in system design

### ddd-unit-architect
Use for granular code-level architecture:
- Designing React hook structures for EVM interactions
- Creating TypeScript interfaces for blockchain data models
- Defining unit test specifications for wallet utilities
- Structuring encryption modules with Web Crypto API

### ddd-software-engineer
Use for implementing architectural designs:
- Writing React hooks based on unit architecture specs
- Implementing Vitest unit tests for EVM components
- Creating value objects for Ethereum addresses and tokens
- Building repository patterns for blockchain data access