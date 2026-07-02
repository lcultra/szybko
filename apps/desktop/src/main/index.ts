import path, { join } from 'node:path';
import process from 'node:process';
import { PluginManager, PluginRegistry, registerIpcHandlers, RuntimeManager, ShortcutManager, Store, WindowManager } from '@szybko/host';
import { app } from 'electron';

const windowManager = new WindowManager();
const shortcutManager = new ShortcutManager();

void app.whenReady().then(async () => {
    // Persistence
    const store = new Store(join(app.getPath('userData'), 'szybko.json'), { plugins: {} });
    const registry = new PluginRegistry(store);

    // Plugin system
    const pluginManager = new PluginManager(registry);
    await pluginManager.init();

    const preloadPath = join(__dirname, '../preload/host.js');
    const pluginPreloadPath = join(__dirname, '../preload/sandbox.js');
    const runtimeManager = new RuntimeManager(pluginManager, windowManager, pluginPreloadPath);
    await runtimeManager.startAll();

    // Window
    const win = windowManager.createMainWindow(preloadPath);

    if (process.env.ELECTRON_RENDERER_URL) {
        void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    }
    else {
        void win.loadFile(path.join(__dirname, 'renderer/index.html'));
    }

    registerIpcHandlers(windowManager, runtimeManager);
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
