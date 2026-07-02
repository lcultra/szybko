import { ipcRenderer } from 'electron';

export const C = {
    SEARCH: 'search',
    SEARCH_BATCH: 'search-batch',
    SEARCH_CANCEL: 'search-cancel',
    EXECUTE: 'execute',
    RUNTIME_STATE_CHANGED: 'runtime:state-changed',
    HOST_SWITCH: 'host:switch',
    WINDOW_RESIZE: 'window:resize',
    WINDOW_HIDE: 'window:hide',
    SHOW_MAIN_WINDOW: 'show-main-window',
    THEME_CHANGED: 'theme:changed',
} as const;

export function createPluginApi() {
    return {
        execute: (action: any) => ipcRenderer.invoke(C.EXECUTE, { action }),
        switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') =>
            ipcRenderer.invoke(C.HOST_SWITCH, { pluginId, targetHost }),
        onRuntimeStateChanged: (cb: (state: any) => void) => {
            const handler = (_: any, state: any) => cb(state);
            ipcRenderer.on(C.RUNTIME_STATE_CHANGED, handler);
            return () => ipcRenderer.removeListener(C.RUNTIME_STATE_CHANGED, handler);
        },
    };
}

export function createInternalApi() {
    return {
        search: (req: any) => ipcRenderer.invoke(C.SEARCH, req),
        searchCancel: (queryId: string) => ipcRenderer.invoke(C.SEARCH_CANCEL, { queryId }),
        resizeWindow: (height: number) => ipcRenderer.invoke(C.WINDOW_RESIZE, { height }),
        hideWindow: () => ipcRenderer.invoke(C.WINDOW_HIDE, {}),
        onSearchBatch: (cb: (batch: any) => void) => {
            const handler = (_: any, batch: any) => cb(batch);
            ipcRenderer.on(C.SEARCH_BATCH, handler);
            return () => ipcRenderer.removeListener(C.SEARCH_BATCH, handler);
        },
        onShowMainWindow: (cb: () => void) => {
            const handler = () => cb();
            ipcRenderer.on(C.SHOW_MAIN_WINDOW, handler);
            return () => ipcRenderer.removeListener(C.SHOW_MAIN_WINDOW, handler);
        },
        onThemeChanged: (cb: (theme: any) => void) => {
            const handler = (_: any, theme: any) => cb(theme);
            ipcRenderer.on(C.THEME_CHANGED, handler);
            return () => ipcRenderer.removeListener(C.THEME_CHANGED, handler);
        },
    };
}
