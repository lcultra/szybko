import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    root: '.',
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
    },
    resolve: {
        alias: {
            '@szybko/shared': path.resolve(__dirname, '../shared/src'),
            '@szybko/design-system': path.resolve(__dirname, '../design-system/src'),
        },
    },
})
