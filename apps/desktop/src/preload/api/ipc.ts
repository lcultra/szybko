import type { IPC, SzybkoInternalApi, SzybkoPluginApi } from '@szybko/shared';
import { ipcRenderer } from 'electron';

// ── 类型工具 ─────────────────────────────────────────────────────

type InvokeRet<T> = T extends (...args: any[]) => Promise<infer R> ? R : never;
type OnData<T> = T extends (cb: (data: infer D) => void) => () => void ? D : never;

type CombinedApi = SzybkoInternalApi & SzybkoPluginApi;

/**
 * IPC 通道名 → API 方法名 映射。
 * 每个值必须是 CombinedApi 上的真实方法名（satisfies 校验）。
 * 新增 IPC 通道时，在这里加一行即可。
 */
// eslint-disable-next-line unused-imports/no-unused-vars
const IPC_API = {
    SEARCH_QUERY: 'search',
    SEARCH_CANCEL: 'searchCancel',
    PLUGIN_EXEC: 'execute',
    WINDOW_RESIZE: 'resizeWindow',
    WINDOW_HIDE: 'hideWindow',
    HOST_SWITCH: 'switchHost',
    SEARCH_BATCH: 'onSearchBatch',
    THEME_CHANGED: 'onThemeChanged',
    WINDOW_SHOW: 'onShowMainWindow',
    PLUGIN_RUNTIME_STATE: 'onRuntimeStateChanged',
    PLUGIN_ENTER: 'onPluginEnter',
} as const satisfies Record<string, keyof CombinedApi>;

type IpcMap = {
    [K in keyof typeof IPC_API as (typeof IPC)[K]]: CombinedApi[(typeof IPC_API)[K]];
};

// ── IPC 工具函数 ─────────────────────────────────────────────────

export function invoke<C extends keyof IpcMap>(
    channel: C,
): (payload?: any) => Promise<InvokeRet<IpcMap[C]>> {
    return async (payload?: any) =>
        ipcRenderer.invoke(channel, payload) as Promise<InvokeRet<IpcMap[C]>>;
}

export function on<C extends keyof IpcMap>(
    channel: C,
): (cb: (data: OnData<IpcMap[C]>) => void) => () => void {
    return (cb: (data: OnData<IpcMap[C]>) => void) => {
        const handler = (_: any, data: OnData<IpcMap[C]>) => cb(data);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    };
}

export function send<C extends string>(channel: C) {
    return (payload?: any) => ipcRenderer.send(channel, payload);
}
