import type { PluginManifest } from '@szybko/shared';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

export interface LoadedPlugin {
    manifest: PluginManifest;
    path: string;
}

const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.svg'];

function validateIconField(filePath: string, fieldName: string, pluginDir: string): string | null {
    const ext = extname(filePath).toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
        return `'${fieldName}' 必须是 .png / .jpg / .jpeg / .svg 格式，实际: ${ext}`;
    }
    // 路径逃逸检查
    const resolved = resolve(pluginDir, filePath);
    const rel = relative(pluginDir, resolved);
    if (rel.startsWith('..') || rel === '') {
        return `'${fieldName}' 路径 ${filePath} 逃逸了插件目录`;
    }
    // 文件存在检查
    if (!existsSync(resolved)) {
        return `'${fieldName}' 文件不存在: ${resolved}`;
    }
    return null;
}

export class PluginLoader {
    loadOne(pluginPath: string): LoadedPlugin | null {
        const manifestPath = join(pluginPath, 'plugin.json');
        if (!existsSync(manifestPath))
            return null;

        try {
            const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
            if (!manifest.name) {
                console.error(`[plugin-loader] Missing 'name' in ${manifestPath}`);
                return null;
            }
            if (!manifest.logo) {
                console.error(`[plugin-loader] Missing 'logo' in ${manifestPath}`);
                return null;
            }
            const logoErr = validateIconField(manifest.logo, 'logo', pluginPath);
            if (logoErr) {
                console.error(`[plugin-loader] ${manifestPath}: ${logoErr}`);
                return null;
            }
            for (const feature of manifest.features) {
                if (feature.icon) {
                    const iconErr = validateIconField(feature.icon, `features[${feature.code}].icon`, pluginPath);
                    if (iconErr) {
                        console.error(`[plugin-loader] ${manifestPath}: ${iconErr}`);
                        return null;
                    }
                }
            }
            return { manifest, path: pluginPath };
        }
        catch (err) {
            console.error(`[plugin-loader] Failed to load ${pluginPath}:`, err);
            return null;
        }
    }
}
