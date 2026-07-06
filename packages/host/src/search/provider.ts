import type { InputContextSnapshot, LauncherItem, LauncherItemId } from '@szybko/shared';
import type { ExecuteContext, ExecuteResult, SearchProviderResult } from './types';

/**
 * SearchProvider 接口——每个 Provider 拥有完整生命周期。
 *
 * - `search`：在上下文中搜索匹配结果
 * - `resolve`：根据 itemId 恢复完整的 LauncherItem（供 SectionProvider 使用）
 * - `execute`：执行 item
 * - `getContextMenu`：返回该 item 的自定义菜单项
 */
export interface SearchProvider {
    readonly id: string;
    readonly priority: number;
    search: (snapshot: InputContextSnapshot, signal?: AbortSignal) => Promise<SearchProviderResult>;
    resolve: (itemId: LauncherItemId) => Promise<LauncherItem | null>;
    execute: (itemId: LauncherItemId, ctx: ExecuteContext) => Promise<ExecuteResult>;
    getContextMenu: (itemId: LauncherItemId) => Promise<ContextMenuItem[]>;
}

export interface ContextMenuItem {
    label: string;
    action: () => Promise<void>;
}
