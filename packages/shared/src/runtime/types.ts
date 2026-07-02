import type { PluginManifest } from '../plugin/types.js';

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
