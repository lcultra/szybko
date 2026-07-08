export type { NormalizedFeature } from './commands/command-feature';

export { normalizeFeature, stableJson } from './commands/command-feature';
export { computeOverrideFingerprint, dedupSearchEntries, generatePinyinKeys, hashManifest } from './commands/command-normalization';
export type { CommandProjection, CommandTriggerSearchProjection } from './commands/command-projection';
export type { RankedEntry } from './commands/command-ranking';
export { rankEntries } from './commands/command-ranking';
export type { CommandTrigger, MatchType, NormalizedTrigger } from './commands/command-trigger';
export { normalizeTrigger } from './commands/command-trigger';
export type { PluginAvailability, PluginPackage, PluginSourceKind } from './plugins/plugin';

export type { PluginInstallation } from './plugins/plugin-installation';
export type { PluginManifest } from './plugins/plugin-manifest';
export type { LoadState, MountState, RuntimeInfo, RuntimeSlot } from './runtime/runtime';
