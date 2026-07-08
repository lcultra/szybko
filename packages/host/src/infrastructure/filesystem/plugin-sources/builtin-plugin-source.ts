import type { PluginInfo } from '../../../plugins/plugin-catalog';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PluginLoader } from '../plugin-package-loader';

/**
 * PluginDiscovery — 纯磁盘扫描，无 DB 依赖。
 * 扫描目录下所有子目录，加载 plugin.json 并返回 PluginInfo[]。
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
                results.push({
                    id: loaded.id,
                    manifest: loaded.manifest,
                    path: loaded.path,
                });
            }
        }

        return results;
    }
}
