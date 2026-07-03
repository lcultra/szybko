import type { SearchResult } from '@szybko/shared';

/** 搜索应用 / 命令 / 系统动作 */
export function search(_query: string): SearchResult[] {
    // 内置搜索提供者：主进程直接调用，无需 WebContentsView
    return [];
}
