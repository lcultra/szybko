import type { HostType } from '../types';

/**
 * 插件运行时操作服务层。
 * 所有针对插件运行时的 IPC 调用集中在此，
 * 组件和页面不直接调用 window.szybkoInternal / window.szybko。
 */
function getApi() {
    return window.szybkoInternal ?? null;
}

function getPluginApi() {
    return window.szybko ?? null;
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

    switchHost(runtimeId: string, targetHost: HostType): Promise<{ ok: boolean; hostId?: string; error?: string }> {
        return getPluginApi()?.switchHost(runtimeId, targetHost) ?? Promise.resolve({ ok: false });
    },
};
