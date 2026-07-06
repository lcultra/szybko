import type { LauncherItem, LauncherItemId, ResultSection, SearchResponse, SearchResponseStatus } from '@szybko/shared';
import { SEARCH_DEBOUNCE_MS } from '@szybko/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

function generateId(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface SearchState {
    query: string;
    sections: ResultSection[];
    itemsById: Record<LauncherItemId, LauncherItem>;
    status: SearchResponseStatus | 'idle';
    currentQueryId: string | null;
    sessionId: string | null;
    selectedIndex: number;
    expandedSectionIds: Set<string>;
}

/**
 * 搜索 hook — 接收 SearchResponse 快照替换 SearchBatch 累加。
 */
export function useSearch() {
    const [state, setState] = useState<SearchState>(() => ({
        query: '',
        sections: [],
        itemsById: {},
        status: 'idle',
        currentQueryId: null,
        sessionId: null,
        selectedIndex: 0,
        expandedSectionIds: new Set(),
    }));

    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const queryIdRef = useRef<string | null>(null);
    const stateRef = useRef(state);
    stateRef.current = state;

    const setPartial = useCallback((partial: Partial<SearchState>) => {
        setState((prev) => {
            const next = { ...prev, ...partial };
            stateRef.current = next;
            return next;
        });
    }, []);

    const doSearch = useCallback((value: string) => {
        const queryId = generateId();
        queryIdRef.current = queryId;
        window.szybkoInternal?.search({ queryId, query: value, timestamp: Date.now() }).then((res) => {
            if (res?.sessionId && queryIdRef.current === queryId) {
                setPartial({ currentQueryId: queryId, sessionId: res.sessionId });
            }
        });
    }, [setPartial]);

    const handleQueryChange = useCallback((value: string) => {
        setPartial({ query: value, status: value ? 'loading' : 'loading', selectedIndex: 0 });

        clearTimeout(timerRef.current);

        if (!value) {
            // 空查询：立即搜索（走 PinnedProvider + RecentProvider）
            doSearch('');
            return;
        }

        timerRef.current = setTimeout(() => {
            doSearch(value);
        }, SEARCH_DEBOUNCE_MS);
    }, [setPartial, doSearch]);

    // 挂载时触发空查询默认页
    useEffect(() => {
        doSearch('');
    }, [doSearch]);

    // 订阅 SearchResponse
    useEffect(() => {
        const subscribe = window.szybkoInternal?.onSearchResponse;
        if (!subscribe)
            return;

        const cleanup = subscribe((res: SearchResponse) => {
            // 丢弃过期响应
            if (res.queryId !== queryIdRef.current)
                return;

            setPartial({
                sections: res.sections,
                itemsById: res.itemsById,
                status: res.status,
            });
        });

        return () => cleanup();
    }, [setPartial]);

    const toggleExpand = useCallback((sectionId: string) => {
        setPartial({
            expandedSectionIds: new Set(stateRef.current.expandedSectionIds.has(sectionId)
                ? [...stateRef.current.expandedSectionIds].filter(id => id !== sectionId)
                : [...stateRef.current.expandedSectionIds, sectionId]),
        });
    }, [setPartial]);

    // 计算当前可见 items（展开/收起影响）
    const visibleItemIds = (() => {
        const { sections, expandedSectionIds } = stateRef.current;
        return sections.flatMap(s =>
            expandedSectionIds.has(s.id) ? s.itemIds : s.itemIds.slice(0, 18),
        );
    })();

    const setSelectedIndex = useCallback((index: number) => {
        setPartial({ selectedIndex: index });
    }, [setPartial]);

    return {
        ...state,
        setQuery: handleQueryChange,
        setSelectedIndex,
        toggleExpand,
        visibleItemIds,
    };
}
