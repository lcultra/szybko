import type { IpcInvokeContract, LauncherItem, LauncherItemId, SearchRequest, ShortcutScope } from '@szybko/shared';
import type { CommandCatalog } from '../commands/command-catalog';
import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { ShortcutRegistry } from '../window/shortcut-registry';
import type { WindowManager } from '../window/window-manager';
import { IPC } from '@szybko/shared';
import { BrowserWindow, ipcMain, Menu } from 'electron';
import { collectFromSearch } from '../input/input-context-collector';
import { MatchSessionManager } from '../input/match-session-manager';
import { ElectronNativeCapabilityService } from '../native/electron-native-capability-service';
import { PinnedItemRepository } from '../persistence/sqlite/repositories/pinned-item-repository';
import { PluginInstallationRepository } from '../persistence/sqlite/repositories/plugin-installation-repository';
import { UsageEventRepository } from '../persistence/sqlite/repositories/usage-event-repository';
import { commandTrigger, commandTriggerSearch, pinnedItem, pluginInstallation, usageEvent } from '../persistence/sqlite/schema';
import { eq, sql } from 'drizzle-orm';
import {
    PinnedSectionProvider,
    PluginProvider,
    RecentSectionProvider,
    SearchProvider,
    SearchSession,
} from '../search';
import { createExecutor } from './execute-action';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

let currentSession: SearchSession | null = null;
let lastSearchRequest: SearchRequest | null = null;

