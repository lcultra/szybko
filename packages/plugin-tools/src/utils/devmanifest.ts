import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

interface PluginManifest {
    name: string;
    main: string;
    preload: string;
    pluginSetting?: { single?: boolean; height?: number };
    development?: { main?: string };
    features?: Array<{ code: string; explain?: string; cmds?: string[]; icon?: string }>;
}

function readManifest(cwd: string): PluginManifest {
    return JSON.parse(readFileSync(resolve(cwd, 'plugin.json'), 'utf-8'));
}

export function writePluginManifest(cwd: string, devUrl?: string): void {
    const manifest = readManifest(cwd);

    if (devUrl) {
        manifest.development = { main: devUrl };
    }
    else {
        delete manifest.development;
    }

    const distPath = resolve(cwd, 'dist', 'plugin.json');
    mkdirSync(dirname(distPath), { recursive: true });
    writeFileSync(distPath, `${JSON.stringify(manifest, null, 4)}\n`);
}
