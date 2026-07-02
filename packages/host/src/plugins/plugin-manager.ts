import type { PluginRegistry } from './plugin-registry.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { PluginLoader } from './plugin-loader.js';

export interface PluginInfo {
    id: string;
    manifest: import('@szybko/shared').PluginManifest;
    path: string;
}

export class PluginManager {
    private loader = new PluginLoader();
    private plugins: Map<string, PluginInfo> = new Map();

    constructor(private registry: PluginRegistry) {}

    async init(): Promise<void> {
        await this.registry.init();
        this.scan();
    }

    scan() {
        this.plugins.clear();
        const root = process.cwd();

        // Scan built-in plugins
        const builtInDir = join(root, 'plugins', 'built-in');
        if (existsSync(builtInDir)) {
            for (const dir of readdirSync(builtInDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
                const pluginPath = join(builtInDir, dir.name);
                const loaded = this.loader.loadOne(pluginPath);
                if (loaded) {
                    this.plugins.set(dir.name, loaded);
                    // Auto-register built-in plugins
                    if (!this.registry.has(dir.name)) {
                        this.registry.register(dir.name, {
                            source: 'built-in',
                            enabled: true,
                            installedAt: new Date().toISOString(),
                            path: pluginPath,
                        });
                    }
                }
            }
        }

        // Scan user-installed plugins
        const userDir = join(root, 'plugins', 'user');
        if (existsSync(userDir)) {
            for (const dir of readdirSync(userDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
                const pluginPath = join(userDir, dir.name);
                const loaded = this.loader.loadOne(pluginPath);
                if (loaded) {
                    this.plugins.set(dir.name, loaded);
                    if (!this.registry.has(dir.name)) {
                        this.registry.register(dir.name, {
                            source: 'user-installed',
                            enabled: true,
                            installedAt: new Date().toISOString(),
                            path: pluginPath,
                        });
                    }
                }
            }
        }

        // Sync registry: remove entries for plugins that no longer exist on disk
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
