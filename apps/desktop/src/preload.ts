import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@szybko/shared'

contextBridge.exposeInMainWorld('utools', {
    // Search
    search: (req: { queryId: string; query: string; timestamp: number }) =>
        ipcRenderer.invoke(IPC.SEARCH, req),
    searchCancel: (queryId: string) =>
        ipcRenderer.invoke(IPC.SEARCH_CANCEL, { queryId }),

    // Execute action
    execute: (action: any) =>
        ipcRenderer.invoke(IPC.EXECUTE, { action }),

    // Window
    resizeWindow: (height: number) =>
        ipcRenderer.invoke(IPC.WINDOW_RESIZE, { height }),
    hideWindow: () =>
        ipcRenderer.invoke(IPC.WINDOW_HIDE, {}),

    // Plugin host switching
    switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') =>
        ipcRenderer.invoke(IPC.HOST_SWITCH, { pluginId, targetHost }),

    // Events
    onSearchBatch: (cb: (batch: any) => void) => {
        const handler = (_: any, batch: any) => cb(batch)
        ipcRenderer.on(IPC.SEARCH_BATCH, handler)
        return () => ipcRenderer.removeListener(IPC.SEARCH_BATCH, handler)
    },
    onRuntimeStateChanged: (cb: (state: any) => void) => {
        const handler = (_: any, state: any) => cb(state)
        ipcRenderer.on(IPC.RUNTIME_STATE_CHANGED, handler)
        return () => ipcRenderer.removeListener(IPC.RUNTIME_STATE_CHANGED, handler)
    },
    onShowMainWindow: (cb: () => void) => {
        const handler = () => cb()
        ipcRenderer.on(IPC.SHOW_MAIN_WINDOW, handler)
        return () => ipcRenderer.removeListener(IPC.SHOW_MAIN_WINDOW, handler)
    },
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => {
        const handler = (_: any, theme: { isDark: boolean }) => cb(theme)
        ipcRenderer.on(IPC.THEME_CHANGED, handler)
        return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler)
    },
})
