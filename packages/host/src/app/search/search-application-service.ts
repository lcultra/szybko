import type { SearchRequest, LauncherItem, LauncherItemId } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import type { PlatformDatabase } from '../../persistence/sqlite/platform-database';
import type { SearchProvider } from '../../search/provider';
import { SearchSession } from '../../search/search-session';
import { PluginProvider } from '../../search/plugin-provider';
import { PinnedSectionProvider } from '../../search/pinned-provider';
import { RecentSectionProvider } from '../../search/recent-provider';
import type { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { PluginCatalog } from '../../plugins/plugin-catalog';
import type { WindowManager } from '../../window/window-manager';
import type { MatchSessionManager } from '../../input/match-session-manager';
import type { LauncherItemService } from './launcher-item-service';
import { collectFromSearch } from '../../input/input-context-collector';

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
      if (sessionItem) return sessionItem;
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
    // Cancel previous session
    if (this.currentSession) {
      this.currentSession.cancel();
    }
    this.currentSession = null;
    this.lastSearchRequest = request;

    const snapshot = collectFromSearch(request);
    const win = this.deps.windowManager.getWindow();
    if (!win || win.isDestroyed()) return { ok: false };

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
    if (!this.lastSearchRequest || !this.pluginProvider || !this.pinnedProvider || !this.recentProvider) return;

    const win = this.deps.windowManager.getWindow();
    if (!win || win.isDestroyed()) return;

    if (this.currentSession) {
      this.currentSession.cancel();
    }

    const snapshot = collectFromSearch(this.lastSearchRequest);
    const providers = [this.pinnedProvider, this.recentProvider, this.pluginProvider]
      .filter(Boolean) as SearchProvider[];

    const session = new SearchSession(this.lastSearchRequest.queryId, providers, (res) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.SEARCH_RESPONSE, res);
      }
    });

    this.currentSession = session;
    session.search(snapshot).catch((err: unknown) => {
      console.error('[SearchApp] Refresh error:', err);
    });
  }
}
