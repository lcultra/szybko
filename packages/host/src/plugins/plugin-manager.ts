import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PluginLoader } from './plugin-loader.js';
import type { PluginRegistry } from './plugin-registry.js';

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
        for (const dir of readdirSync(this.pluginsBaseDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
            const distPath = join(this.pluginsBaseDir, dir.name, 'dist');
            const loaded = this.loader.loadOne(distPath);
            if (loaded) {
                this.plugins.set(dir.name, loaded);
                if (!this.registry.has(dir.name)) {
                    this.registry.register(dir.name, {
                        source: 'built-in',
                        enabled: true,
                        installedAt: new Date().toISOString(),
                        path: distPath,
                    });
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
        return this.registry.listEnabled()
            .map(id => this.plugins.get(id))
            .filter((p): p is PluginInfo => !!p);
    }
}
