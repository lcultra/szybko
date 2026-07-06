import { copyFileSync, existsSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { loadConfig } from '../utils/config';
import { createPreloadViteConfig } from '../configs/preload';
import { createRendererViteConfig } from '../configs/renderer';
import { writePluginManifest } from '../utils/devmanifest';
import { info, success, error as logError } from '../utils/log';

export interface BuildOptions {
    cwd: string;
    devPort?: number;
}

/**
 * 构建插件
 */
export async function buildPlugin(options: BuildOptions): Promise<void> {
    const { cwd, devPort } = options;
    const { config } = await loadConfig(cwd);

    info('开始构建插件...');

    // Step 1: 构建 preload
    info('构建 preload...');
    try {
        const preloadConfig = createPreloadViteConfig(cwd, config);
        await build(preloadConfig);
        success('preload 构建完成');
    }
    catch (err) {
        logError(`preload 构建失败: ${err}`);
        process.exit(1);
    }

    // Step 2: 如果配置了 renderer，构建 renderer
    if (config.renderer) {
        info('构建 renderer...');
        try {
            const rendererConfig = createRendererViteConfig(cwd, config);
            await build(rendererConfig);
            success('renderer 构建完成');
        }
        catch (err) {
            logError(`renderer 构建失败: ${err}`);
            process.exit(1);
        }
    }
    else {
        // 简单插件：拷贝 index.html（如果有）
        const htmlPath = resolve(cwd, 'index.html');
        if (existsSync(htmlPath)) {
            copyFileSync(htmlPath, resolve(cwd, 'dist', 'index.html'));
            info('已拷贝 index.html → dist/');
        }
    }

    // Step 3: 拷贝 public/ → dist/（如果有）
    const publicDir = resolve(cwd, 'public');
    if (existsSync(publicDir)) {
        cpSync(publicDir, resolve(cwd, 'dist'), { recursive: true });
        info('已拷贝 public/ → dist/');
    }

    // Step 4: 写入 plugin.json 到 dist
    const devUrl = devPort ? `http://localhost:${devPort}/` : undefined;
    writePluginManifest(cwd, devUrl);
    success('插件构建完成');
}
