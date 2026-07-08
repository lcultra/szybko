import path from 'node:path';
import process from 'node:process';
import { createHostPlatform } from '@szybko/host';
import { app, protocol } from 'electron';

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'asset',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);

let platform: Awaited<ReturnType<typeof createHostPlatform>> | null = null;

void app.whenReady().then(async () => {
    const preloadPath = path.join(__dirname, '../preload/host.js');
    const pluginPreloadPath = path.join(__dirname, '../preload/plugin.js');
    const pluginsDir = app.isPackaged
        ? path.join(process.resourcesPath!, 'plugins', 'built-in')
        : path.join(__dirname, '..', '..', '..', '..', 'plugins', 'built-in');

    platform = await createHostPlatform({
        userDataPath: app.getPath('userData'),
        builtInPluginsPath: pluginsDir,
        preloadPath,
        pluginPreloadPath,
        isPackaged: app.isPackaged,
        rendererUrl: process.env.ELECTRON_RENDERER_URL,
    });

    await platform.start();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    platform?.show();
});

app.on('will-quit', () => {
    platform?.dispose();
});
