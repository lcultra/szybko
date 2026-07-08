export interface HostPlatformConfig {
    userDataPath: string;
    builtInPluginsPath: string;
    preloadPath: string;
    pluginPreloadPath: string;
    isPackaged: boolean;
    rendererUrl?: string;
}
