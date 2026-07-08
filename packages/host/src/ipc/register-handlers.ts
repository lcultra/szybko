import type { IpcInvokeContract, ShortcutScope } from '@szybko/shared';
import type { CommandCatalog } from '../commands/command-catalog';
import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { ShortcutRegistry } from '../window/shortcut-registry';
import type { WindowManager } from '../window/window-manager';
import type { SearchApplicationService } from '../app/search/search-application-service';
import type { LauncherItemService } from '../app/search/launcher-item-service';
import { IPC } from '@szybko/shared';
import { eq, sql } from 'drizzle-orm';
import { ipcMain } from 'electron';
import { MatchSessionManager } from '../input/match-session-manager';
import { ElectronNativeCapabilityService } from '../native/electron-native-capability-service';
import { PluginInstallationRepository } from '../persistence/sqlite/repositories/plugin-installation-repository';
import { commandTrigger, commandTriggerSearch, pinnedItem, pluginInstallation, usageEvent } from '../persistence/sqlite/schema';
import { createExecutor } from './execute-action';
import { registerSearchIpcHandlers } from './handlers/search-ipc-handlers';
import { registerItemIpcHandlers } from './handlers/item-ipc-handlers';

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
) {
    const sessionManager = new MatchSessionManager();
    const executor = createExecutor(new ElectronNativeCapabilityService());

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

    // ── Plugin execute ─────────────────────────────────────────────

    ipcMain.handle(
        IPC.PLUGIN_EXEC,
        async (_event, { action }: IpcRequest<typeof IPC.PLUGIN_EXEC>): Promise<IpcResponse<typeof IPC.PLUGIN_EXEC>> => {
            if (action.type === 'plugin.open') {
                if (action.payload.matchId) {
                    const resolved = sessionManager.resolve(action.payload.matchId);
                    if (resolved) {
                        coordinator.activatePlugin(
                            action.payload.pluginId,
                            action.payload.featureCode,
                            {
                                code: resolved.match.featureCode,
                                type: resolved.match.enterType,
                                payload: resolved.match.payload,
                                option: resolved.match.option ?? undefined,
                                from: resolved.match.from,
                                matchId: resolved.match.matchId,
                            },
                        );
                        return { ok: true };
                    }
                    console.warn(`[IPC] matchId ${action.payload.matchId} not resolved`);
                }
                coordinator.activatePlugin(action.payload.pluginId, action.payload.featureCode);
                return { ok: true };
            }
            return executor(action);
        },
    );

    // ── Host switch ────────────────────────────────────────────────

    ipcMain.handle(
        IPC.HOST_SWITCH,
        (_event, { runtimeId, targetHost }: IpcRequest<typeof IPC.HOST_SWITCH>): IpcResponse<typeof IPC.HOST_SWITCH> => {
            try {
                const runtime = coordinator.getRuntime(runtimeId);
                if (!runtime)
                    return { ok: false, error: 'Runtime not found' };
                coordinator.moveToHost(runtimeId, targetHost);
                const hostId = coordinator.getHostFor(runtimeId)?.id;
                return { ok: true, hostId };
            }
            catch (err) {
                return { ok: false, error: String(err) };
            }
        },
    );

    // ── Plugin hide / destroy ─────────────────────────────────────

    ipcMain.handle(
        IPC.PLUGIN_HIDE,
        (_event, { runtimeId }: IpcRequest<typeof IPC.PLUGIN_HIDE>): IpcResponse<typeof IPC.PLUGIN_HIDE> => {
            coordinator.hideRuntime(runtimeId);
            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.PLUGIN_DESTROY,
        (_event, { runtimeId }: IpcRequest<typeof IPC.PLUGIN_DESTROY>): IpcResponse<typeof IPC.PLUGIN_DESTROY> => {
            coordinator.destroyRuntime(runtimeId);
            return { ok: true };
        },
    );

    // ── Plugin native menu ──────────────────────────────────────

    ipcMain.handle(
        IPC.SHOW_PLUGIN_MENU,
        (_event, { runtimeId, variant }: IpcRequest<typeof IPC.SHOW_PLUGIN_MENU>): IpcResponse<typeof IPC.SHOW_PLUGIN_MENU> => {
            coordinator.showPluginMenu(runtimeId, variant);
            return { ok: true };
        },
    );

    // ── Plugin pin (runtime-level) ────────────────────────────────

    ipcMain.handle(
        IPC.PLUGIN_PIN,
        (_event, { runtimeId, pin }: IpcRequest<typeof IPC.PLUGIN_PIN>): IpcResponse<typeof IPC.PLUGIN_PIN> => {
            coordinator.pinRuntime(runtimeId, pin);
            return { ok: true };
        },
    );

    // ── Dynamic feature IPC ───────────────────────────────────

    ipcMain.handle(
        IPC.FEATURE_SET,
        (event, { feature }: IpcRequest<typeof IPC.FEATURE_SET>): IpcResponse<typeof IPC.FEATURE_SET> => {
            const pluginId = coordinator.pluginIdForWebContents(event.sender.id);
            if (!pluginId)
                return { ok: false, error: 'Plugin runtime not found for sender' };
            return commandCatalog.setFeature(pluginId, feature);
        },
    );

    ipcMain.handle(
        IPC.FEATURE_GET,
        (event, { codes }: IpcRequest<typeof IPC.FEATURE_GET>): IpcResponse<typeof IPC.FEATURE_GET> => {
            const pluginId = coordinator.pluginIdForWebContents(event.sender.id);
            if (!pluginId)
                return { ok: false, features: [], error: 'Plugin runtime not found for sender' };
            return { ok: true, features: commandCatalog.getDynamicFeatures(pluginId, codes) };
        },
    );

    ipcMain.handle(
        IPC.FEATURE_REMOVE,
        (event, { code }: IpcRequest<typeof IPC.FEATURE_REMOVE>): IpcResponse<typeof IPC.FEATURE_REMOVE> => {
            const pluginId = coordinator.pluginIdForWebContents(event.sender.id);
            if (!pluginId)
                return { ok: false, error: 'Plugin runtime not found for sender' };
            return commandCatalog.removeFeature(pluginId, code);
        },
    );

    // ── 插件安装管理 ────────────────────────────────────────────

    ipcMain.handle(
        IPC.PLUGIN_SET_ENABLED,
        async (_event, { pluginId, enabled }: IpcRequest<typeof IPC.PLUGIN_SET_ENABLED>): Promise<IpcResponse<typeof IPC.PLUGIN_SET_ENABLED>> => {
            if (!platformDb)
                return { ok: false, error: 'No database' };
            const repo = new PluginInstallationRepository(platformDb.drizzle());
            repo.setEnabled(pluginId, enabled);
            triggerRefresh();
            return { ok: true };
        },
    );

    function deleteItemRecordsByPlugin(pluginId: string): void {
        if (!platformDb)
            return;
        const db = platformDb.drizzle();
        const prefix = `plugin://${pluginId}/%`;

        // 清理通用 item 记录（无 FK，手动删）
        db.delete(pinnedItem).where(sql`item_id LIKE ${prefix}`).run();
        db.delete(usageEvent).where(sql`item_id LIKE ${prefix}`).run();

        // 清理 command 索引（无 FK，手动删）
        db.delete(commandTriggerSearch).where(eq(commandTriggerSearch.pluginId, pluginId)).run();
        db.delete(commandTrigger).where(eq(commandTrigger.pluginId, pluginId)).run();

        // 清理 plugin 自身（有 cascade FK 的表会自动清理）
        db.delete(pluginInstallation).where(eq(pluginInstallation.pluginId, pluginId)).run();
    }

    ipcMain.handle(
        IPC.PLUGIN_UNINSTALL,
        async (_event, { pluginId }: IpcRequest<typeof IPC.PLUGIN_UNINSTALL>): Promise<IpcResponse<typeof IPC.PLUGIN_UNINSTALL>> => {
            if (!platformDb)
                return { ok: false, error: 'No database' };
            try {
                deleteItemRecordsByPlugin(pluginId);
                triggerRefresh();
                return { ok: true };
            }
            catch (err) {
                return { ok: false, error: String(err) };
            }
        },
    );

    // ── 快捷键定义 ─────────────────────────────────────────────

    ipcMain.handle(
        IPC.SHORTCUT_GET_DEFS,
        async (_event, scope: ShortcutScope) => {
            return shortcutRegistry?.getActions(scope) ?? [];
        },
    );
}
