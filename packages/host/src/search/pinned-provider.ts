import type {
    InputContextSnapshot,
    LauncherItem,
    LauncherItemId,
} from '@szybko/shared';
import type { PlatformDrizzleDatabase } from '../persistence/sqlite/platform-database';
import type { ContextMenuItem, SearchProvider } from './provider';
import type { ExecuteContext, ExecuteResult, SearchProviderResult } from './types';
import { PinnedItemRepository } from '../persistence/sqlite/repositories/pinned-item-repository';

/**
 * PinnedSectionProvider——返回被用户固定的结果。
 * 不实现 execute/getContextMenu，委托给 ownerProvider。
 *
 * sectionSource = "pinned"，不改变 ownerProvider。
 */
export class PinnedSectionProvider implements SearchProvider {
    readonly id = 'pinned';
    readonly priority = 0;

    private repo: PinnedItemRepository;

    constructor(
        db: PlatformDrizzleDatabase,
        private resolveExternal: (itemId: LauncherItemId) => Promise<LauncherItem | null>,
    ) {
        this.repo = new PinnedItemRepository(db);
    }

    async search(_snapshot: InputContextSnapshot, _signal?: AbortSignal): Promise<SearchProviderResult> {
        const rows = this.repo.list();
        if (rows.length === 0) {
            return { items: [], section: { id: 'pinned', title: '固定', source: 'pinned', layout: 'grid' } };
        }

        const items: LauncherItem[] = [];
        for (const row of rows) {
            const itemId = row.itemId as LauncherItemId;
            const item = await this.resolveExternal(itemId);
            if (item) {
                items.push({ ...item, state: { ...item.state, pinned: true } });
            }
        }

        return {
            items,
            section: { id: 'pinned', title: '固定', source: 'pinned', layout: 'grid' },
        };
    }

    async resolve(itemId: LauncherItemId): Promise<LauncherItem | null> {
        return this.resolveExternal(itemId);
    }

    async execute(_itemId: LauncherItemId, _ctx: ExecuteContext): Promise<ExecuteResult> {
        return { ok: false, error: 'PinnedSectionProvider does not implement execute' };
    }

    async getContextMenu(_itemId: LauncherItemId): Promise<ContextMenuItem[]> {
        return [];
    }
}
