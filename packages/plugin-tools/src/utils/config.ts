import type { PluginConfig } from '../index.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { error } from './log.ts';

export async function loadConfig(cwd: string): Promise<PluginConfig> {
    const configPath = resolve(cwd, 'plugin.config.js');

    if (!existsSync(configPath)) {
        error('未找到 plugin.config.js');
        error('请在插件根目录创建 plugin.config.js');
        process.exit(1);
    }

    try {
        const mod = await import(configPath);
        return mod.default || mod;
    }
    catch (err) {
        error(`加载 plugin.config.js 失败: ${err}`);
        process.exit(1);
    }
}
