import type { HostPlatformConfig } from './host-platform-config';
import type { HostPlatform } from './host-platform';
import { join } from 'node:path';
import { WindowManager } from '../window/window-manager';
import { ShortcutRegistry } from '../window/shortcut-registry';
import { createPlatformDatabase } from '../persistence/sqlite/platform-database';
import { CommandCatalog } from '../commands/command-catalog';
import { PluginCatalog } from '../plugins/plugin-catalog';
import { RuntimeManager } from '../runtime/runtime-manager';
import { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import { MatchSessionManager } from '../input/match-session-manager';
import { SearchApplicationService } from '../app/search/search-application-service';
import { LauncherItemService } from '../app/search/launcher-item-service';
import { PluginLifecycleService } from '../app/plugins/plugin-lifecycle-service';
import { PluginQueryService } from '../app/plugins/plugin-query-service';
import { StartupService } from '../app/startup/startup-service';
import { RuntimeApplicationService } from '../app/runtime/runtime-application-service';
import { registerIpcHandlers } from '../ipc/register-handlers';

export async function createHostPlatform(config: HostPlatformConfig): Promise<HostPlatform> {
  const windowManager = new WindowManager();
  const shortcutRegistry = new ShortcutRegistry();
  const hostRegistry = windowManager.initHostRegistry(config.preloadPath);

  const platformDb = createPlatformDatabase(join(config.userDataPath, 'szybko-platform.db'));
  const commandCatalog = CommandCatalog.createForDatabase(platformDb);
  const pluginCatalog = new PluginCatalog(platformDb, config.builtInPluginsPath);

  const runtimeManager = new RuntimeManager(pluginCatalog, windowManager, config.pluginPreloadPath);
  const coordinator = new RuntimeCoordinator(runtimeManager, hostRegistry, pluginCatalog, shortcutRegistry);

  const sessionManager = new MatchSessionManager();
  const launcherItemService = new LauncherItemService(platformDb);
  const pluginQuery = new PluginQueryService(pluginCatalog);
  const pluginLifecycle = new PluginLifecycleService(
    platformDb, pluginCatalog, commandCatalog, coordinator, runtimeManager, launcherItemService, pluginQuery,
  );

  const searchService = new SearchApplicationService({
    platformDb,
    pluginCatalog,
    coordinator,
    windowManager,
    sessionManager,
    launcherItemService,
    emitter: () => {},
  });

  const startupService = new StartupService({
    commandCatalog,
    pluginCatalog,
    runtimeManager,
    coordinator,
    shortcutRegistry,
    windowManager,
    config,
  });

  const runtimeService = new RuntimeApplicationService(coordinator);

  return {
    async start() {
      await startupService.start();

      // Wire IPC handlers after window and all services exist
      registerIpcHandlers(
        windowManager, coordinator, commandCatalog,
        platformDb, pluginCatalog, shortcutRegistry,
        searchService, launcherItemService, pluginLifecycle,
        undefined, // dynamicFeatureService — not wired in bootstrap yet
        runtimeService,
      );
    },
    show() {
      windowManager.show();
    },
    dispose() {
      shortcutRegistry.dispose();
    },
  };
}
