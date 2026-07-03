import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
import { PluginInstallationRepository } from '../persistence/sqlite/repositories/plugin-installation-repository';
import { PluginDiscovery } from './plugin-discovery';

export interface PluginInfo {
    id: string;
    manifest: import('@szybko/shared').PluginManifest;
    path: string;
}

export class PluginCatalog {
    private plugins = new Map<string, PluginInfo>();
    private discovery = new PluginDiscovery();

    constructor(
        private platformDb: PlatformDatabase,
        private pluginsBaseDir: string,
    ) {}

    /** 初始化：扫描磁盘 → 同步 DB 安装状态 → 缓存 */
    async init(): Promise<void> {
        this.plugins.clear();
        const repos = new PluginInstallationRepository(this.platformDb.drizzle());
        const discovered = this.discovery.scan(this.pluginsBaseDir);

        for (const plugin of discovered) {
            if (!repos.has(plugin.id)) {
                repos.register(plugin.id, 'built-in', plugin.path, Date.now());
            }
            else if (!repos.isEnabled(plugin.id)) {
                repos.setEnabled(plugin.id, true);
            }
            this.plugins.set(plugin.id, plugin);
        }

        // Disable entries for plugins no longer on disk
        for (const id of repos.listEnabled()) {
            if (!this.plugins.has(id)) {
                repos.setEnabled(id, false);
            }
        }
    }

    get(id: string): PluginInfo | undefined {
        return this.plugins.get(id);
    }

    getAll(): PluginInfo[] {
        return Array.from(this.plugins.values());
    }

    getEnabled(): PluginInfo[] {
        const repos = new PluginInstallationRepository(this.platformDb.drizzle());
        return repos.listEnabled()
            .map(id => this.plugins.get(id))
            .filter((p): p is PluginInfo => !!p);
    }
}
