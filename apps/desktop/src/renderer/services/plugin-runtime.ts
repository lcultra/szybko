import type { HostType } from '../types';

function getApi() {
    return window.szybkoInternal ?? null;
}

export const PluginRuntimeService = {
    hide(runtimeId: string): Promise<{ ok: boolean }> {
        return getApi()?.hidePlugin(runtimeId) ?? Promise.resolve({ ok: false });
    },

    destroy(runtimeId: string): Promise<{ ok: boolean }> {
        return getApi()?.destroyPlugin(runtimeId) ?? Promise.resolve({ ok: false });
    },

    pin(runtimeId: string, pin: boolean): Promise<{ ok: boolean }> {
        return getApi()?.pinPlugin(runtimeId, pin) ?? Promise.resolve({ ok: false });
    },

    showMenu(runtimeId: string, hostType: HostType): Promise<{ ok: boolean }> {
        return getApi()?.showPluginMenu(runtimeId, hostType) ?? Promise.resolve({ ok: false });
    },
};
