import type { IpcInvokeContract, ShortcutScope } from '@szybko/shared';
import type { CommandCatalog } from '../commands/command-catalog';
import type { PlatformDatabase } from '../infrastructure/sqlite/platform-database';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { ShortcutRegistry } from '../presentation/window/shortcut-registry';
import type { WindowManager } from '../presentation/window/window-manager';
import type { SearchApplicationService } from '../app/search/search-application-service';
import type { LauncherItemService } from '../app/search/launcher-item-service';
import type { PluginLifecycleService } from '../app/plugins/plugin-lifecycle-service';
import type { RuntimeApplicationService } from '../app/runtime/ports';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import { registerSearchIpcHandlers } from './handlers/search-ipc-handlers';
import { registerItemIpcHandlers } from './handlers/item-ipc-handlers';
import { registerPluginManagementIpcHandlers } from './handlers/plugin-management-ipc-handlers';
import { registerDynamicFeatureIpcHandlers } from './handlers/dynamic-feature-ipc-handlers';
import { registerPluginRuntimeIpcHandlers } from './handlers/plugin-runtime-ipc-handlers';
import type { DynamicFeatureService } from '../app/commands/dynamic-feature-service';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,
    commandCatalog: CommandCatalog,
    platformDb?: PlatformDatabase,
    pluginCatalog?: PluginCatalog,
    shortcutRegistry?: ShortcutRegistry,
    searchService?: SearchApplicationService,
    launcherItemService?: LauncherItemService,
    pluginLifecycle?: PluginLifecycleService,
    dynamicFeatureService?: DynamicFeatureService,
    runtimeService?: RuntimeApplicationService,
) {
    // ── Delegated search/item handlers ────────────────────────────────

    if (searchService) {
        registerSearchIpcHandlers({ searchService });
    }

    if (launcherItemService && searchService) {
        registerItemIpcHandlers({
            launcherItemService,
            searchService,
            triggerRefresh: () => searchService.triggerRefresh(),
        });
    }

    const triggerRefresh = () => searchService?.triggerRefresh();

    // ── Delegated plugin management handlers ────────────────────────

    if (pluginLifecycle) {
        registerPluginManagementIpcHandlers({ pluginLifecycle, triggerRefresh });
    }

    // ── Delegated runtime handlers ──────────────────────────────────

    if (runtimeService) {
        registerPluginRuntimeIpcHandlers({ runtimeService });
    }

    // ── Window control ─────────────────────────────────────────────

    ipcMain.handle(
        IPC.WINDOW_RESIZE,
        (_event, { height }: IpcRequest<typeof IPC.WINDOW_RESIZE>): IpcResponse<typeof IPC.WINDOW_RESIZE> => {
            windowManager.resize(height);
            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.WINDOW_HIDE,
        (): IpcResponse<typeof IPC.WINDOW_HIDE> => {
            windowManager.hide();
            return { ok: true };
        },
    );

    // ── Dynamic feature IPC (delegated) ────────────────────────

    if (dynamicFeatureService) {
        registerDynamicFeatureIpcHandlers({
            dynamicFeature: dynamicFeatureService,
            resolvePluginId: (webContentsId: number) => coordinator.pluginIdForWebContents(webContentsId),
        });
    }

    // ── 快捷键定义 ─────────────────────────────────────────────

    ipcMain.handle(
        IPC.SHORTCUT_GET_DEFS,
        async (_event, scope: ShortcutScope) => {
            return shortcutRegistry?.getActions(scope) ?? [];
        },
    );
}
