import path, { join } from 'node:path';
import process from 'node:process';
import { PluginCatalog, PluginRegistry, registerIpcHandlers, RuntimeCoordinator, RuntimeManager, ShortcutManager, Store, WindowManager } from '@szybko/host';
import { app } from 'electron';

const windowManager = new WindowManager();
const hostRegistry = windowManager.initHostRegistry();
const shortcutManager = new ShortcutManager();

void app.whenReady().then(async () => {
    // Persistence
    const store = new Store(join(app.getPath('userData'), 'szybko.json'), { plugins: {} });
    const registry = new PluginRegistry(store);

    // 插件目录：dev 时从 repo 根加载；prod 时用 resources path（随后实现）
    const pluginsDir = app.isPackaged
        ? join(process.resourcesPath, 'plugins', 'built-in')
        : join(__dirname, '..', '..', '..', '..', 'plugins', 'built-in');
    const pluginManager = new PluginCatalog(registry, pluginsDir);
    await pluginManager.init();

    const preloadPath = join(__dirname, '../preload/host.js');
    const pluginPreloadPath = join(__dirname, '../preload/plugin.js');
    const runtimeManager = new RuntimeManager(pluginManager, windowManager, pluginPreloadPath);
    await runtimeManager.startAll();

    const coordinator = new RuntimeCoordinator(runtimeManager, hostRegistry, pluginManager);

    // Cmd/Ctrl+D 分离快捷键 — 插件视图有焦点时通过 webContents 事件触发
    runtimeManager.detachRequested = (runtimeId) => {
        coordinator.moveToHost(runtimeId, 'floating');
    };

    // Window
    const win = windowManager.createMainWindow(preloadPath);

    if (process.env.ELECTRON_RENDERER_URL) {
        void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    }
    else {
        void win.loadFile(path.join(__dirname, 'renderer/index.html'));
    }

    // Cmd/Ctrl+D — 主窗口有焦点时分离
    win.webContents.on('before-input-event', (_event, input) => {
        if ((input.control || input.meta) && input.key.toLowerCase() === 'd') {
            // 通过 coordinator 找到 launcher host 上的 runtime 并分离
            const launcher = hostRegistry.getOrCreateLauncherHost();
            for (const rt of runtimeManager.getAll()) {
                if (rt.host?.id === launcher.id) {
                    coordinator.moveToHost(rt.info.id, 'floating');
                    break;
                }
            }
        }
    });

    registerIpcHandlers(windowManager, coordinator);
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
