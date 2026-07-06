import type {
    InputContextSnapshot,
    LauncherItem,
    LauncherItemId,
    ResultSection,
    SearchResponse,
    SearchResponseStatus,
} from '@szybko/shared';
import type { SearchProvider } from './provider';
import type { ExecuteContext, ExecuteResult } from './types';
import { randomUUID } from 'node:crypto';

export type SearchResponseEmitter = (res: SearchResponse) => void;

/**
 * SearchSession——搜索会话。
 *
 * 职责：
 * - 管理 search 生命周期（partial → final）
 * - 维护 itemsById registry（所有 section 共享）
 * - 并行调用 SearchProvider
 * - 去重、排序、组装 sections
 * - 通过 emitter 输出 SearchResponse 快照
 */
export class SearchSession {
    readonly queryId: string;
    readonly sessionId: string;

    #cancelled = false;

    cancel(): void {
        this.#cancelled = true;
    }

    get isCancelled(): boolean {
        return this.#cancelled;
    }

    private itemsById = new Map<LauncherItemId, LauncherItem>();
    private providers: SearchProvider[];
    private emitter: SearchResponseEmitter;

    constructor(
        queryId: string,
        providers: SearchProvider[],
        emitter: SearchResponseEmitter,
    ) {
        this.queryId = queryId;
        this.sessionId = randomUUID();
        this.providers = providers;
        this.emitter = emitter;
    }

    /** 执行一次完整搜索，按结果类型组装 sections */
    async search(snapshot: InputContextSnapshot): Promise<void> {
        this.itemsById.clear();
        if (this.#cancelled)
            return;

        // 并行调用所有 provider
        const results = await Promise.all(
            this.providers.map(async (p) => {
                try {
                    return { providerId: p.id, result: await p.search(snapshot) };
                }
                catch (err) {
                    console.error(`[SearchSession] provider ${p.id} error:`, err);
                    return { providerId: p.id, result: { items: [], section: null } };
                }
            }),
        );

        if (this.#cancelled)
            return;

        // Build itemsById registry (dedup: same id → higher score wins)
        // Also categorize sections by source
        const pluginItems: LauncherItem[] = [];
        const recentSectionData: Array<{ section: any; items: LauncherItem[] }> = [];
        const pinnedSectionData: Array<{ section: any; items: LauncherItem[] }> = [];

        for (const { providerId, result } of results) {
            if (!result.section)
                continue;

            const section = result.section;
            const sectionItemsById = new Map<LauncherItemId, LauncherItem>();

            for (const item of result.items) {
                const sectionExisting = sectionItemsById.get(item.id);
                if (!sectionExisting || item.score > sectionExisting.score) {
                    sectionItemsById.set(item.id, item);
                }

                const existing = this.itemsById.get(item.id);
                if (!existing || item.score > existing.score) {
                    this.itemsById.set(item.id, item);
                }
            }

            const dedupedItems = [...sectionItemsById.values()];

            if (providerId === 'plugin') {
                pluginItems.push(...dedupedItems);
            }
            else if (providerId === 'recent') {
                recentSectionData.push({ section, items: dedupedItems });
            }
            else if (providerId === 'pinned') {
                pinnedSectionData.push({ section, items: dedupedItems });
            }
        }

        const isEmptyQuery = !snapshot.query;
        const hasPluginHits = pluginItems.length > 0;

        let sections: ResultSection[];

        if (isEmptyQuery) {
            // Empty query → default content: recent, then pinned
            sections = this.buildDefaultSections(recentSectionData, pinnedSectionData);
        }
        else if (hasPluginHits) {
            // Non-empty query with hits → only "best" section
            sections = this.buildSearchSection(pluginItems);
        }
        else {
            // Non-empty query without hits → fallback to default content
            sections = this.buildDefaultSections(recentSectionData, pinnedSectionData);
        }

        if (this.#cancelled)
            return;

        this.emit('partial', sections);
        this.emit('final', sections);
    }

    private buildSearchSection(items: LauncherItem[]): ResultSection[] {
        return [{
            id: 'best',
            title: '搜索结果',
            source: 'search',
            layout: 'grid',
            itemIds: items.map(i => i.id),
            totalCount: items.length,
            hasMore: false,
            priority: 0,
        }];
    }

    private buildDefaultSections(
        recentData: Array<{ section: any; items: LauncherItem[] }>,
        pinnedData: Array<{ section: any; items: LauncherItem[] }>,
    ): ResultSection[] {
        const sections: ResultSection[] = [];

        // Recent section (first)
        if (recentData.length > 0) {
            const items = recentData.flatMap(d => d.items);
            if (items.length > 0) {
                sections.push({
                    id: 'recent',
                    title: '最近使用',
                    source: 'recent',
                    layout: 'grid',
                    itemIds: items.map(i => i.id),
                    totalCount: items.length,
                    hasMore: false,
                    priority: 0,
                });
            }
        }

        // Pinned section (second)
        if (pinnedData.length > 0) {
            const items = pinnedData.flatMap(d => d.items);
            if (items.length > 0) {
                sections.push({
                    id: 'pinned',
                    title: '固定',
                    source: 'pinned',
                    layout: 'grid',
                    itemIds: items.map(i => i.id),
                    totalCount: items.length,
                    hasMore: false,
                    priority: 10,
                });
            }
        }

        return sections;
    }

    /** 从 registry 获取 item */
    resolveItem(itemId: LauncherItemId): LauncherItem | null {
        return this.itemsById.get(itemId) ?? null;
    }

    /** 委托给 ownerProvider 执行 */
    async executeItem(itemId: LauncherItemId, ctx: ExecuteContext): Promise<ExecuteResult> {
        const item = this.resolveItem(itemId);
        if (!item)
            return { ok: false, error: `Item not found: ${itemId}` };

        const provider = this.providers.find(p => p.id === item.ownerProvider);
        if (!provider)
            return { ok: false, error: `Provider not found: ${item.ownerProvider}` };

        return provider.execute(itemId, ctx);
    }

    /** 委托给 ownerProvider 获取菜单 */
    async getContextMenu(itemId: LauncherItemId): Promise<any[]> {
        const item = this.resolveItem(itemId);
        if (!item)
            return [];

        const provider = this.providers.find(p => p.id === item.ownerProvider);
        if (!provider)
            return [];

        return provider.getContextMenu(itemId);
    }

    private emit(status: SearchResponseStatus, sections: any[]): void {
        const itemsById: Record<string, LauncherItem> = {};
        for (const [key, val] of this.itemsById) {
            itemsById[key] = val;
        }

        this.emitter({
            queryId: this.queryId,
            sessionId: this.sessionId,
            status,
            sections,
            itemsById: itemsById as Record<LauncherItemId, LauncherItem>,
        });
    }
}
