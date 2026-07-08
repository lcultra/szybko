import path, { join } from 'node:path';
import process from 'node:process';
import { CommandCatalog, createPlatformDatabase, initAssetProtocol, LauncherItemService, MatchSessionManager, PluginCatalog, registerIpcHandlers, registerPluginAssetHandler, RuntimeCoordinator, RuntimeManager, SearchApplicationService, ShortcutRegistry, WindowManager } from '@szybko/host';
import { app, protocol } from 'electron';

const windowManager = new WindowManager();
const shortcutRegistry = new ShortcutRegistry();

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

void app.whenReady().then(async () => {
    const preloadPath = join(__dirname, '../preload/host.js');
    const pluginPreloadPath = join(__dirname, '../preload/plugin.js');

    const hostRegistry = windowManager.initHostRegistry(preloadPath);

    // Command catalog — SQLite-backed feature indexing and dynamic feature store
    const platformDb = createPlatformDatabase(join(app.getPath('userData'), 'szybko-platform.db'));
    const commandCatalog = CommandCatalog.createForDatabase(platformDb);

    // 插件目录：dev 时从 repo 根加载；prod 时用 resources path（随后实现）
    const pluginsDir = app.isPackaged
        ? join(process.resourcesPath, 'plugins', 'built-in')
        : join(__dirname, '..', '..', '..', '..', 'plugins', 'built-in');

    const pluginManager = new PluginCatalog(platformDb, pluginsDir);
    await pluginManager.init();

    initAssetProtocol();
    registerPluginAssetHandler(pluginManager);

    commandCatalog.setPluginCatalog(pluginManager);

    // Index manifest features for all enabled plugins into the command catalog
    for (const plugin of pluginManager.getEnabled()) {
        commandCatalog.indexPlugin(plugin.id, plugin.manifest, plugin.path);
    }

    const runtimeManager = new RuntimeManager(pluginManager, windowManager, pluginPreloadPath);
    const coordinator = new RuntimeCoordinator(runtimeManager, hostRegistry, pluginManager, shortcutRegistry);

    // Inject pluginView shortcut handler BEFORE startAll
    runtimeManager.setPluginViewShortcutHandler((runtimeId, webContents) => {
        return shortcutRegistry.registerPluginView(webContents, {
            'plugin:detach': () => coordinator.moveToHost(runtimeId, 'floating'),
        });
    });

    runtimeManager.startAll();

    // Window
    const win = windowManager.createMainWindow(preloadPath);

    if (process.env.ELECTRON_RENDERER_URL) {
        void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    }
    else {
        void win.loadFile(path.join(__dirname, 'renderer/index.html'));
    }

    const launcherItemService = new LauncherItemService(platformDb);
    const searchService = new SearchApplicationService({
        platformDb,
        pluginCatalog: pluginManager,
        coordinator,
        windowManager,
        sessionManager: new MatchSessionManager(),
        launcherItemService,
        emitter: () => {},
    });

    registerIpcHandlers(windowManager, coordinator, commandCatalog, platformDb, pluginManager, shortcutRegistry, searchService, launcherItemService);

    shortcutRegistry.define([
        {
            actionId: 'window:toggle',
            scope: 'system',
            description: '切换主窗口显示',
            bindings: [
                { id: 'mac', key: ' ', modifiers: { meta: true }, platforms: ['darwin'], accelerator: 'Command+Space' },
                { id: 'win', key: ' ', modifiers: { alt: true }, platforms: ['win32', 'linux'], accelerator: 'Alt+Space' },
            ],
        },
        {
            actionId: 'plugin:detach',
            scope: 'main-window',
            description: '分离当前插件（搜索框焦点时）',
            bindings: [
                { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
                { id: 'win', key: 'd', modifiers: { ctrl: true }, platforms: ['win32', 'linux'] },
            ],
        },
        {
            actionId: 'plugin:detach',
            scope: 'plugin-view',
            description: '分离当前插件（插件焦点时）',
            bindings: [
                { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
                { id: 'win', key: 'd', modifiers: { ctrl: true }, platforms: ['win32', 'linux'] },
            ],
        },
        // ── Renderer document shortcuts ──
        {
            actionId: 'shell:navigate-up',
            scope: 'renderer-document',
            description: '上移选择',
            bindings: [{ id: 'default', key: 'ArrowUp', modifiers: {} }],
        },
        {
            actionId: 'shell:navigate-down',
            scope: 'renderer-document',
            description: '下移选择',
            bindings: [{ id: 'default', key: 'ArrowDown', modifiers: {} }],
        },
        {
            actionId: 'shell:navigate-left',
            scope: 'renderer-document',
            description: '左移选择',
            bindings: [
                { id: 'default', key: 'ArrowLeft', modifiers: {} },
                { id: 'tab-back', key: 'Tab', modifiers: { shift: true } },
            ],
        },
        {
            actionId: 'shell:navigate-right',
            scope: 'renderer-document',
            description: '右移选择',
            bindings: [
                { id: 'default', key: 'ArrowRight', modifiers: {} },
                { id: 'tab', key: 'Tab', modifiers: {} },
            ],
        },
        {
            actionId: 'shell:execute',
            scope: 'renderer-document',
            description: '执行选中项',
            bindings: [{ id: 'default', key: 'Enter', modifiers: {} }],
        },
        {
            actionId: 'shell:escape',
            scope: 'renderer-document',
            description: '逐级关闭',
            bindings: [{ id: 'default', key: 'Escape', modifiers: {} }],
        },
    ]);

    shortcutRegistry.onAction('window:toggle', () => {
        if (windowManager.isVisible())
            windowManager.hide();
        else windowManager.show();
    });

    shortcutRegistry.onAction('plugin:detach', () => {
        // MainWindow scope — 扫描 launcher-host
        for (const rt of runtimeManager.getAll()) {
            const host = runtimeManager.getHostFor(rt.info.id);
            if (host?.id === 'launcher-host') {
                coordinator.moveToHost(rt.info.id, 'floating');
                return;
            }
        }
    });

    shortcutRegistry.registerSystemGlobal();

    shortcutRegistry.registerMainWindow(win.webContents);
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
    shortcutRegistry.dispose();
});
