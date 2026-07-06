import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: [],
    },
    resolve: {
        alias: {
            '@szybko/shared': path.resolve(__dirname, '../shared/src'),
        },
    },
});
