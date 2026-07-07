import type {
    IconDescriptor,
    InputContextSnapshot,
    LauncherItem,
    LauncherItemId,
} from '@szybko/shared';
import type { PlatformDrizzleDatabase } from '../persistence/sqlite/platform-database';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { ContextMenuItem, SearchProvider } from './provider';
import type { ExecuteContext, ExecuteResult, SearchProviderResult } from './types';
import { findTitleMatchRanges } from '../commands/feature-normalizer';
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
    private itemMatchMap = new Map<LauncherItemId, string>();

    constructor(
        db: PlatformDrizzleDatabase,
        private coordinator: RuntimeCoordinator,
        private catalog: PluginCatalog,
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
        this.itemMatchMap.clear(); // Clear previous session's mapping
        const matches = this.searchService.search(snapshot, query);

        if (matches.length === 0) {
            return { items: [], section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' } };
        }

        const session = this.sessionManager.create(snapshot);
        this.sessionManager.addMatches(session.sessionId, matches);

        const items: LauncherItem[] = matches.map((m) => {
            const itemId = `plugin://${m.pluginId}/${m.featureCode}/${m.cmdKey}` as LauncherItemId;
            this.itemMatchMap.set(itemId, m.matchId);
            const title = m.label || m.featureCode;
            const titleMatchRanges = findTitleMatchRanges(title, query);

            // 解析图标
            const plugin = this.catalog.get(m.pluginId);
            let icon: IconDescriptor | undefined;
            if (plugin) {
                const feature = plugin.manifest.features.find(f => f.code === m.featureCode);
                const iconPath = feature?.icon ?? plugin.manifest.logo;
                const encoded = iconPath.split('/').map(encodeURIComponent).join('/');
                icon = { type: 'url', value: `asset://plugin/${encodeURIComponent(plugin.id)}/${encoded}` };
            }

            return {
                id: itemId,
                ownerProvider: 'plugin',
                title,
                subtitle: `打开 ${m.pluginId}`,
                icon,
                score: m.score,
                capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
                state: { pinned: false },
                matches: titleMatchRanges ? { title: titleMatchRanges } : undefined,
                matchLevel: m.matchLevel,
            };
        });

        return {
            items,
            section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' },
        };
    }

    async resolve(itemId: LauncherItemId): Promise<LauncherItem | null> {
        if (!itemId.startsWith('plugin://'))
            return null;

        const path = itemId.replace('plugin://', '');
        const parts = path.split('/');
        if (parts.length < 3)
            return null;

        const [pluginId, featureCode, cmdKey] = parts;

        try {
            const trigger = this.searchService.getTrigger(pluginId, featureCode, cmdKey);
            if (!trigger)
                return null;

            return {
                id: itemId,
                ownerProvider: 'plugin',
                title: trigger.label || featureCode,
                subtitle: `打开 ${pluginId}`,
                icon: (() => {
                    const plugin = this.catalog.get(pluginId);
                    if (!plugin)
                        return undefined;
                    const feature = plugin.manifest.features.find(f => f.code === featureCode);
                    const iconPath = feature?.icon ?? plugin.manifest.logo;
                    const encoded = iconPath.split('/').map(encodeURIComponent).join('/');
                    return { type: 'url', value: `asset://plugin/${encodeURIComponent(pluginId)}/${encoded}` };
                })(),
                score: trigger.scoreBase,
                capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
                state: { pinned: false },
            };
        }
        catch {
            return null;
        }
    }

    async execute(itemId: LauncherItemId, _ctx: ExecuteContext): Promise<ExecuteResult> {
        // parse plugin://<pluginId>/<featureCode>/<cmdKey>
        const path = itemId.replace('plugin://', '');
        const parts = path.split('/');
        if (parts.length < 3)
            return { ok: false, error: `Invalid plugin itemId: ${itemId}` };
        const [pluginId, featureCode] = parts;

        // Prefer precise matchId from search result
        const matchId = this.itemMatchMap.get(itemId);
        if (matchId) {
            const resolved = this.sessionManager.resolve(matchId);
            if (resolved) {
                this.coordinator.activatePlugin(pluginId, featureCode, {
                    code: resolved.match.featureCode,
                    type: resolved.match.enterType,
                    payload: resolved.match.payload,
                    option: resolved.match.label ?? resolved.match.option ?? undefined,
                    from: resolved.match.from,
                    matchId: resolved.match.matchId,
                });
                return { ok: true };
            }
        }

        // Fallback: try by plugin key
        const resolved = this.sessionManager.resolveByPluginKey(pluginId, featureCode);
        if (resolved) {
            this.coordinator.activatePlugin(pluginId, featureCode, {
                code: resolved.match.featureCode,
                type: resolved.match.enterType,
                payload: resolved.match.payload,
                option: resolved.match.label ?? resolved.match.option ?? undefined,
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
