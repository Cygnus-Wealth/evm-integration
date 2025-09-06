# EVM Integration Test UI

A basic React application for manually testing and validating the EVM integration library functionality.

## Features

- **Manual Address Input**: Enter any Ethereum address to test
- **Balance Display**: Shows native ETH/token balance with USD value
- **Token Balances**: Lists USDC, USDT, and DAI balances (Ethereum mainnet only)
- **Transaction History**: Displays recent transactions
- **Multi-Chain Support**: Test on Ethereum, Polygon, Arbitrum, Optimism, and Base

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

The UI will open at http://localhost:3000

## Usage

1. Enter an Ethereum address (e.g., `0x...`) in the input field
2. Select the chain you want to query
3. Click "Load Data" to fetch balances and transactions
4. View the results in real-time

## Testing Different Features

- **Balance Hook**: Displays native token balance for any address
- **Token Balances**: Shows USDC, USDT, and DAI balances on Ethereum mainnet
- **Transaction History**: Lists the most recent transactions for the address
- **Chain Support**: Test different chains by switching the dropdown

## Example Addresses for Testing

You can use these public addresses to test the functionality:
- Vitalik Buterin: `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
- Ethereum Foundation: `0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe`

## Notes

- This is a development tool only - not for production use
- All operations are read-only
- No wallet connection required - just enter addresses directly
- Data is fetched from public RPC endpoints