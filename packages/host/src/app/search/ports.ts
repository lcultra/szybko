export interface SearchApplicationService {
    query: (request: unknown) => Promise<unknown>;
    cancel: (queryId: string) => Promise<void>;
    executeItem: (sessionId: string, queryId: string, itemId: string) => Promise<unknown>;
    refreshLastQuery: () => Promise<void>;
}

export interface LauncherItemService {
    pinItem: (itemId: string) => Promise<void>;
    unpinItem: (itemId: string) => Promise<void>;
    reorderItem: (itemId: string, toIndex: number) => Promise<void>;
    recordUsage: (itemId: string) => Promise<void>;
    removeRecentItem: (itemId: string) => Promise<void>;
    getContextMenu: (itemId: string, source: string) => Promise<unknown[]>;
    isPinned: (itemId: string) => boolean;
    cleanupByPlugin: (pluginId: string) => Promise<void>;
}
