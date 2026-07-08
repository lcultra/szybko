import type { PluginSourceKind } from './plugin';

export interface PluginInstallation {
    pluginId: string;
    source: PluginSourceKind;
    enabled: boolean;
    installPath: string;
    version: string;
    manifestHash: string | null;
    createdAt: number;
    updatedAt: number;
}
