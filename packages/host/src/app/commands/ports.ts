import type { PluginId } from '../../shared/ids';

export interface CommandIndexService {
  indexPluginManifest(pluginPackage: unknown): Promise<void>;
  removePluginIndex(pluginId: PluginId): Promise<void>;
  rebuildPluginProjection(pluginId: PluginId): Promise<void>;
}

export interface DynamicFeatureService {
  setFeature(senderWebContentsId: number, feature: { code: string; [key: string]: unknown }): Promise<{ ok: boolean; error?: string }>;
  getFeatures(pluginId: PluginId, codes?: string[]): unknown[];
  removeFeature(pluginId: PluginId, code: string): { ok: boolean };
}
