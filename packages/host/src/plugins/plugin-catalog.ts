import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PluginInstallationRepository } from '../persistence/sqlite/repositories/plugin-installation-repository';
import { PluginLoader } from './plugin-loader';

export interface PluginInfo {
    id: string;
    manifest: import('@szybko/shared').PluginManifest;
    path: string;
}

export class PluginCatalog {
    private loader = new PluginLoader();
    private plugins: Map<string, PluginInfo> = new Map();

    constructor(
        private platformDb: PlatformDatabase,
        private pluginsBaseDir: string,
    ) {}

    async init(): Promise<void> {
        this.scan();
    }

    scan() {
        this.plugins.clear();
        if (!existsSync(this.pluginsBaseDir)) {
            console.warn(`[PluginCatalog] plugins dir not found: ${this.pluginsBaseDir}`);
            return;
        }

        const repos = new PluginInstallationRepository(this.platformDb.drizzle());

        for (const dir of readdirSync(this.pluginsBaseDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
            const distPath = join(this.pluginsBaseDir, dir.name, 'dist');
            const loaded = this.loader.loadOne(distPath);
            if (loaded) {
                loaded.id = dir.name;
                this.plugins.set(dir.name, loaded);
                if (!repos.has(dir.name)) {
                    repos.register(dir.name, 'built-in', distPath, Date.now());
                }
                else if (!repos.isEnabled(dir.name)) {
                    repos.setEnabled(dir.name, true);
                }
            }
        }

        // Sync: disable entries for plugins no longer on disk
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
