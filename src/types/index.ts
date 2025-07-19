export interface EvmAsset {
    token: string;
    balance: bigint;
    value?: number; // Optional USD equivalent
}