import { copyFileSync, cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { build as viteBuild } from 'vite';
import { createPreloadViteConfig } from '../configs/preload.ts';
import { createRendererViteConfig } from '../configs/renderer.ts';
import { loadConfig } from '../utils/config.ts';
import { writePluginManifest } from '../utils/devmanifest.ts';
import { info, error as logError, success } from '../utils/log.ts';

export interface BuildOptions {
    cwd: string;
    devPort?: number;
}

export async function buildPlugin(options: BuildOptions): Promise<void> {
    const { cwd, devPort } = options;
    const config = await loadConfig(cwd);

    info('开始构建插件...');

    info('构建 preload...');
    try {
        await viteBuild(createPreloadViteConfig(cwd, config));
        success('preload 构建完成');
    }
    catch (err) {
        logError(`preload 构建失败: ${err}`);
        process.exit(1);
    }

    if (config.renderer) {
        info('构建 renderer...');
        try {
            await viteBuild(createRendererViteConfig(cwd, config));
            success('renderer 构建完成');
        }
        catch (err) {
            logError(`renderer 构建失败: ${err}`);
            process.exit(1);
        }
    }
    else {
        const htmlPath = resolve(cwd, 'index.html');
        if (existsSync(htmlPath)) {
            copyFileSync(htmlPath, resolve(cwd, 'dist', 'index.html'));
            info('已拷贝 index.html → dist/');
        }
    }

    const publicDir = resolve(cwd, 'public');
    if (existsSync(publicDir)) {
        cpSync(publicDir, resolve(cwd, 'dist'), { recursive: true });
        info('已拷贝 public/ → dist/');
    }

    const devUrl = devPort ? `http://localhost:${devPort}/` : undefined;
    writePluginManifest(cwd, devUrl);
    success('插件构建完成');
}
