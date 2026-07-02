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
        root: '.',
        plugins: [react(), tailwindcss()],
        build: {
            outDir: 'out/renderer',
            emptyOutDir: true,
            rollupOptions: {
                external: ['electron'],
            },
        },
    },
});
