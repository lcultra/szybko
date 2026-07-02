import { create } from 'zustand'
import type { SearchResult } from '@szybko/shared'

type AppState = 'idle' | 'searching' | 'plugin'

interface AppStore {
    state: AppState
    query: string
    results: SearchResult[]
    selectedIndex: number
    activePluginId: string | null
    setQuery: (query: string) => void
    setResults: (results: SearchResult[]) => void
    setSelectedIndex: (index: number) => void
    setState: (state: AppState) => void
    setActivePlugin: (pluginId: string | null) => void
}

export const useAppStore = create<AppStore>(set => ({
    state: 'idle',
    query: '',
    results: [],
    selectedIndex: 0,
    activePluginId: null,
    setQuery: query => set({ query, state: query ? 'searching' : 'idle' }),
    setResults: results => set({ results }),
    setSelectedIndex: selectedIndex => set({ selectedIndex }),
    setState: state => set({ state }),
    setActivePlugin: activePluginId => set({ activePluginId, state: activePluginId ? 'plugin' : 'idle' }),
}))
