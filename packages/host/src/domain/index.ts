export type { NormalizedFeature } from './commands/command-feature';
export { normalizeFeature, stableJson } from './commands/command-feature';
export type { NormalizedTrigger, CommandTrigger, MatchType } from './commands/command-trigger';
export { normalizeTrigger } from './commands/command-trigger';
export type { CommandProjection, CommandTriggerSearchProjection } from './commands/command-projection';
export { hashManifest, computeOverrideFingerprint, dedupSearchEntries, generatePinyinKeys } from './commands/command-normalization';
export type { RankedEntry } from './commands/command-ranking';
export { rankEntries } from './commands/command-ranking';

export type { PluginPackage, PluginSourceKind, PluginAvailability } from './plugins/plugin';
export type { PluginInstallation } from './plugins/plugin-installation';
export type { PluginManifest } from './plugins/plugin-manifest';
