import { describe, it, expect } from 'vitest';
import { isSpamToken } from './EvmChainAdapter';

describe('isSpamToken', () => {
  it('should detect tokens with URLs in name', () => {
    expect(isSpamToken('REWARD', 'Reward Token - Claim at https://stUSD.live')).toBe(true);
    expect(isSpamToken('FREE', 'Get tokens at http://scam.com')).toBe(true);
  });

  it('should detect tokens with domain patterns in name', () => {
    expect(isSpamToken('FAKE', 'FakeToken.com')).toBe(true);
    expect(isSpamToken('SCAM', 'scam.io')).toBe(true);
    expect(isSpamToken('XYZ', 'token.xyz')).toBe(true);
    expect(isSpamToken('yRise', 'yRise.Finance')).toBe(true);
    expect(isSpamToken('STUSD', 'stUSD.live')).toBe(true);
  });

  it('should detect tokens with scam keywords', () => {
    expect(isSpamToken('REWARD', 'Reward Token')).toBe(true);
    expect(isSpamToken('AIRDROP', 'Free Airdrop')).toBe(true);
    expect(isSpamToken('CLAIM', 'Claim Your Tokens')).toBe(true);
    expect(isSpamToken('VISIT', 'Visit for free tokens')).toBe(true);
    expect(isSpamToken('REDEEM', 'Redeem now')).toBe(true);
  });

  it('should not flag legitimate tokens', () => {
    expect(isSpamToken('USDC', 'USD Coin')).toBe(false);
    expect(isSpamToken('USDT', 'Tether USD')).toBe(false);
    expect(isSpamToken('DAI', 'Dai Stablecoin')).toBe(false);
    expect(isSpamToken('WETH', 'Wrapped Ether')).toBe(false);
    expect(isSpamToken('ETH', 'Ethereum')).toBe(false);
    expect(isSpamToken('LINK', 'Chainlink')).toBe(false);
    expect(isSpamToken('UNI', 'Uniswap')).toBe(false);
    expect(isSpamToken('MATIC', 'Polygon')).toBe(false);
  });

  it('should detect specific spam tokens from the bug report', () => {
    expect(isSpamToken('ETHG', 'Ethereum Games (ETHG) 2000000')).toBe(false); // no spam pattern
    expect(isSpamToken('QAI', 'QuantumAI (QAI)')).toBe(false); // no spam pattern
    expect(isSpamToken('AICC', 'AI Chain Coin (AICC) 17500')).toBe(false); // no spam pattern
    // These DO match patterns:
    expect(isSpamToken('PAP', 'Apu Pepe (PAP)')).toBe(false); // legit name format
    expect(isSpamToken('REWARD', 'Reward Token - Claim at https://stUSD.live')).toBe(true);
    expect(isSpamToken('yRise', 'yRise.Finance')).toBe(true);
  });
});
