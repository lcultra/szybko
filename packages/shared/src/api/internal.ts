import type { RuntimeStatePayload } from '../ipc/contract';
import type { ActionDescriptor } from '../search/types';
import type { SearchBatch, SearchRequest } from '../search/types';

export interface SzybkoInternalApi {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    search: (req: SearchRequest) => Promise<{ ok: boolean }>;
    searchCancel: (queryId: string) => Promise<{ ok: boolean }>;
    resizeWindow: (height: number) => Promise<{ ok: boolean }>;
    hideWindow: () => Promise<{ ok: boolean }>;
    hidePlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    destroyPlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    showPluginMenu: (runtimeId: string, hostType?: 'launcher' | 'floating') => Promise<{ ok: boolean }>;
    pinPlugin: (runtimeId: string, pin: boolean) => Promise<{ ok: boolean }>;
    onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;
    onSearchBatch: (cb: (batch: SearchBatch) => void) => () => void;
    onShowMainWindow: (cb: () => void) => () => void;
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => () => void;
}
