import { build, createServer } from 'vite';
import { createPreloadViteConfig } from '../configs/preload';
import { createRendererViteConfig } from '../configs/renderer';
import { loadConfig } from '../utils/config';
import { writePluginManifest } from '../utils/devmanifest';
import { dimmed, info, success } from '../utils/log';
import { findFreePort } from '../utils/port';

export interface DevOptions {
    cwd: string;
}

/**
 * 开发模式
 */
export async function devPlugin(options: DevOptions): Promise<void> {
    const { cwd } = options;
    const { config } = await loadConfig(cwd);

    if (config.renderer) {
        // ── React 插件：启动 Vite dev server + preload watch ──
        const port = await findFreePort(5173);
        info(`启动 renderer dev server (端口: ${port})...`);

        // 先写一次 plugin.json（含 dev URL）
        writePluginManifest(cwd, `http://localhost:${port}/`);

        const rendererConfig = createRendererViteConfig(cwd, config);
        const server = await createServer({
            ...rendererConfig,
            server: {
                port,
                strictPort: false,
            },
        });

        await server.listen();
        success(`renderer dev server 已启动: http://localhost:${server.resolvedUrls?.local?.[0] ?? port}/`);
        dimmed('按 Ctrl+C 停止');

        // 同时 watch preload 构建
        info('启动 preload watch 构建...');
        const preloadConfig = createPreloadViteConfig(cwd, config);
        await build({
            ...preloadConfig,
            build: {
                ...preloadConfig.build,
                watch: {},
            },
        });
    }
    else {
        // ── 简单插件：仅 watch preload 构建 ──
        info('启动 preload watch 构建...');
        writePluginManifest(cwd);

        const preloadConfig = createPreloadViteConfig(cwd, config);
        await build({
            ...preloadConfig,
            build: {
                ...preloadConfig.build,
                watch: {},
            },
        });
    }
}
