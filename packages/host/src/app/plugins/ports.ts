import type { PluginId } from '../../shared/ids';

export interface PluginLifecycleService {
    registerUserPlugin: (path: string) => Promise<void>;
    enablePlugin: (pluginId: PluginId) => Promise<void>;
    disablePlugin: (pluginId: PluginId) => Promise<void>;
    uninstallUserPlugin: (pluginId: PluginId) => Promise<void>;
    refreshPlugin: (pluginId: PluginId) => Promise<void>;
}

export interface PluginQueryService {
    listPlugins: () => Promise<unknown[]>;
    getPlugin: (pluginId: PluginId) => Promise<unknown>;
}

export interface PluginSourceSyncService {
    syncBuiltIn: () => Promise<unknown>;
    syncDev: () => Promise<unknown>;
    syncUserInstalled: () => Promise<unknown>;
}
