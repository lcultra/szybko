interface Utools {
    search: (req: { queryId: string; query: string; timestamp: number }) => Promise<{ ok: boolean }>
    searchCancel: (queryId: string) => Promise<{ ok: boolean }>
    execute: (action: any) => Promise<{ ok: boolean; result?: any; error?: string }>
    resizeWindow: (height: number) => Promise<{ ok: boolean }>
    hideWindow: () => Promise<{ ok: boolean }>
    switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') => Promise<{ ok: boolean; hostId: string }>
    onSearchBatch: (cb: (batch: any) => void) => () => void
    onRuntimeStateChanged: (cb: (state: any) => void) => () => void
    onShowMainWindow: (cb: () => void) => () => void
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => () => void
}

declare global {
    interface Window {
        utools?: Utools
    }
}

export {}
