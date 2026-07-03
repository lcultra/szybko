import type { PluginManifest } from '../plugin/types';

// ── 旧类型（保留，Phase 2 再移除） ──
export interface Host {
    id: string;
    type: 'launcher' | 'floating';
    attach: (runtime: PluginRuntime) => void;
    detach: (runtime: PluginRuntime) => void;
}

export interface PluginRuntime {
    id: string;
    pluginId: string;
    instanceId: string;
    host: Host | null;
    state: RuntimeState;
    cache: Map<string, any>;
}

export type RuntimeState = 'created' | 'activated' | 'attached' | 'detached' | 'suspended' | 'destroyed';

export interface PluginManager {
    scan: () => PluginManifest[];
    install: (path: string) => void;
    uninstall: (pluginId: string) => void;
    update: (pluginId: string) => void;
}

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
