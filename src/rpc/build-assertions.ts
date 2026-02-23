/**
 * Build-time assertions for production bundle safety.
 *
 * Scans bundle content for leaked API keys, env var values, and
 * managed provider URLs that should never appear in a client-side bundle.
 *
 * Usage:
 *   import { assertNoBundledSecrets } from './build-assertions.js';
 *   assertNoBundledSecrets(bundleContent);
 *
 * @module rpc/build-assertions
 */

/** Patterns that should never appear in a production bundle */
const BUNDLE_SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /CYGNUS_RPC_[A-Z_]+/g, label: 'CYGNUS_RPC_ env var reference' },
  { pattern: /alchemy\.com\/v2\/[a-zA-Z0-9_-]{10,}/g, label: 'Alchemy API key in URL' },
  { pattern: /alchemyapi\.io\/v2\/[a-zA-Z0-9_-]{10,}/g, label: 'Alchemy API key in URL' },
  { pattern: /infura\.io\/v3\/[a-f0-9]{20,}/g, label: 'Infura project ID in URL' },
  { pattern: /\/v[23]\/[a-zA-Z0-9_-]{32,}/g, label: 'Possible API key in /v2/ or /v3/ path' },
];

/**
 * Assert that the given content (e.g., a production JS bundle) does not
 * contain any API key patterns or env var values.
 *
 * @param content - The string content to scan (typically a bundled JS file)
 * @throws Error if any secret patterns are found
 */
export function assertNoBundledSecrets(content: string): void {
  const violations: string[] = [];

  for (const { pattern, label } of BUNDLE_SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        violations.push(`${label}: "${match}"`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Production bundle contains secret patterns — build REJECTED:\n` +
      violations.map(v => `  - ${v}`).join('\n')
    );
  }
}
