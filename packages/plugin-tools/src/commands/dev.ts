import { createServer as createViteServer, build as viteBuild } from 'vite';
import { createPreloadViteConfig } from '../configs/preload.ts';
import { createRendererViteConfig } from '../configs/renderer.ts';
import { loadConfig } from '../utils/config.ts';
import { writePluginManifest } from '../utils/devmanifest.ts';
import { dimmed, info, success } from '../utils/log.ts';
import { findFreePort } from '../utils/port.ts';

export interface DevOptions {
    cwd: string;
}

export async function devPlugin(options: DevOptions): Promise<void> {
    const { cwd } = options;
    const config = await loadConfig(cwd);

    if (config.renderer) {
        const port = await findFreePort(10901);
        info(`启动 renderer dev server (端口: ${port})...`);
        writePluginManifest(cwd, `http://localhost:${port}/`);

        const rendererConfig = createRendererViteConfig(cwd, config);
        const server = await createViteServer({
            ...rendererConfig,
            server: { port, strictPort: false },
        });
        await server.listen();
        success(`renderer dev server 已启动: http://localhost:${port}/`);
        dimmed('按 Ctrl+C 停止');

        info('启动 preload watch 构建...');
        const preloadConfig = createPreloadViteConfig(cwd, config);

        await viteBuild({
            ...preloadConfig,
            build: { ...preloadConfig.build, watch: {} },
        });
    }
    else {
        info('启动 preload watch 构建...');
        writePluginManifest(cwd);

        const preloadConfig = createPreloadViteConfig(cwd, config);
        await viteBuild({
            ...preloadConfig,
            build: { ...preloadConfig.build, watch: {} },
        });
    }
}
