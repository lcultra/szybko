import type { PluginManifest } from '@szybko/shared';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

export interface LoadedPlugin {
    id: string;
    manifest: PluginManifest;
    path: string;
}

export class PluginLoader {
    loadOne(pluginPath: string): LoadedPlugin | null {
        const manifestPath = join(pluginPath, 'plugin.json');
        if (!existsSync(manifestPath))
            return null;

        try {
            const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
            const id = pluginPath.split('/').pop() || pluginPath.split('\\').pop() || 'unknown';
            return { id, manifest, path: pluginPath };
        }
        catch (err) {
            console.error(`[plugin-loader] Failed to load ${pluginPath}:`, err);
            return null;
        }
    }

    scan(dir: string = join(process.cwd(), 'plugins')): LoadedPlugin[] {
        if (!existsSync(dir))
            return [];

        return readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => this.loadOne(join(dir, e.name)))
            .filter((p): p is LoadedPlugin => !!p);
    }
}
