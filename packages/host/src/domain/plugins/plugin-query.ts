/** Plugin info — read side only, no lifecycle */
export interface PluginInfo {
    id: string;
    manifest: import('@szybko/shared').PluginManifest;
    path: string;
}

/** Plugin 查询端口 — 定义 domain 层需要的插件读取契约 */
export interface PluginQuery {
    get: (id: string) => PluginInfo | undefined;
    getAll: () => PluginInfo[];
    getEnabled: () => PluginInfo[];
}
