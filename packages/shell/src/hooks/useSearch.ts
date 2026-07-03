import type { SearchBatch } from '@szybko/shared';
import { SEARCH_DEBOUNCE_MS } from '@szybko/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/app-store';

function generateId(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 搜索 hook — 薄层，读写通过 app-store。
 * 去除了独立的 local state，app-store 是唯一事实源。
 */
export function useSearch() {
    const query = useAppStore(s => s.query);
    const results = useAppStore(s => s.results);
    const selectedIndex = useAppStore(s => s.selectedIndex);
    const setQuery = useAppStore(s => s.setQuery);
    const setResults = useAppStore(s => s.setResults);
    const setSelectedIndex = useAppStore(s => s.setSelectedIndex);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const resultsRef = useRef(results);
    resultsRef.current = results;

    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        if (!value) {
            setResults([]);
            return;
        }

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const queryId = generateId();
            window.szybkoInternal?.search({ queryId, query: value, timestamp: Date.now() });
        }, SEARCH_DEBOUNCE_MS);
    }, [setQuery, setResults]);

    useEffect(() => {
        const cleanup = window.szybkoInternal?.onSearchBatch((batch: SearchBatch) => {
            setResults([...resultsRef.current, ...batch.results]);
            setSelectedIndex(0);
        });
        return () => cleanup?.();
    }, [setResults, setSelectedIndex]);

    return { query, setQuery: handleQueryChange, results, selectedIndex, setSelectedIndex };
}
