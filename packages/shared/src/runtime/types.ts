// ── 可序列化类型（无 Electron 依赖） ──
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

export interface RuntimeSlot {
    runtimeId: string | null;
    pluginId: string | null;
    featureExplain: string;
    cmdLabel: string;
    loadState: LoadState;
    mountState: MountState;
}
