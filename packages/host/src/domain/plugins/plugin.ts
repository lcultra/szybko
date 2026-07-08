export type PluginSourceKind = 'built-in' | 'user-installed' | 'local-dev';
export type PluginAvailability = 'available' | 'missing' | 'invalid';

export interface PluginPackage {
  id: string;
  manifest: unknown;
  path: string;
  source: PluginSourceKind;
  availability: PluginAvailability;
}
