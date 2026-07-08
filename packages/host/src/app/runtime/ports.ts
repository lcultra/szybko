import type { PluginId, RuntimeId } from '../../shared/ids';

export interface RuntimeApplicationService {
    activatePlugin: (pluginId: PluginId, featureCode?: string, enterPayload?: unknown) => Promise<void>;
    moveToHost: (runtimeId: RuntimeId, targetHost: string) => Promise<void>;
    hideRuntime: (runtimeId: RuntimeId) => Promise<void>;
    destroyRuntime: (runtimeId: RuntimeId) => Promise<void>;
    pinRuntime: (runtimeId: RuntimeId, pin: boolean) => Promise<void>;
    showPluginMenu: (runtimeId: RuntimeId, variant?: string) => Promise<void>;
    resolvePluginIdForWebContents: (webContentsId: number) => Promise<PluginId | null>;
}
