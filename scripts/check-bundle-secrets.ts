#!/usr/bin/env tsx
/**
 * Build-time assertion: scans the production bundle for leaked API keys,
 * env var values, and managed provider URLs.
 *
 * Run: npx tsx scripts/check-bundle-secrets.ts
 */
import { readFileSync } from 'fs';
import { assertNoBundledSecrets } from '../src/rpc/build-assertions.js';

const BUNDLE_PATH = './dist/index.js';

try {
  const content = readFileSync(BUNDLE_PATH, 'utf-8');
  assertNoBundledSecrets(content);
  console.log('Build assertion PASSED: no bundled secrets detected in', BUNDLE_PATH);
} catch (err) {
  console.error('Build assertion FAILED:', (err as Error).message);
  process.exit(1);
}
