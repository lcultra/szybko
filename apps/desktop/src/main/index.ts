import path, { join } from 'node:path';
import process from 'node:process';
import { registerIpcHandlers, ShortcutManager, WindowManager } from '@szybko/host';
import { app } from 'electron';

const windowManager = new WindowManager();
const shortcutManager = new ShortcutManager();

app.whenReady().then(() => {
    const preloadPath = join(__dirname, '../preload/launcher.mjs');
    const win = windowManager.createMainWindow(preloadPath);

    if (process.env.ELECTRON_RENDERER_URL) {
        win.loadURL(process.env.ELECTRON_RENDERER_URL);
    }
    else {
        win.loadFile(path.join(__dirname, 'renderer/index.html'));
    }

    registerIpcHandlers(windowManager);
    shortcutManager.registerToggle(windowManager);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    windowManager.show();
});

app.on('will-quit', () => {
    shortcutManager.unregisterAll();
});
