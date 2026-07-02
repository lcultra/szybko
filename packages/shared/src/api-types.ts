import type { ActionDescriptor, SearchBatch, SearchRequest } from './search-types.js';

// ── Plugin-facing API (exposed via window.szybko / window.utools) ─

export interface SzybkoPluginApi {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') => Promise<{ ok: boolean; hostId: string }>;
    onRuntimeStateChanged: (cb: (state: unknown) => void) => () => void;
}

// ── Launcher internal API (exposed via window.__szybko_internal__) ─

export interface SzybkoInternalApi {
    search: (req: SearchRequest) => Promise<{ ok: boolean }>;
    searchCancel: (queryId: string) => Promise<{ ok: boolean }>;
    resizeWindow: (height: number) => Promise<{ ok: boolean }>;
    hideWindow: () => Promise<{ ok: boolean }>;
    onSearchBatch: (cb: (batch: SearchBatch) => void) => () => void;
    onShowMainWindow: (cb: () => void) => () => void;
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => () => void;
}
