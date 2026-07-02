import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        lib: {
            entry: resolve(__dirname, 'src/preload/index.ts'),
            formats: ['cjs'],
            fileName: () => 'preload.js',
        },
        minify: false,
        emptyOutDir: true,
        copyPublicDir: false,
    },
});
