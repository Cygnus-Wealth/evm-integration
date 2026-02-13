// No longer need Token import as we define TokenConfig locally

export interface EndpointConfig {
  http: string[];
  ws?: string[];
}

export interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

export interface ChainConfig {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
  endpoints: EndpointConfig;
  explorer: string;
  isTestnet?: boolean;
  tokens?: {
    popular?: TokenConfig[];  // Common tokens like USDC, USDT, DAI
    native?: TokenConfig;     // Wrapped native token (WETH, WMATIC, etc)
  };
  // Optional overrides
  gasSettings?: {
    maxPriorityFeePerGas?: bigint;
    maxFeePerGas?: bigint;
  };
  // Rate limiting hints
  rateLimit?: {
    requestsPerSecond?: number;
    burstLimit?: number;
  };
}