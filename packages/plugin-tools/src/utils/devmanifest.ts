import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface PluginManifest {
    id: string;
    main: string;
    preload: string;
    pluginSetting?: { single?: boolean; height?: number };
    development?: { main?: string };
    features?: Array<{
        code: string;
        explain?: string;
        cmds?: string[];
        icon?: string;
    }>;
}

/**
 * 读取插件根目录的 plugin.json
 */
export function readPluginManifest(cwd: string): PluginManifest {
    const manifestPath = resolve(cwd, 'plugin.json');
    const raw = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(raw);
}

/**
 * 将 plugin.json 写入 dist，如果指定了 devUrl 则注入 development.main
 */
export function writePluginManifest(cwd: string, devUrl?: string): void {
    const manifest = readPluginManifest(cwd);

    if (devUrl) {
        manifest.development = { main: devUrl };
    }
    else {
        // 生产构建：确保不包含 development.main
        delete manifest.development;
    }

    const outPath = resolve(cwd, 'dist', 'plugin.json');
    writeFileSync(outPath, `${JSON.stringify(manifest, null, 4)}\n`);
}
