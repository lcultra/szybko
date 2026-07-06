import type { InlineConfig } from 'vite';
import type { PluginConfig } from '../index';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { mergeConfig } from 'vite';
import { error } from '../utils/log';

/**
 * 创建 renderer 构建的 vite 内联配置
 */
export function createRendererViteConfig(cwd: string, config: PluginConfig): InlineConfig {
    if (!config.renderer) {
        error('插件未配置 renderer');
        process.exit(1);
    }

    const rendererRoot = resolve(cwd, config.renderer);
    const htmlEntry = resolve(rendererRoot, 'index.html');

    if (!existsSync(htmlEntry)) {
        error(`renderer 入口文件不存在: ${htmlEntry}`);
        process.exit(1);
    }

    const baseConfig: InlineConfig = {
        configFile: false,
        root: rendererRoot,
        plugins: [react(), tailwindcss()],
        build: {
            outDir: resolve(cwd, 'dist'),
            emptyOutDir: false,
            minify: false,
        },
    };

    // 扩展用户自定义 vite 配置
    if (config.vite?.renderer) {
        return mergeConfig(baseConfig, config.vite.renderer) as InlineConfig;
    }

    return baseConfig;
}
