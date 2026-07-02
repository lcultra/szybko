import type { SearchBatch, SearchResult } from '@szybko/shared';
import { SEARCH_DEBOUNCE_MS } from '@szybko/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

function generateId(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function useSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    }, []);

    useEffect(() => {
        const cleanup = window.szybkoInternal?.onSearchBatch((batch: SearchBatch) => {
            setResults(prev => [...prev, ...batch.results]);
            setSelectedIndex(0);
        });
        return () => cleanup?.();
    }, []);

    return { query, setQuery: handleQueryChange, results, selectedIndex, setSelectedIndex };
}
