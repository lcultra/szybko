import type {
    EntryIntent,
    IconDescriptor,
    InputContextSnapshot,
    LauncherItem,
    LauncherItemId,
} from '@szybko/shared';
import type { RuntimeCoordinator } from '../../../app/runtime/runtime-coordinator';
import type { PluginQuery } from '../../../domain/plugins/plugin-query';
import type { ContextMenuItem, SearchProvider } from '../../../domain/search/search-provider';
import type { ExecuteContext, ExecuteResult, SearchProviderResult } from '../../../domain/search/types';
import type { PlatformDrizzleDatabase } from '../../sqlite/platform-database';
import { SearchService } from '../../../app/search/search-service';
import { findTitleMatchRanges } from '../../../domain/commands/feature-normalizer';

interface ExecuteContextEntry {
    payload: unknown;
    enterType: 'text' | 'regex' | 'over' | 'file' | 'img' | 'window';
    from: EntryIntent;
    label: string | null;
}

/**
 * PluginProvider——从命令库搜索插件命令匹配。
 * ownerProvider = "plugin"
 */
export class PluginProvider implements SearchProvider {
    readonly id = 'plugin';
    readonly priority = 100;

    private searchService: SearchService;
    private executeContextMap = new Map<LauncherItemId, ExecuteContextEntry>();

    constructor(
        db: PlatformDrizzleDatabase,
        private coordinator: RuntimeCoordinator,
        private catalog: PluginQuery,
    ) {
        this.searchService = new SearchService(db);
    }

    async search(snapshot: InputContextSnapshot, _signal?: AbortSignal): Promise<SearchProviderResult> {
        const query = snapshot.query.trim();
        // 空查询时 plugin provider 不返回结果（避免非 text matcher 误匹配）
        if (!query) {
            return { items: [], section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' } };
        }
        this.executeContextMap.clear();
        const matches = this.searchService.search(snapshot, query);

        if (matches.length === 0) {
            return { items: [], section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' } };
        }

        const items: LauncherItem[] = matches.map((m) => {
            const itemId = `plugin://${m.pluginId}/${m.featureCode}/${m.cmdKey}` as LauncherItemId;
            this.executeContextMap.set(itemId, {
                payload: m.payload,
                enterType: m.enterType,
                from: m.from,
                label: m.label,
            });
            const title = m.label ?? '';
            const titleMatchRanges = findTitleMatchRanges(title, query);

            // 解析插件信息
            const plugin = this.catalog.get(m.pluginId);
            const feature = plugin?.manifest.features.find(f => f.code === m.featureCode);
            const featureExplain = feature?.explain ?? '';
            let icon: IconDescriptor | undefined;
            if (plugin) {
                const iconPath = feature?.icon ?? plugin.manifest.logo;
                const encoded = iconPath.split('/').map(encodeURIComponent).join('/');
                icon = { type: 'url', value: `asset://plugin/${encodeURIComponent(plugin.id)}/${encoded}` };
            }

            return {
                id: itemId,
                ownerProvider: 'plugin',
                title,
                subtitle: featureExplain,
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

            const plugin = this.catalog.get(pluginId);
            const feature = plugin?.manifest.features.find(f => f.code === featureCode);
            const featureExplain = feature?.explain ?? '';

            return {
                id: itemId,
                ownerProvider: 'plugin',
                title: trigger.label ?? '',
                subtitle: featureExplain,
                icon: (() => {
                    if (!plugin)
                        return undefined;
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

        const ctx = this.executeContextMap.get(itemId);
        if (ctx) {
            this.coordinator.activatePlugin(pluginId, featureCode, {
                code: featureCode,
                type: ctx.enterType,
                payload: ctx.payload,
                option: ctx.label ?? undefined,
                from: ctx.from,
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
