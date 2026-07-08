import type { PluginCatalog } from './plugin-catalog';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { registerAssetHandler } from '../infrastructure/protocol/asset-protocol';

const MIME_MAP: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

function isContainedIn(base: string, target: string): boolean {
    const relativePath = relative(base, target);
    return !relativePath.startsWith('..') && relativePath !== '';
}

export function registerPluginAssetHandler(catalog: PluginCatalog): void {
    registerAssetHandler('plugin', async (pathname: string) => {
        // pathname = "/<pluginId>/<encoded-relative-path>"
        const [pluginId, ...rest] = pathname.split('/').filter(Boolean);
        if (!pluginId || rest.length === 0) {
            return null;
        }

        const plugin = catalog.get(decodeURIComponent(pluginId));
        if (!plugin) {
            return null;
        }

        // 还原路径段（encodeURIComponent 的逆操作）
        const decodedFileName = rest.map(decodeURIComponent).join('/');
        const ext = extname(decodedFileName).toLowerCase();

        // 校验 .jpeg → .jpg 归一化
        const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
        if (!(normalizedExt in MIME_MAP)) {
            return null;
        }

        const assetPath = resolve(plugin.path, decodedFileName);
        if (!isContainedIn(plugin.path, assetPath)) {
            return new Response('Forbidden', { status: 403 });
        }

        try {
            const data = await readFile(assetPath);
            return new Response(data, {
                status: 200,
                headers: { 'Content-Type': MIME_MAP[normalizedExt] },
            });
        }
        catch {
            return null;
        }
    });
}
