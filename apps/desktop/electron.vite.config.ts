import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                external: ['electron'],
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                external: ['electron'],
            },
        },
    },
    renderer: {
        root: '../../packages/launcher',
        defineConfig: {
            plugins: [react(), tailwindcss()],
            build: {
                outDir: '../../apps/desktop/out/renderer',
                emptyOutDir: true,
            },
            resolve: {
                alias: {
                    '@szybko/shared': path.resolve(__dirname, '../../packages/shared/src'),
                    '@szybko/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
                },
            },
        },
    },
});
