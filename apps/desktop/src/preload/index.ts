import { contextBridge, ipcRenderer } from 'electron'

// Inlined IPC constants — preload compiles to CJS, @szybko/shared is ESM.
// Keeping these here avoids cross-format import issues in Electron's context.
const IPC_CHANNELS = {
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
} as const

contextBridge.exposeInMainWorld('utools', {
    search: (req: { queryId: string; query: string; timestamp: number }) =>
        ipcRenderer.invoke(IPC_CHANNELS.SEARCH, req),
    searchCancel: (queryId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.SEARCH_CANCEL, { queryId }),

    execute: (action: any) =>
        ipcRenderer.invoke(IPC_CHANNELS.EXECUTE, { action }),

    resizeWindow: (height: number) =>
        ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE, { height }),
    hideWindow: () =>
        ipcRenderer.invoke(IPC_CHANNELS.WINDOW_HIDE, {}),

    switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') =>
        ipcRenderer.invoke(IPC_CHANNELS.HOST_SWITCH, { pluginId, targetHost }),

    onSearchBatch: (cb: (batch: any) => void) => {
        const handler = (_: any, batch: any) => cb(batch)
        ipcRenderer.on(IPC_CHANNELS.SEARCH_BATCH, handler)
        return () => ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_BATCH, handler)
    },
    onRuntimeStateChanged: (cb: (state: any) => void) => {
        const handler = (_: any, state: any) => cb(state)
        ipcRenderer.on(IPC_CHANNELS.RUNTIME_STATE_CHANGED, handler)
        return () => ipcRenderer.removeListener(IPC_CHANNELS.RUNTIME_STATE_CHANGED, handler)
    },
    onShowMainWindow: (cb: () => void) => {
        const handler = () => cb()
        ipcRenderer.on(IPC_CHANNELS.SHOW_MAIN_WINDOW, handler)
        return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_MAIN_WINDOW, handler)
    },
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => {
        const handler = (_: any, theme: { isDark: boolean }) => cb(theme)
        ipcRenderer.on(IPC_CHANNELS.THEME_CHANGED, handler)
        return () => ipcRenderer.removeListener(IPC_CHANNELS.THEME_CHANGED, handler)
    },
})
