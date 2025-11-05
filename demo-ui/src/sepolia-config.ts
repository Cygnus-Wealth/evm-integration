import { ChainConfig } from '@cygnus-wealth/evm-integration';

export const sepoliaConfig: ChainConfig = {
  id: 11155111,
  name: 'Sepolia',
  symbol: 'SepoliaETH',
  decimals: 18,
  explorer: 'https://sepolia.etherscan.io',
  endpoints: {
    http: [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://rpc.sepolia.org',
      'https://rpc2.sepolia.org',
      'https://ethereum-sepolia.blockpi.network/v1/rpc/public',
    ],
    ws: [
      'wss://ethereum-sepolia-rpc.publicnode.com',
      'wss://ethereum-sepolia.blockpi.network/v1/ws/public',
    ],
  },
  rateLimit: {
    requestsPerSecond: 50,
    burstLimit: 100,
  },
};
