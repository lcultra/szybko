import type { PluginManifest } from '@szybko/shared';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
            if (!manifest.id) {
                console.error(`[plugin-loader] Missing 'id' in ${manifestPath}`);
                return null;
            }
            return { id: manifest.id, manifest, path: pluginPath };
        }
        catch (err) {
            console.error(`[plugin-loader] Failed to load ${pluginPath}:`, err);
            return null;
        }
    }
}
