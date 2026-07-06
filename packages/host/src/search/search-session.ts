import type {
    InputContextSnapshot,
    LauncherItem,
    LauncherItemId,
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
 * - 管理 search 生命周期（loading → partial → final）
 * - 维护 itemsById registry（所有 section 共享）
 * - 并行调用 SearchProvider
 * - 去重、排序、组装 sections
 * - 通过 emitter 输出 SearchResponse 快照
 */
export class SearchSession {
    readonly queryId: string;
    readonly sessionId: string;

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

    /** 执行一次完整搜索，按状态机发射多次 SearchResponse */
    async search(snapshot: InputContextSnapshot): Promise<void> {
        this.itemsById.clear();
        this.emit('loading', []);

        // 并行调用所有 provider
        const results = await Promise.all(
            this.providers.map(async (p) => {
                try {
                    return { providerId: p.id, result: await p.search(snapshot) };
                }
                catch (err) {
                    console.error(`[SearchSession] provider ${p.id} error:`, err);
                    return { providerId: p.id, result: { items: [], section: null as any } };
                }
            }),
        );

        // 注册 items 到 registry（去重：同名 id 取高 score）
        const sectionData: Array<{ section: any; items: LauncherItem[] }> = [];
        for (const { result } of results) {
            if (!result.section)
                continue;
            const dedupedItems: LauncherItem[] = [];
            for (const item of result.items) {
                const existing = this.itemsById.get(item.id);
                if (!existing || item.score > existing.score) {
                    this.itemsById.set(item.id, item);
                }
                // 添加到 section（所有 item，除了已经在 registry 被更高分覆盖的）
                if (!existing || item.score > existing.score) {
                    dedupedItems.push(item);
                }
            }
            if (dedupedItems.length > 0 || !sectionData.some(s => s.section.id === result.section.id)) {
                sectionData.push({ section: result.section, items: dedupedItems });
            }
        }

        // 组装 sections（按 provider priority + section priority 排序）
        const sections = sectionData
            .filter(s => s.items.length > 0)
            .sort((a, b) => {
                const pa = this.providers.find(p => p.id === a.section.source)?.priority ?? 99;
                const pb = this.providers.find(p => p.id === b.section.source)?.priority ?? 99;
                return pa - pb || (a.section.priority ?? 0) - (b.section.priority ?? 0);
            })
            .map(({ section, items }) => ({
                id: section.id,
                title: section.title,
                source: section.source as 'pinned' | 'recent' | 'search',
                layout: section.layout as 'grid' | 'list' | 'compact',
                itemIds: items.map(i => i.id),
                totalCount: items.length,
                hasMore: false,
                priority: section.priority ?? 0,
            }));

        this.emit('partial', sections);
        this.emit('final', sections);
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
