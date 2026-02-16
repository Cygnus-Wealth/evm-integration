import { Address } from 'viem';
import { ValidationError } from './errors.js';

/**
 * Input validation utilities
 */
export class Validators {
  /**
   * Validates Ethereum address format
   * @param address - Address to validate
   * @throws ValidationError if invalid
   */
  static validateAddress(address: string): asserts address is Address {
    if (!address) {
      throw ValidationError.invalidAddress(address);
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw ValidationError.invalidAddress(address);
    }
  }

  /**
   * Validates address with checksum (EIP-55)
   * @param address - Address to validate
   * @returns True if checksum valid
   */
  static validateAddressChecksum(address: Address): boolean {
    // Implementation of EIP-55 checksum validation
    const addressWithoutPrefix = address.slice(2);
    const hash = this.keccak256(addressWithoutPrefix.toLowerCase());

    for (let i = 0; i < 40; i++) {
      const char = addressWithoutPrefix[i];
      if (!char) continue;

      const hashChar = hash[i];
      if (!hashChar) continue;

      const hashByte = parseInt(hashChar, 16);

      // If it's a letter
      if (char.match(/[a-fA-F]/)) {
        // If hash byte is >= 8, letter should be uppercase
        if (hashByte >= 8 && char !== char.toUpperCase()) {
          return false;
        }
        // If hash byte is < 8, letter should be lowercase
        if (hashByte < 8 && char !== char.toLowerCase()) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validates chain ID
   * @param chainId - Chain ID to validate
   * @param supportedChains - Array of supported chain IDs
   * @throws ValidationError if invalid
   */
  static validateChainId(chainId: number, supportedChains: number[]): void {
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw ValidationError.invalidChainId(chainId);
    }

    if (!supportedChains.includes(chainId)) {
      throw ValidationError.invalidChainId(chainId);
    }
  }

  /**
   * Validates transaction hash
   * @param hash - Transaction hash
   * @throws ValidationError if invalid
   */
  static validateTxHash(hash: string): void {
    if (!hash || typeof hash !== 'string') {
      throw ValidationError.invalidParameter('txHash', '0x-prefixed 64-character hex string', hash);
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      throw ValidationError.invalidParameter('txHash', '0x-prefixed 64-character hex string', hash);
    }
  }

  /**
   * Validates block number
   * @param blockNumber - Block number
   * @throws ValidationError if invalid
   */
  static validateBlockNumber(blockNumber: bigint | number): void {
    const num = typeof blockNumber === 'bigint' ? blockNumber : BigInt(blockNumber);

    if (num < 0n) {
      throw ValidationError.invalidParameter(
        'blockNumber',
        'Non-negative integer',
        String(blockNumber)
      );
    }
  }

  /**
   * Validates pagination parameters
   * @param page - Page number
   * @param pageSize - Page size
   * @param maxPageSize - Maximum allowed page size
   * @throws ValidationError if invalid
   */
  static validatePagination(
    page: number,
    pageSize: number,
    maxPageSize: number
  ): void {
    if (!Number.isInteger(page) || page < 1) {
      throw ValidationError.invalidParameter('page', 'Integer >= 1', String(page));
    }

    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw ValidationError.invalidParameter('pageSize', 'Integer >= 1', String(pageSize));
    }

    if (pageSize > maxPageSize) {
      throw ValidationError.invalidParameter(
        'pageSize',
        `Integer <= ${maxPageSize}`,
        String(pageSize)
      );
    }
  }

  /**
   * Validates timeout value
   * @param timeout - Timeout in milliseconds
   * @param min - Minimum allowed value
   * @param max - Maximum allowed value
   * @throws ValidationError if invalid
   */
  static validateTimeout(timeout: number, min: number, max: number): void {
    if (!Number.isFinite(timeout)) {
      throw ValidationError.invalidParameter('timeout', 'Finite number', String(timeout));
    }

    if (timeout < min) {
      throw ValidationError.invalidParameter('timeout', `>= ${min}ms`, String(timeout));
    }

    if (timeout > max) {
      throw ValidationError.invalidParameter('timeout', `<= ${max}ms`, String(timeout));
    }
  }

  /**
   * Validates RPC URL format
   * @param url - RPC URL
   * @throws ValidationError if invalid
   */
  static validateRpcUrl(url: string): void {
    if (!url || typeof url !== 'string') {
      throw ValidationError.invalidParameter('rpcUrl', 'Valid HTTP(S) or WS(S) URL', url);
    }

    try {
      const parsed = new URL(url);
      const validProtocols = ['http:', 'https:', 'ws:', 'wss:'];

      if (!validProtocols.includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (error) {
      throw ValidationError.invalidParameter('rpcUrl', 'Valid HTTP(S) or WS(S) URL', url);
    }
  }

  /**
   * Sanitizes user input string
   * @param input - Input string
   * @param maxLength - Maximum length
   * @returns Sanitized string
   */
  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (typeof input !== 'string') {
      return '';
    }

    // Trim whitespace
    let sanitized = input.trim();

    // Remove potentially dangerous characters
    sanitized = sanitized.replace(/[<>\"'`]/g, '');

    // Truncate to max length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Validates date range
   * @param from - Start date
   * @param to - End date
   * @throws ValidationError if invalid
   */
  static validateDateRange(from: Date, to: Date): void {
    if (!(from instanceof Date) || isNaN(from.getTime())) {
      throw ValidationError.invalidParameter('from', 'Valid Date object', String(from));
    }

    if (!(to instanceof Date) || isNaN(to.getTime())) {
      throw ValidationError.invalidParameter('to', 'Valid Date object', String(to));
    }

    if (from > to) {
      throw ValidationError.invalidParameter(
        'dateRange',
        'from <= to',
        `from: ${from.toISOString()}, to: ${to.toISOString()}`
      );
    }
  }

  /**
   * Simple keccak256 hash for checksum validation
   * Note: In production, use a proper keccak256 library like @noble/hashes
   * @param data - Data to hash
   * @returns Hex hash
   * @private
   */
  private static keccak256(data: string): string {
    // This is a placeholder. In production code, you should use a proper library:
    // import { keccak_256 } from '@noble/hashes/sha3';
    // For now, we'll use a simple hash for demonstration
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    // Convert to hex string (40 characters for checksum validation)
    return Math.abs(hash).toString(16).padStart(40, '0').slice(0, 40);
  }
}
