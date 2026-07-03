import type { SzybkoPluginApi } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { invoke } from './ipc';

export function createFeatureApi(): Pick<SzybkoPluginApi, 'setFeature' | 'getFeatures' | 'removeFeature'> {
    return {
        setFeature: feature => invoke(IPC.FEATURE_SET)({ feature }),
        getFeatures: async (codes) => {
            const response = await invoke(IPC.FEATURE_GET)({ codes });
            return response.ok ? response.features : [];
        },
        removeFeature: code => invoke(IPC.FEATURE_REMOVE)({ code }),
    };
}
