import type { InlineConfig } from 'vite';
import type { PluginConfig } from '../index';
import { resolve } from 'node:path';
import { mergeConfig } from 'vite';

/**
 * 创建 preload 构建的 vite 内联配置
 */
export function createPreloadViteConfig(cwd: string, config: PluginConfig): InlineConfig {
    const baseConfig: InlineConfig = {
        configFile: false,
        build: {
            outDir: resolve(cwd, 'dist'),
            lib: {
                entry: resolve(cwd, config.preload),
                formats: ['cjs'],
                fileName: () => 'preload.js',
            },
            minify: false,
            emptyOutDir: false,
            copyPublicDir: false,
        },
    };

    // 扩展用户自定义 vite 配置
    if (config.vite?.preload) {
        return mergeConfig(baseConfig, config.vite.preload) as InlineConfig;
    }

    return baseConfig;
}
