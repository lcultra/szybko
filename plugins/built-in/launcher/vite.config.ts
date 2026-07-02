import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        outDir: '../../../apps/desktop/out/plugins/built-in/launcher',
        lib: {
            entry: resolve(__dirname, 'src/preload.ts'),
            formats: ['cjs'],
            fileName: () => 'preload.js',
        },
        minify: false,
        emptyOutDir: true,
        copyPublicDir: false,
    },
});
