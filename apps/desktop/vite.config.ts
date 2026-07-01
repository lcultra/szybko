import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    root: 'src/renderer',
    base: './',
    build: {
        outDir: '../../dist/renderer',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
    },
    resolve: {
        alias: {
            '@szybko/launcher': path.resolve(__dirname, '../../packages/launcher/src'),
            '@szybko/shared': path.resolve(__dirname, '../../packages/shared/src'),
        },
    },
})
