// ── 旧类型（保留至 host 包切换到新 PluginRuntime） ──

/** @deprecated Will be removed when host package switches to new PluginRuntime. */
export interface PluginRuntime {
    id: string;
    pluginId: string;
    instanceId: string;
    /** @deprecated Use RuntimeHost from host package instead. */
    host: { id: string; type: 'launcher' | 'floating' } | null;
    state: RuntimeState;
    cache: Map<string, any>;
}

/** @deprecated Will be removed in Phase 2. */
export type RuntimeState = 'created' | 'activated' | 'attached' | 'detached' | 'suspended' | 'destroyed';

// ── 新类型（可序列化，无 Electron 依赖） ──
export type LoadState = 'loading' | 'loaded' | 'error';
export type MountState = 'attached' | 'detached';

export interface RuntimeInfo {
    id: string;
    pluginId: string;
    instanceId: string;
    loadState: LoadState;
    mountState: MountState;
    hostInfo: RuntimeHostInfo | null;
}

export interface RuntimeHostInfo {
    id: string;
    type: 'launcher' | 'floating';
}
