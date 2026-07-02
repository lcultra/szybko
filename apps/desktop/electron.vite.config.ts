import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
    main: {
        build: {
            externalizeDeps: {
                exclude: ['@szybko/host', '@szybko/shared'],
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                input: {
                    launcher: 'src/preload/launcher.ts',
                    plugin: 'src/preload/plugin.ts',
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
