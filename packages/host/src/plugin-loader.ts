import type { PluginManifest } from '@szybko/shared';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const PLUGINS_DIR = join(process.cwd(), 'plugins');

export class PluginLoader {
    scan(): { id: string; manifest: PluginManifest; path: string }[] {
        if (!existsSync(PLUGINS_DIR))
            return [];

        return readdirSync(PLUGINS_DIR, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map((e) => {
                const pluginPath = join(PLUGINS_DIR, e.name);
                const manifestPath = join(pluginPath, 'plugin.json');
                if (!existsSync(manifestPath))
                    return null;
                try {
                    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
                    console.warn(`[plugin-loader] Registered: ${e.name}`);
                    return { id: e.name, manifest, path: pluginPath };
                }
                catch (err) {
                    console.error(`[plugin-loader] Failed to load ${e.name}:`, err);
                    return null;
                }
            })
            .filter(Boolean) as { id: string; manifest: PluginManifest; path: string }[];
    }
}
