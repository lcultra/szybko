import type { LauncherItem, LauncherItemId, SearchRequest } from '@szybko/shared';
import type { SearchProvider } from '../../domain/search/search-provider';
import type { PluginCatalog } from '../../infrastructure/filesystem/plugin-catalog';
import type { MatchSessionManager } from '../../infrastructure/input/match-session-manager';
import type { PlatformDatabase } from '../../infrastructure/sqlite/platform-database';
import type { WindowManager } from '../../presentation/window/window-manager';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { LauncherItemService } from './launcher-item-service';
import { IPC } from '@szybko/shared';
import { collectFromSearch } from '../../infrastructure/input/input-context-collector';
import { PinnedSectionProvider } from '../../infrastructure/search/providers/pinned-provider';
import { PluginProvider } from '../../infrastructure/search/providers/plugin-provider';
import { RecentSectionProvider } from '../../infrastructure/search/providers/recent-provider';
import { SearchSession } from './search-session';

export interface SearchServiceDeps {
    platformDb: PlatformDatabase;
    pluginCatalog: PluginCatalog;
    coordinator: RuntimeCoordinator;
    windowManager: WindowManager;
    sessionManager: MatchSessionManager;
    launcherItemService: LauncherItemService;
    emitter: (channel: string, data: unknown) => void;
}

export class SearchApplicationService {
    private currentSession: SearchSession | null = null;
    private lastSearchRequest: SearchRequest | null = null;
    private pluginProvider: PluginProvider | null = null;
    private pinnedProvider: PinnedSectionProvider | null = null;
    private recentProvider: RecentSectionProvider | null = null;

    constructor(private deps: SearchServiceDeps) {
        this.initProviders();
    }

    private initProviders(): void {
        const db = this.deps.platformDb.drizzle();
        const resolveFromProviders = async (itemId: LauncherItemId): Promise<LauncherItem | null> => {
            // 1. Try current session cache
            const sessionItem = this.currentSession?.resolveItem(itemId);
            if (sessionItem)
                return sessionItem;
            // 2. Try plugin provider's resolve
            if (itemId.startsWith('plugin://') && this.pluginProvider) {
                return this.pluginProvider.resolve(itemId);
            }
            return null;
        };

        this.pluginProvider = new PluginProvider(db, this.deps.coordinator, this.deps.pluginCatalog, this.deps.sessionManager);
        this.pinnedProvider = new PinnedSectionProvider(db, resolveFromProviders);
        this.recentProvider = new RecentSectionProvider(db, resolveFromProviders);
    }

    async query(request: SearchRequest): Promise<{ ok: boolean; sessionId?: string }> {
        this.lastSearchRequest = request;
        return this.startNewSession(request);
    }

    cancel(): void {
        if (this.currentSession) {
            this.currentSession.cancel();
            this.currentSession = null;
        }
    }

    async executeItem(sessionId: string, queryId: string, itemId: string): Promise<{ ok: boolean; error?: string }> {
        if (!this.currentSession || this.currentSession.isCancelled) {
            return { ok: false, error: 'Session expired' };
        }
        if (this.currentSession.sessionId !== sessionId || this.currentSession.queryId !== queryId) {
            return { ok: false, error: 'Session expired' };
        }
        if (!this.currentSession.resolveItem(itemId as LauncherItemId)) {
            return { ok: false, error: 'Item not found in current session' };
        }

        // Record usage via LauncherItemService
        await this.deps.launcherItemService.recordUsage(itemId);

        const result = await this.currentSession.executeItem(itemId as LauncherItemId, { queryId, sessionId });
        return result;
    }

    triggerRefresh(): void {
        if (!this.lastSearchRequest || !this.pluginProvider || !this.pinnedProvider || !this.recentProvider)
            return;
        this.startNewSession(this.lastSearchRequest);
    }

    private startNewSession(request: SearchRequest): { ok: boolean; sessionId?: string } {
    // Cancel previous session
        if (this.currentSession) {
            this.currentSession.cancel();
        }
        this.currentSession = null;

        const snapshot = collectFromSearch(request);
        const win = this.deps.windowManager.getWindow();
        if (!win || win.isDestroyed())
            return { ok: false };

        const providers = [this.pinnedProvider, this.recentProvider, this.pluginProvider]
            .filter(Boolean) as SearchProvider[];

        const session = new SearchSession(request.queryId, providers, (res) => {
            if (!win.isDestroyed()) {
                win.webContents.send(IPC.SEARCH_RESPONSE, res);
            }
        });

        this.currentSession = session;

        session.search(snapshot).catch((err: unknown) => {
            console.error('[SearchApp] SearchSession error:', err);
        });

        return { ok: true, sessionId: session.sessionId };
    }
}
