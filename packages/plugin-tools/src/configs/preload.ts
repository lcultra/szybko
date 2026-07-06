import type { InlineConfig } from 'vite';
import type { PluginConfig } from '../index.ts';
import { resolve } from 'node:path';
import { mergeConfig } from 'vite';
import { resolvePreload } from '../index.ts';

export function createPreloadViteConfig(cwd: string, config: PluginConfig): InlineConfig {
    const preloadEntry = resolvePreload(config);

    const baseConfig: InlineConfig = {
        configFile: false,
        build: {
            outDir: resolve(cwd, 'dist'),
            lib: {
                entry: resolve(cwd, preloadEntry),
                formats: ['cjs'],
                fileName: () => 'preload.js',
            },
            minify: false,
            emptyOutDir: false,
            copyPublicDir: false,
        },
    };

    return config.vite?.preload
        ? mergeConfig(baseConfig, config.vite.preload) as InlineConfig
        : baseConfig;
}
