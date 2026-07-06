import type { ActionDescriptor, PluginEnterPayload, PluginFeature, PluginOutPayload, RuntimeStatePayload } from '@szybko/shared';

export interface SzybkoPluginSDK {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    switchHost: (runtimeId: string, targetHost: 'launcher' | 'floating') => Promise<{ ok: boolean; hostId?: string; error?: string }>;
    setFeature: (feature: PluginFeature) => Promise<{ ok: boolean; error?: string }>;
    getFeatures: (codes?: string[]) => Promise<PluginFeature[]>;
    removeFeature: (code: string) => Promise<{ ok: boolean; error?: string }>;
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
    onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;
}
