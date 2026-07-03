// ── 旧类型（保留至 Phase 2） ──
/** @deprecated Will be removed in Phase 2. */
export interface Host {
    id: string;
    type: 'launcher' | 'floating';
    attach: (runtime: PluginRuntime) => void;
    detach: (runtime: PluginRuntime) => void;
}

/** @deprecated Will be removed in Phase 2. */
export interface PluginRuntime {
    id: string;
    pluginId: string;
    instanceId: string;
    host: Host | null;
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
