import { defineConfig } from '@szybko/plugin-tools';

export default defineConfig({
    preload: 'src/preload/index.ts',
    renderer: 'src/renderer',
});
