import type { InlineConfig } from 'vite';
import type { PluginConfig } from '../index.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { mergeConfig } from 'vite';
import { resolveRenderer } from '../index.ts';
import { error } from '../utils/log.ts';

export function createRendererViteConfig(cwd: string, config: PluginConfig): InlineConfig {
    const rendererRoot = resolveRenderer(config);
    if (!rendererRoot) {
        error('插件未配置 renderer');
        process.exit(1);
    }

    const rootDir = resolve(cwd, rendererRoot);
    const htmlEntry = resolve(rootDir, 'index.html');

    if (!existsSync(htmlEntry)) {
        error(`renderer 入口文件不存在: ${htmlEntry}`);
        process.exit(1);
    }

    const baseConfig: InlineConfig = {
        configFile: false,
        root: rootDir,
        plugins: [react(), tailwindcss()],
        build: {
            outDir: resolve(cwd, 'dist'),
            emptyOutDir: false,
            minify: false,
        },
    };

    return config.vite?.renderer
        ? mergeConfig(baseConfig, config.vite.renderer) as InlineConfig
        : baseConfig;
}
