import type { SearchBatch, SearchRequest } from '../search/types';

export interface SzybkoInternalApi {
    search: (req: SearchRequest) => Promise<{ ok: boolean }>;
    searchCancel: (queryId: string) => Promise<{ ok: boolean }>;
    resizeWindow: (height: number) => Promise<{ ok: boolean }>;
    hideWindow: () => Promise<{ ok: boolean }>;
    hidePlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    destroyPlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    showPluginMenu: (runtimeId: string, variant?: 'launcher' | 'detached') => Promise<{ ok: boolean }>;
    onSearchBatch: (cb: (batch: SearchBatch) => void) => () => void;
    onShowMainWindow: (cb: () => void) => () => void;
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => () => void;
}