export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,
    commandCatalog: CommandCatalog,
    platformDb?: PlatformDatabase,
    pluginCatalog?: PluginCatalog,
    shortcutRegistry?: ShortcutRegistry,
) {
    const sessionManager = new MatchSessionManager();
    const executor = createExecutor(new ElectronNativeCapabilityService());

    // ── Providers ──────────────────────────────────────────────────

    const pluginProvider = platformDb && pluginCatalog
        ? new PluginProvider(platformDb.drizzle(), coordinator, pluginCatalog, sessionManager)
        : null;

    const resolveFromProviders = async (itemId: LauncherItemId): Promise<LauncherItem | null> => {
        // 1. Try current session cache
        const sessionItem = currentSession?.resolveItem(itemId);
        if (sessionItem)
            return sessionItem;

        // 2. Try owner provider's resolve
        if (itemId.startsWith('plugin://') && pluginProvider) {
            const resolved = await pluginProvider.resolve(itemId);
            if (!resolved)
                return null;

            // 已禁用的插件不返回，让调用方跳过展示
            const pluginId = itemId.replace('plugin://', '').split('/')[0];
            const repo = new PluginInstallationRepository(platformDb!.drizzle());
            if (!repo.isEnabled(pluginId))
                return null;

            return resolved;
        }

        // 3. Try independent providers as fallback (skip pinned/recent — their resolve()
        //    delegates back to this function, which would cause infinite recursion)
        for (const p of [pluginProvider].filter(Boolean) as SearchProvider[]) {
            if (itemId.startsWith('plugin://') && p.id === 'plugin')
                continue; // already tried in step 2
            const resolved = await p.resolve(itemId);
            if (resolved)
                return resolved;
        }

        return null;
    };

    const pinnedProvider = platformDb
        ? new PinnedSectionProvider(platformDb.drizzle(), resolveFromProviders)
        : null;

    const recentProvider = platformDb
        ? new RecentSectionProvider(platformDb.drizzle(), resolveFromProviders)
        : null;

    const pinnedRepo = platformDb ? new PinnedItemRepository(platformDb.drizzle()) : null;
    const usageRepo = platformDb ? new UsageEventRepository(platformDb.drizzle()) : null;

    function triggerRefresh(): void {
        if (!lastSearchRequest || !platformDb || !pluginProvider || !pinnedProvider || !recentProvider)
            return;

        const win = windowManager.getWindow();
        if (!win || win.isDestroyed())
            return;

        if (currentSession) {
            currentSession.cancel();
        }

        const snapshot = collectFromSearch(lastSearchRequest);
        const providers = [pinnedProvider, recentProvider, pluginProvider].filter(Boolean) as SearchProvider[];

        const session = new SearchSession(lastSearchRequest.queryId, providers, (res) => {
            if (!win.isDestroyed()) {
                win.webContents.send(IPC.SEARCH_RESPONSE, res);
            }
        });

        currentSession = session;
        session.search(snapshot).catch((err) => {
            console.error('[IPC] Refresh search error:', err);
        });
    }

    // ── Search ─────────────────────────────────────────────────────

    ipcMain.handle(
        IPC.SEARCH_QUERY,
        async (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): Promise<IpcResponse<typeof IPC.SEARCH_QUERY>> => {
            if (!platformDb)
                return { ok: false };
            if (!pluginProvider || !pinnedProvider || !recentProvider)
                return { ok: false };

            // 取消上一个仍在进行的会话
            if (currentSession) {
                currentSession.cancel();
            }
            currentSession = null;

            // 保存请求用于后续刷新
            lastSearchRequest = req;

            const snapshot = collectFromSearch(req);
            const win = windowManager.getWindow();
            if (!win || win.isDestroyed())
                return { ok: false };

            // 所有 provider 都在 session 中注册（用于 execute），但只调用有结果的 provider search
            const providers = [pinnedProvider, recentProvider, pluginProvider].filter(Boolean) as SearchProvider[];

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
            if (currentSession) {
                currentSession.cancel();
                currentSession = null;
            }
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
            // Re-run current search to refresh UI
            triggerRefresh();
            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.ITEM_REORDER,
        (_event, { itemId, toIndex }: IpcRequest<typeof IPC.ITEM_REORDER>): IpcResponse<typeof IPC.ITEM_REORDER> => {
            if (!pinnedRepo)
                return { ok: false };
            pinnedRepo.reorder(itemId, toIndex);
            // Re-run current search to refresh UI
            triggerRefresh();
            return { ok: true };
        },
    );

    // ── Item context menu ──────────────────────────────────────────

    ipcMain.handle(
        IPC.ITEM_CONTEXT_MENU,
        (_event, req: IpcRequest<typeof IPC.ITEM_CONTEXT_MENU>): IpcResponse<typeof IPC.ITEM_CONTEXT_MENU> => {
            const { itemId, screenX, screenY, source } = req;

            // Check with repo if item is pinned
            const isPinned = pinnedRepo?.list().some(r => r.itemId === itemId) ?? false;

            const win = BrowserWindow.getFocusedWindow();
            if (!win)
                return { ok: false };

            const menuBuilder: Electron.MenuItemConstructorOptions[] = [
                {
                    label: isPinned ? '取消固定"搜索框"' : '固定到"搜索框"',
                    click: () => {
                        if (isPinned) {
                            pinnedRepo?.remove(itemId);
                        }
                        else {
                            pinnedRepo?.add(itemId, Date.now());
                        }
                        triggerRefresh();
                    },
                },
            ];

            // 最近使用区域提供"从使用记录中删除"
            if (source === 'recent') {
                menuBuilder.push({
                    label: '从"使用记录"中删除',
                    click: () => {
                        usageRepo?.removeByItemId(itemId);
                        triggerRefresh();
                    },
                });
            }

            const built = Menu.buildFromTemplate(menuBuilder);
            built.popup({ window: win, x: screenX, y: screenY });

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

            // Validate session
            if (!currentSession || currentSession.isCancelled) {
                return { ok: false, error: 'Session expired' };
            }
            if (currentSession.sessionId !== sessionId) {
                return { ok: false, error: 'Session expired' };
            }
            if (currentSession.queryId !== queryId) {
                return { ok: false, error: 'Session expired' };
            }

            // Validate item exists in current session
            if (!currentSession.resolveItem(itemId)) {
                return { ok: false, error: 'Item not found in current session' };
            }

            // Record usage
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
