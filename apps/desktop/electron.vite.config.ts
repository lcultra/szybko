import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

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
        resolve: {
            alias: {
                '@szybko/launcher': path.resolve(__dirname, '../../packages/launcher/src'),
                '@szybko/shared': path.resolve(__dirname, '../../packages/shared/src'),
                '@szybko/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
            },
        },
    },
})
