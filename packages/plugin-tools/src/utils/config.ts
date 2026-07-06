import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PluginConfig } from '../index';
import { error } from './log';

export interface LoadedConfig {
    config: PluginConfig;
    configPath: string;
}

/**
 * 从指定目录加载 plugin.config.js
 */
export async function loadConfig(cwd: string): Promise<LoadedConfig> {
    // 尝试加载 plugin.config.js
    const configPath = resolve(cwd, 'plugin.config.js');

    if (!existsSync(configPath)) {
        error(`未找到 plugin.config.js`);
        error(`请在插件根目录创建 plugin.config.js`);
        process.exit(1);
    }

    try {
        const mod = await import(configPath);
        const config: PluginConfig = mod.default || mod;

        // 验证必填字段
        if (!config.preload) {
            error('plugin.config.js 缺少必填字段: preload');
            process.exit(1);
        }

        return { config, configPath };
    }
    catch (err) {
        error(`加载 plugin.config.js 失败: ${err}`);
        process.exit(1);
    }
}

/**
 * 判断插件是否有 renderer
 */
export function hasRenderer(config: PluginConfig): boolean {
    return Boolean(config.renderer);
}
