import type { HostPlatformConfig } from '../../bootstrap/host-platform-config';
import type { CommandCatalog } from '../../commands/command-catalog';
import type { PluginCatalog } from '../../plugins/plugin-catalog';
import type { RuntimeManager } from '../../runtime/runtime-manager';
import type { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { ShortcutRegistry } from '../../presentation/window/shortcut-registry';
import type { WindowManager } from '../../presentation/window/window-manager';
import { initAssetProtocol } from '../../infrastructure/protocol/asset-protocol';
import { registerPluginAssetHandler } from '../../plugins/plugin-asset-handler';

export interface StartupDeps {
  commandCatalog: CommandCatalog;
  pluginCatalog: PluginCatalog;
  runtimeManager: RuntimeManager;
  coordinator: RuntimeCoordinator;
  shortcutRegistry: ShortcutRegistry;
  windowManager: WindowManager;
  config: HostPlatformConfig;
}

export class StartupService {
  constructor(private deps: StartupDeps) {}

  async start(): Promise<void> {
    // 1. Initialize protocol handlers
    initAssetProtocol();
    registerPluginAssetHandler(this.deps.pluginCatalog);

    // 2. Discover built-in plugin source
    await this.deps.pluginCatalog.init();

    // Wire plugin catalog into command catalog (needed for icon validation in dynamic features)
    this.deps.commandCatalog.setPluginCatalog(this.deps.pluginCatalog);

    // 3. Index manifest features for all enabled plugins
    for (const plugin of this.deps.pluginCatalog.getEnabled()) {
      this.deps.commandCatalog.indexPlugin(plugin.id, plugin.manifest, plugin.path);
    }

    // 4. Initialize runtime policy — set pluginViewShortcutHandler BEFORE startAll
    this.deps.runtimeManager.setPluginViewShortcutHandler((runtimeId, webContents) => {
      return this.deps.shortcutRegistry.registerPluginView(webContents, {
        'plugin:detach': () => this.deps.coordinator.moveToHost(runtimeId, 'floating'),
      });
    });

    // 5. Start all plugin runtimes
    this.deps.runtimeManager.startAll();

    // 6. Register shortcuts
    this.registerShortcuts();

    // 7. Create and load the main window
    const win = this.deps.windowManager.createMainWindow(this.deps.config.preloadPath);

    if (this.deps.config.rendererUrl) {
      void win.loadURL(this.deps.config.rendererUrl);
    } else {
      const { join } = await import('node:path');
      void win.loadFile(join(__dirname, 'renderer/index.html'));
    }

    // 8. Register main window shortcuts
    this.deps.shortcutRegistry.registerSystemGlobal();
    this.deps.shortcutRegistry.registerMainWindow(win.webContents);
  }

  private registerShortcuts(): void {
    this.deps.shortcutRegistry.define([
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

    this.deps.shortcutRegistry.onAction('window:toggle', () => {
      if (this.deps.windowManager.isVisible()) {
        this.deps.windowManager.hide();
      } else {
        this.deps.windowManager.show();
      }
    });

    // plugin:detach handler for main-window scope
    this.deps.shortcutRegistry.onAction('plugin:detach', () => {
      for (const rt of this.deps.runtimeManager.getAll()) {
        const host = this.deps.runtimeManager.getHostFor(rt.info.id);
        if (host?.id === 'launcher-host') {
          this.deps.coordinator.moveToHost(rt.info.id, 'floating');
          return;
        }
      }
    });
  }
}
