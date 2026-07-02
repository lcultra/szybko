import type { SearchResult } from '@szybko/shared';
import { create } from 'zustand';

type AppState = 'idle' | 'searching' | 'plugin';

interface AppStore {
    state: AppState;
    query: string;
    results: SearchResult[];
    selectedIndex: number;
    activePluginId: string | null;
    activePluginName: string;
    activeFeatureExplain: string;
    setQuery: (query: string) => void;
    setResults: (results: SearchResult[]) => void;
    setSelectedIndex: (index: number) => void;
    setState: (state: AppState) => void;
    setActivePlugin: (id: string | null, name?: string, explain?: string) => void;
}

export const useAppStore = create<AppStore>(set => ({
    state: 'idle',
    query: '',
    results: [],
    selectedIndex: 0,
    activePluginId: null,
    activePluginName: '',
    activeFeatureExplain: '',
    setQuery: query => set({ query, state: query ? 'searching' : 'idle' }),
    setResults: results => set({ results }),
    setSelectedIndex: selectedIndex => set({ selectedIndex }),
    setState: state => set({ state }),
    setActivePlugin: (id, name = '', explain = '') => set({
        activePluginId: id,
        activePluginName: name,
        activeFeatureExplain: explain,
        state: id ? 'plugin' : 'idle',
    }),
}));
