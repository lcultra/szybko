import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { rebundle } from 'vite-plugin-rebundle';

export default defineConfig({
    main: {
        build: {
            externalizeDeps: {
                exclude: ['@szybko/host', '@szybko/shared'],
            },
        },
    },
    preload: {
        plugins: [
            rebundle({
                input: {
                    external: ['electron'],
                },
            }),
        ],
        build: {
            rollupOptions: {
                input: {
                    host: 'src/preload/host.ts',
                    plugin: 'src/preload/plugin.ts',
                },
                external: ['electron'],
                output: {
                    format: 'cjs',
                },
            },
        },
    },
    renderer: {
        plugins: [
            react(),
            tailwindcss(),
        ],
    },
});
