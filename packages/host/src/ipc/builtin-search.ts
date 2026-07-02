import type { SearchResult } from '@szybko/shared';

/** 内置搜索结果（系统功能，不含插件特征匹配） */
export function runBuiltinSearch(_query: string): SearchResult[] {
    return [];
}
