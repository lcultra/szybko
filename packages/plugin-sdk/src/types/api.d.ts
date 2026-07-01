export interface UtoolsAPI {
    onPluginEnter: (cb: (action: PluginEnterAction) => void) => void
    onPluginOut: (cb: (isKill: boolean) => void) => void
    onPluginDetach: (cb: () => void) => void
    onPluginReady: (cb: () => void) => void
    onSearch: (cb: (ctx: SearchContext) => SearchResult[]) => void

    setExpendHeight: (height: number) => void
    hideMainWindow: () => void
    showMainWindow: () => void
    outPlugin: () => void
    setSubInput: (onChange: (text: string) => void, placeholder?: string, isFocus?: boolean) => void
    removeSubInput: () => void

    shellOpenPath: (fullPath: string) => void
    shellShowItemInFolder: (fullPath: string) => void
    shellOpenExternal: (url: string) => void
    shellTrashItem: (fullPath: string) => void
    showNotification: (body: string, clickFeatureCode?: string) => void
    getPath: (name: string) => string
    getFileIcon: (filePath: string) => string
    isMacOS: () => boolean
    isWindows: () => boolean
    isLinux: () => boolean

    copyText: (text: string) => boolean
    copyFile: (filePath: string | string[]) => boolean
    copyImage: (image: string | Uint8Array) => boolean
    getCopyedFiles: () => CopiedFile[]
    hideMainWindowPasteText: (text: string) => void
    hideMainWindowTypeString: (text: string) => void

    db: DbAPI
    dbStorage: DbStorageAPI
}

export interface PluginEnterAction {
    code: string
    type: string
    payload: any
    from: string
}

export interface SearchContext {
    queryId: string
    keyword: string
    query: string
    fullQuery: string
}

export interface SearchResult {
    id: string
    title: string
    subtitle?: string
    icon?: string
    score: number
    action: any
}

export interface CopiedFile {
    path: string
    isFile: boolean
    name: string
}

export interface DbAPI {
    put: (doc: any) => any
    get: (id: string) => any
    remove: (doc: any) => any
    bulkDocs: (docs: any[]) => any[]
    allDocs: () => any[]
}

export interface DbStorageAPI {
    setItem: (key: string, value: any) => void
    getItem: (key: string) => any
    removeItem: (key: string) => void
}
