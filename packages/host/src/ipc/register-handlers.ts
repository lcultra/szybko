import type {
    IpcInvokeContract,
    IpcRendererToMainEventContract,
} from '@szybko/shared';
import type { BrowserWindow } from 'electron';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { WindowManager } from '../window/window-manager';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import { runBuiltinSearch } from './builtin-search';
import { executeAction } from './execute-action';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];
type RendererEvent<C extends keyof IpcRendererToMainEventContract> = IpcRendererToMainEventContract[C];

// ── Register all IPC handlers ─────────────────────────────────────

export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,
    pluginCatalog?: PluginCatalog,
) {
    // ── Search ─────────────────────────────────────────────────────

    ipcMain.handle(
        IPC.SEARCH_QUERY,
        (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): IpcResponse<typeof IPC.SEARCH_QUERY> => {
            // Built-in search + plugin feature match
            const results = runBuiltinSearch(req.query);
            if (pluginCatalog) {
                results.push(...pluginCatalog.matchFeatures(req.query));
            }
            results.sort((a, b) => b.score - a.score);
            const win = windowManager.getWindow();

            if (results.length > 0 && win && !win.isDestroyed()) {
                win.webContents.send(IPC.SEARCH_BATCH, {
                    queryId: req.queryId,
                    batchSeq: 0,
                    source: 'builtin',
                    results,
                    isFinal: false,
                });
            }

            // Plugin search (async — results come back via plugin:search-result)
            coordinator.sendPluginSearch(req);

            // Final batch (empty, signals end of built-in results)
            if (win && !win.isDestroyed()) {
                win.webContents.send(IPC.SEARCH_BATCH, {
                    queryId: req.queryId,
                    batchSeq: 1,
                    source: 'builtin',
                    results: [],
                    isFinal: true,
                });
            }

            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.SEARCH_CANCEL,
        (): IpcResponse<typeof IPC.SEARCH_CANCEL> => {
            return { ok: true };
        },
    );

    // ── Plugin search results ──────────────────────────────────────

    ipcMain.on(IPC.PLUGIN_SEARCH_RESULT, (_event, batch: RendererEvent<typeof IPC.PLUGIN_SEARCH_RESULT>) => {
        const win = windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.SEARCH_BATCH, {
                queryId: batch.queryId,
                batchSeq: 0,
                source: 'plugin',
                results: batch.results,
                isFinal: true,
            });
        }
    });

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

    // ── Execute ────────────────────────────────────────────────────

    ipcMain.handle(
        IPC.PLUGIN_EXEC,
        (_event, { action }: IpcRequest<typeof IPC.PLUGIN_EXEC>): IpcResponse<typeof IPC.PLUGIN_EXEC> => {
            // plugin.open 需要激活 Runtime，不走 executeAction 纯函数
            if (action.type === 'plugin.open') {
                coordinator.activatePlugin(action.payload.pluginId, action.payload.featureCode);
                return { ok: true };
            }
            return executeAction(action);
        },
    );

    // ── Host switch ────────────────────────────────────────────────

    ipcMain.handle(
        IPC.HOST_SWITCH,
        (_event, { pluginId, targetHost }: IpcRequest<typeof IPC.HOST_SWITCH>): IpcResponse<typeof IPC.HOST_SWITCH> => {
            try {
                const runtime = coordinator.getOrCreateRuntime(pluginId);
                if (!runtime) return { ok: false, error: 'Plugin not found' };

                coordinator.moveToHost(runtime.info.id, targetHost);

                const hostId = runtime.host?.id;
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

    // ── Plugin pin ────────────────────────────────────────────

    ipcMain.handle(
        IPC.PLUGIN_PIN,
        (_event, { runtimeId, pin }: IpcRequest<typeof IPC.PLUGIN_PIN>): IpcResponse<typeof IPC.PLUGIN_PIN> => {
            coordinator.pinRuntime(runtimeId, pin);
            return { ok: true };
        },
    );
}

// ── Push notifications ────────────────────────────────────────────

export function notifyShowMainWindow(win: BrowserWindow) {
    if (!win.isDestroyed()) {
        win.webContents.send(IPC.WINDOW_SHOW);
    }
}
