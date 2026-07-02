import type { PluginRegistry } from './plugin-registry.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PluginLoader } from './plugin-loader.js';

export interface PluginInfo {
    id: string;
    manifest: import('@szybko/shared').PluginManifest;
    path: string;
}

export class PluginManager {
    private loader = new PluginLoader();
    private plugins: Map<string, PluginInfo> = new Map();

    constructor(
        private registry: PluginRegistry,
        private pluginsBaseDir: string,
    ) {}

    async init(): Promise<void> {
        await this.registry.init();
        this.scan();
    }

    scan() {
        this.plugins.clear();
        if (!existsSync(this.pluginsBaseDir)) {
            console.warn(`[PluginManager] plugins dir not found: ${this.pluginsBaseDir}`);
            return;
        }
        const dirs = readdirSync(this.pluginsBaseDir, { withFileTypes: true }).filter(e => e.isDirectory());
        console.log(`[PluginManager] scanning ${this.pluginsBaseDir}, found ${dirs.length} dirs`);
        for (const dir of dirs) {
            const distPath = join(this.pluginsBaseDir, dir.name, 'dist');
            console.log(`[PluginManager]  checking ${dir.name}/dist/...`);
            const loaded = this.loader.loadOne(distPath);
            if (loaded) {
                loaded.id = dir.name; // loadOne 取的 ID 是路径最后段 'dist'，用目录名覆写
                console.log(`[PluginManager]  loaded plugin: ${dir.name}`);
                this.plugins.set(dir.name, loaded);
                const has = this.registry.has(dir.name);
                console.log(`[PluginManager]  registry.has('${dir.name}')=${has}`);
                if (!has) {
                    console.log(`[PluginManager]  registering ${dir.name}...`);
                    this.registry.register(dir.name, {
                        source: 'built-in',
                        enabled: true,
                        installedAt: new Date().toISOString(),
                        path: distPath,
                    });
                    console.log(`[PluginManager]  registered, listEnabled now: ${JSON.stringify(this.registry.listEnabled())}`);
                }
                else if (!this.registry.isEnabled(dir.name)) {
                    console.log(`[PluginManager]  re-enabling ${dir.name}...`);
                    this.registry.setEnabled(dir.name, true);
                }
            }
        }

        // Sync registry: disable entries for plugins no longer on disk
        for (const id of this.registry.listEnabled()) {
            if (!this.plugins.has(id)) {
                this.registry.setEnabled(id, false);
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
        const enabled = this.registry.listEnabled();
        const result = enabled
            .map(id => this.plugins.get(id))
            .filter((p): p is PluginInfo => {
                if (!p)
                    console.log(`[PluginManager] getEnabled: plugin ${p} not found in map`);
                return !!p;
            });
        console.log(`[PluginManager] getEnabled: listEnabled=${JSON.stringify(enabled)}, this.plugins.size=${this.plugins.size}, result=${result.length}`);
        return result;
    }
}
