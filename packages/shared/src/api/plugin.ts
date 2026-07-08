import type { PluginEnterPayload, PluginOutPayload } from '../ipc/contract';
import type { PluginFeature } from '../plugin/types';

export interface SzybkoPluginApi {
    setFeature: (feature: PluginFeature) => Promise<{ ok: boolean; error?: string }>;
    getFeatures: (codes?: string[]) => Promise<PluginFeature[]>;
    removeFeature: (code: string) => Promise<{ ok: boolean; error?: string }>;
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
}
