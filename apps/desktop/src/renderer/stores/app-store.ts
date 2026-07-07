import { create } from 'zustand';

type AppState = 'idle' | 'searching' | 'plugin';

interface AppStore {
    state: AppState;
    query: string;

    setQuery: (query: string) => void;
    setState: (state: AppState) => void;
}

export const useAppStore = create<AppStore>(set => ({
    state: 'idle',
    query: '',

    setQuery: query => set({ query, state: query ? 'searching' : 'idle' }),
    setState: state => set({ state }),
}));
