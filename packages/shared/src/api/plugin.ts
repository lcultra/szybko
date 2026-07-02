import type { ActionDescriptor, PluginSearchContext, SearchResult } from '../search/types.js';

export interface SzybkoPluginApi {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') => Promise<{ ok: boolean; hostId: string }>;
    onRuntimeStateChanged: (cb: (state: unknown) => void) => () => void;
    onSearch: (cb: (ctx: PluginSearchContext) => SearchResult[]) => () => void;
    onPluginEnter: (cb: (payload: unknown) => void) => () => void;
}
