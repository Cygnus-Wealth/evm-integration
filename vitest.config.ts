import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/IChainAdapter.contract.test.ts',
        ],
        server: {
            deps: {
                inline: ['@cygnus-wealth/data-models'],
            },
        },
    },
});