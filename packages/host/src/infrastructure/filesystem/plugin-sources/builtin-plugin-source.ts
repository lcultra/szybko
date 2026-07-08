import type { PluginInfo } from '../plugin-catalog';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PluginLoader } from '../plugin-package-loader';

/**
 * PluginDiscovery — 系统扫描，用目录名的 sha256 派生稳定插件 ID。
 * manifest 不自声明 id，id 完全由系统决定。
 */
export class PluginDiscovery {
    private loader = new PluginLoader();

    scan(pluginsBaseDir: string): PluginInfo[] {
        if (!existsSync(pluginsBaseDir)) {
            console.warn(`[PluginDiscovery] plugins dir not found: ${pluginsBaseDir}`);
            return [];
        }

        const results: PluginInfo[] = [];

        for (const dir of readdirSync(pluginsBaseDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
            const distPath = join(pluginsBaseDir, dir.name, 'dist');
            const loaded = this.loader.loadOne(distPath);
            if (loaded) {
                const id = createHash('sha256').update(dir.name).digest('hex').slice(0, 16);
                results.push({
                    id,
                    manifest: loaded.manifest,
                    path: loaded.path,
                });
            }
        }

        return results;
    }
}
