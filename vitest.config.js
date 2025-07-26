import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react'; // Add this import
export default defineConfig({
    plugins: [react()], // Add this for JSX handling
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './setupTests.ts',
    },
});
