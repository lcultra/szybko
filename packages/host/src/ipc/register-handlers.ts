import type {
    IpcInvokeContract,
    SearchResult,
} from '@szybko/shared';
import type { BrowserWindow } from 'electron';
import type { CommandCatalog } from '../commands/command-catalog';
import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { WindowManager } from '../window/window-manager';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { TriggerMatch } from '@szybko/shared';
import { normalizeTextKey } from '../commands/feature-normalizer';
import { collectFromSearch } from '../input/input-context-collector';
import { MatchSessionManager } from '../input/match-session-manager';
import { runPipeline } from '../input/matcher-pipeline';
import { CommandProjectionRepository } from '../persistence/sqlite/repositories/command-projection-repository';
import { executeAction } from './execute-action';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

// ── Register all IPC handlers ─────────────────────────────────────

/** Deduplicate (same pluginId+featureCode+cmdKey+matchedSource, keep highest score) and sort descending by score */
function dedupAndSort(matches: TriggerMatch[]): TriggerMatch[] {
    const seen = new Map<string, TriggerMatch>();
    for (const m of matches) {
        const key = `${m.pluginId}:${m.featureCode}:${m.cmdKey}:${m.matchedSource}`;
        const existing = seen.get(key);
        if (!existing || m.score > existing.score) {
            seen.set(key, m);
        }
    }
    return [...seen.values()].sort((a, b) => b.score - a.score);
}

export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,
    commandCatalog: CommandCatalog,
    platformDb?: PlatformDatabase,
) {
    const sessionManager = new MatchSessionManager();
    // ── Search ─────────────────────────────────────────────────────

    ipcMain.handle(
        IPC.SEARCH_QUERY,
        (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): IpcResponse<typeof IPC.SEARCH_QUERY> => {
            const results: SearchResult[] = [];

            // Matcher pipeline (text via SQL searchByText, regex/over via JS matchers)
            if (platformDb) {
                const repo = new CommandProjectionRepository(platformDb.drizzle());
                const snapshot = collectFromSearch(req);
                const allMatches: TriggerMatch[] = [];

                // 1. Text matching via SQL searchByText (with pinyin/alias support)
                if (snapshot.channels.query) {
                    const normalized = normalizeTextKey(req.query);
                    if (normalized) {
                        const textMatches = repo.searchByText(normalized);
                        for (const m of textMatches) {
                            const score = m.scoreBase + (m.matchLevel === 3 ? 10 : m.matchLevel === 2 ? 5 : 2);
                            allMatches.push({
                                matchId: `${m.source}:${m.pluginId}:${m.featureCode}:${m.cmdKey}`,
                                pluginId: m.pluginId,
                                featureCode: m.featureCode,
                                cmdKey: m.cmdKey,
                                triggerType: 'text',
                                enterType: 'text',
                                label: m.label,
                                matchedSource: req.query,
                                payload: req.query,
                                from: snapshot.from,
                                option: null,
                                score,
                            });
                        }
                    }
                }

                // 2. Non-text matching via pipeline (regex/over)
                const nonTextTypes: Array<'regex' | 'over'> = ['regex', 'over'];
                const triggers = repo.listTriggersByType(nonTextTypes);
                const nonTextMatches = runPipeline(snapshot, triggers);
                allMatches.push(...nonTextMatches);

                // 3. Dedup + Sort
                const deduped = dedupAndSort(allMatches);

                // 4. Session + SearchResult conversion
                if (deduped.length > 0) {
                    const session = sessionManager.create(snapshot);
                    sessionManager.addMatches(session.sessionId, deduped);

                    const pipelineResults = deduped.map(m => ({
                        id: m.matchId,
                        title: m.label || m.featureCode,
                        subtitle: `打开 ${m.pluginId}`,
                        icon: '🧩',
                        group: '插件',
                        score: m.score,
                        action: {
                            type: 'plugin.open' as const,
                            payload: {
                                pluginId: m.pluginId,
                                featureCode: m.featureCode,
                                matchId: m.matchId,
                            },
                        },
                    }));
                    results.push(...pipelineResults);
                }
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
                // Resolve match context from session manager if matchId is present
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
                    console.warn(`[IPC] matchId ${action.payload.matchId} not resolved (session expired or invalid)`);
                }
                // Fall back to simple activation without match context
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
                if (!runtime)
                    return { ok: false, error: 'Plugin not found' };

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

