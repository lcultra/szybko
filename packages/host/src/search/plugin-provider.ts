import type {
    InputContextSnapshot,
    LauncherItem,
    LauncherItemId,
} from '@szybko/shared';
import type { PlatformDrizzleDatabase } from '../persistence/sqlite/platform-database';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { ContextMenuItem, SearchProvider } from './provider';
import type { ExecuteContext, ExecuteResult, SearchProviderResult } from './types';
import { MatchSessionManager } from '../input/match-session-manager';
import { SearchService } from '../input/search-service';

/**
 * PluginProvider——从命令库搜索插件命令匹配。
 * ownerProvider = "plugin"
 */
export class PluginProvider implements SearchProvider {
    readonly id = 'plugin';
    readonly priority = 100;

    private searchService: SearchService;
    private sessionManager: MatchSessionManager;

    constructor(
        db: PlatformDrizzleDatabase,
        private coordinator: RuntimeCoordinator,
        sessionManager?: MatchSessionManager,
    ) {
        this.searchService = new SearchService(db);
        this.sessionManager = sessionManager ?? new MatchSessionManager();
    }

    async search(snapshot: InputContextSnapshot, _signal?: AbortSignal): Promise<SearchProviderResult> {
        const query = snapshot.query.trim();
        // 空查询时 plugin provider 不返回结果（避免非 text matcher 误匹配）
        if (!query) {
            return { items: [], section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' } };
        }
        const matches = this.searchService.search(snapshot, query);

        if (matches.length === 0) {
            return { items: [], section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' } };
        }

        const session = this.sessionManager.create(snapshot);
        this.sessionManager.addMatches(session.sessionId, matches);

        const items: LauncherItem[] = matches.map(m => ({
            id: `plugin://${m.pluginId}/${m.featureCode}/${m.cmdKey}` as LauncherItemId,
            ownerProvider: 'plugin',
            title: m.label || m.featureCode,
            subtitle: `打开 ${m.pluginId}`,
            icon: { type: 'emoji', value: '🧩' },
            score: m.score,
            capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
            state: { pinned: false },
            matchLevel: m.score > 95 ? 3 : m.score > 50 ? 2 : 1,
        }));

        return {
            items,
            section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' },
        };
    }

    async resolve(_itemId: LauncherItemId): Promise<LauncherItem | null> {
        // PluginProvider 的结果会在 search 时完整返回给 SearchSession，
        // 不需要独立 resolve。对 pinned/recent 的 resolve 走 session itemsById 缓存。
        return null;
    }

    async execute(itemId: LauncherItemId, _ctx: ExecuteContext): Promise<ExecuteResult> {
        // parse plugin://<pluginId>/<featureCode>/<cmdKey>
        const path = itemId.replace('plugin://', '');
        const parts = path.split('/');
        if (parts.length < 3)
            return { ok: false, error: `Invalid plugin itemId: ${itemId}` };
        const [pluginId, featureCode] = parts;

        // 通过 MatchSessionManager 找回 match context
        const resolved = this.sessionManager.resolveByPluginKey(pluginId, featureCode);
        if (resolved) {
            this.coordinator.activatePlugin(pluginId, featureCode, {
                code: resolved.match.featureCode,
                type: resolved.match.enterType,
                payload: resolved.match.payload,
                option: resolved.match.option ?? undefined,
                from: resolved.match.from,
                matchId: resolved.match.matchId,
            });
            return { ok: true };
        }

        this.coordinator.activatePlugin(pluginId, featureCode);
        return { ok: true };
    }

    async getContextMenu(_itemId: LauncherItemId): Promise<ContextMenuItem[]> {
        return [];
    }
}
