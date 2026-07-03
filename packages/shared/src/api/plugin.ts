import type { PluginOutPayload } from '../ipc/contract';
import type { PluginFeature } from '../plugin/types';
import type { ActionDescriptor } from '../search/types';

export interface SzybkoPluginApi {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') => Promise<{ ok: boolean; hostId?: string; error?: string }>;
    setFeature: (feature: PluginFeature) => Promise<{ ok: boolean; error?: string }>;
    getFeatures: (codes?: string[]) => Promise<PluginFeature[]>;
    removeFeature: (code: string) => Promise<{ ok: boolean; error?: string }>;
    onRuntimeStateChanged: (cb: (state: unknown) => void) => () => void;
    onPluginEnter: (cb: (payload: unknown) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
}
