import type { SearchResult } from '@szybko/shared';
import { search as launcherSearch } from '@szybko/plugin-launcher';

type SearchProvider = (query: string) => SearchResult[];

/**
 * 内置搜索提供者注册表。
 * 每个提供者在主进程直接运行，无需 WebContentsView 中转。
 * 添加新插件时在此导入并注册。
 */
const providers: SearchProvider[] = [
    launcherSearch,
];

/** 运行所有内置插件搜索提供者，返回合并结果 */
export function runBuiltinPluginSearch(query: string): SearchResult[] {
    if (!query.trim()) return [];
    return providers.flatMap(fn => fn(query));
}
