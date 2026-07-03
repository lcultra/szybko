import type { PluginInfo } from '../plugins/plugin-catalog';
import { join } from 'node:path';
import { app, WebContentsView } from 'electron';

/**
 * RuntimeViewFactory — 创建 WebContentsView 并加载插件 URL。
 * 不关心 host 或状态发布。
 */
export class RuntimeViewFactory {
    private nextInstanceId = 1;

    constructor(private pluginPreloadPath: string) {}

    create(plugin: PluginInfo): { view: WebContentsView; runtimeId: string } {
        const view = new WebContentsView({
            webPreferences: {
                preload: this.pluginPreloadPath,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        const runtimeId = `${plugin.id}-${this.nextInstanceId++}`;

        const devUrl = !app.isPackaged && plugin.manifest.development?.main;
        if (devUrl) {
            view.webContents.loadURL(devUrl);
        }
        else {
            const indexPath = join(plugin.path, plugin.manifest.main);
            view.webContents.loadFile(indexPath);
        }

        return { view, runtimeId };
    }
}
