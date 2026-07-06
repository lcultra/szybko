import type { IpcInvokeContract } from '@szybko/shared';
import type { CommandCatalog } from '../commands/command-catalog';
import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { WindowManager } from '../window/window-manager';
import { IPC } from '@szybko/shared';
import { BrowserWindow, ipcMain } from 'electron';
import { collectFromSearch } from '../input/input-context-collector';
import { MatchSessionManager } from '../input/match-session-manager';
import { ElectronNativeCapabilityService } from '../native/electron-native-capability-service';
import { PinnedItemRepository } from '../persistence/sqlite/repositories/pinned-item-repository';
import { UsageEventRepository } from '../persistence/sqlite/repositories/usage-event-repository';
import {
    PinnedSectionProvider,
    PluginProvider,
    RecentSectionProvider,
    SearchSession,
} from '../search';
import { createExecutor } from './execute-action';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

let currentSession: SearchSession | null = null;

export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,
    commandCatalog: CommandCatalog,
    platformDb?: PlatformDatabase,
) {
    const sessionManager = new MatchSessionManager();
    const executor = createExecutor(new ElectronNativeCapabilityService());

    // ── Providers ──────────────────────────────────────────────────

    const pluginProvider = platformDb
        ? new PluginProvider(platformDb.drizzle(), coordinator, sessionManager)
        : null;

    const pinnedProvider = platformDb
        ? new PinnedSectionProvider(platformDb.drizzle(), async (itemId) => {
                // resolve 通过 session 缓存或 pluginProvider
                return currentSession?.resolveItem(itemId) ?? null;
            })
        : null;

    const recentProvider = platformDb
        ? new RecentSectionProvider(platformDb.drizzle(), async (itemId) => {
                return currentSession?.resolveItem(itemId) ?? null;
            })
        : null;

    const pinnedRepo = platformDb ? new PinnedItemRepository(platformDb.drizzle()) : null;
    const usageRepo = platformDb ? new UsageEventRepository(platformDb.drizzle()) : null;

    // ── Search ─────────────────────────────────────────────────────

    ipcMain.handle(
        IPC.SEARCH_QUERY,
        async (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): Promise<IpcResponse<typeof IPC.SEARCH_QUERY>> => {
            if (!platformDb)
                return { ok: false };
            if (!pluginProvider || !pinnedProvider || !recentProvider)
                return { ok: false };

            // 取消上一个仍在进行的会话
            currentSession = null;

            const snapshot = collectFromSearch(req);
            const win = windowManager.getWindow();
            if (!win || win.isDestroyed())
                return { ok: false };

            // 所有 provider 都在 session 中注册（用于 execute），但只调用有结果的 provider search
            const providers = [pinnedProvider, recentProvider, pluginProvider].filter(Boolean) as import('../search').SearchProvider[];

            const session = new SearchSession(req.queryId, providers, (res) => {
                if (!win.isDestroyed()) {
                    win.webContents.send(IPC.SEARCH_RESPONSE, res);
                }
            });

            currentSession = session;

            // 异步执行搜索，不阻塞 IPC 返回
            session.search(snapshot).catch((err) => {
                console.error('[IPC] SearchSession error:', err);
            });

            return { ok: true, sessionId: session.sessionId };
        },
    );

    ipcMain.handle(
        IPC.SEARCH_CANCEL,
        (): IpcResponse<typeof IPC.SEARCH_CANCEL> => {
            currentSession = null;
            return { ok: true };
        },
    );

    // ── Item pin ───────────────────────────────────────────────────

    ipcMain.handle(
        IPC.ITEM_PIN,
        (_event, { itemId, pin }: IpcRequest<typeof IPC.ITEM_PIN>): IpcResponse<typeof IPC.ITEM_PIN> => {
            if (!pinnedRepo)
                return { ok: false };
            if (pin) {
                pinnedRepo.add(itemId, Date.now());
            }
            else {
                pinnedRepo.remove(itemId);
            }
            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.ITEM_REORDER,
        (_event, { itemId, toIndex }: IpcRequest<typeof IPC.ITEM_REORDER>): IpcResponse<typeof IPC.ITEM_REORDER> => {
            if (!pinnedRepo)
                return { ok: false };
            pinnedRepo.reorder(itemId, toIndex);
            return { ok: true };
        },
    );

    // ── Item context menu ──────────────────────────────────────────

    ipcMain.handle(
        IPC.ITEM_CONTEXT_MENU,
        (_event, req: IpcRequest<typeof IPC.ITEM_CONTEXT_MENU>): IpcResponse<typeof IPC.ITEM_CONTEXT_MENU> => {
            const { itemId, screenX, screenY } = req;
            const item = currentSession?.resolveItem(itemId);
            if (!item)
                return { ok: false };

            const menuBuilder: Electron.MenuItemConstructorOptions[] = [];

            if (item.capabilities.pin) {
                menuBuilder.push({
                    label: item.state.pinned ? '取消固定' : '固定到搜索栏',
                    click: () => {
                        pinnedRepo?.add(itemId, item.state.pinned ? 0 : Date.now());
                    },
                });
            }
            if (item.capabilities.reveal) {
                menuBuilder.push({
                    label: '在访达中显示',
                    click: () => {
                        if (itemId.startsWith('file://')) {
                            new ElectronNativeCapabilityService().openPath(itemId.replace('file://', ''));
                        }
                    },
                });
            }

            const win = BrowserWindow.getFocusedWindow();
            if (win && menuBuilder.length > 0) {
                const { Menu } = require('electron');
                const built = Menu.buildFromTemplate(menuBuilder);
                built.popup({ window: win, x: screenX, y: screenY });
            }

            return { ok: true };
        },
    );

    // ── Item execute ───────────────────────────────────────────────

    ipcMain.handle(
        IPC.ITEM_EXECUTE,
        async (
            _event,
            req: IpcRequest<typeof IPC.ITEM_EXECUTE>,
        ): Promise<IpcResponse<typeof IPC.ITEM_EXECUTE>> => {
            const { sessionId, queryId, itemId } = req;

            if (!currentSession || currentSession.sessionId !== sessionId) {
                return { ok: false, error: 'Session expired' };
            }

            // 记录使用
            usageRepo?.record(itemId);

            const result = await currentSession.executeItem(itemId, {
                queryId,
                sessionId,
            });
            return result;
        },
    );

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
}
