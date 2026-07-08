import type {
    InputContextSnapshot,
    LauncherItem,
    LauncherItemId,
} from '@szybko/shared';
import type { PlatformDrizzleDatabase } from '../../sqlite/platform-database';
import type { ContextMenuItem, SearchProvider } from '../../../domain/search/search-provider';
import type { ExecuteContext, ExecuteResult, SearchProviderResult } from '../../../domain/search/types';
import { UsageEventRepository } from '../../sqlite/repositories/usage-event-repository';

/**
 * RecentSectionProvider——返回最近使用的结果。
 * 不实现 execute/getContextMenu，委托给 ownerProvider。
 *
 * sectionSource = "recent"，不改变 ownerProvider。
 */
export class RecentSectionProvider implements SearchProvider {
    readonly id = 'recent';
    readonly priority = 10;

    private repo: UsageEventRepository;

    constructor(
        db: PlatformDrizzleDatabase,
        private resolveExternal: (itemId: LauncherItemId) => Promise<LauncherItem | null>,
    ) {
        this.repo = new UsageEventRepository(db);
    }

    async search(_snapshot: InputContextSnapshot, _signal?: AbortSignal): Promise<SearchProviderResult> {
        const rows = this.repo.topUsed(20);
        if (rows.length === 0) {
            return { items: [], section: { id: 'recent', title: '最近使用', source: 'recent', layout: 'grid' } };
        }

        const items: LauncherItem[] = [];
        for (const row of rows) {
            const itemId = row.itemId as LauncherItemId;
            const item = await this.resolveExternal(itemId);
            if (item) {
                // recent 区不显示 pin 操作
                items.push({ ...item, capabilities: { ...item.capabilities, pin: false } });
            }
        }

        return {
            items,
            section: { id: 'recent', title: '最近使用', source: 'recent', layout: 'grid' },
        };
    }

    async resolve(itemId: LauncherItemId): Promise<LauncherItem | null> {
        return this.resolveExternal(itemId);
    }

    async execute(_itemId: LauncherItemId, _ctx: ExecuteContext): Promise<ExecuteResult> {
        return { ok: false, error: 'RecentSectionProvider does not implement execute' };
    }

    async getContextMenu(_itemId: LauncherItemId): Promise<ContextMenuItem[]> {
        return [];
    }
}
