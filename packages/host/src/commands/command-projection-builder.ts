import type { PluginFeature } from '@szybko/shared';
import { computePinyin, hashStable, normalizeFeature, normalizeTextKey, stableJson } from './feature-normalizer';

export interface ManifestFeatureInput {
    code: string;
    featureOrder: number;
    feature: PluginFeature;
}

export type FeatureOverrideInput
    = | { code: string; state: 'active'; feature: PluginFeature }
        | { code: string; state: 'removed' };

export interface BuildProjectionInput {
    pluginId: string;
    manifestHash: string;
    indexVersion: number;
    now: number;
    manifestFeatures: ManifestFeatureInput[];
    overrides: FeatureOverrideInput[];
}

export interface EffectiveFeatureProjection {
    pluginId: string;
    code: string;
    source: 'manifest' | 'dynamic';
    featureOrder: number;
    featureJson: string;
    featureHash: string;
    rebuiltAt: number;
}

export interface CommandTriggerProjection {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    triggerIndex: number;
    type: 'text' | 'regex' | 'over' | 'img' | 'files' | 'window';
    label: string | null;
    matcherJson: string;
    scoreBase: number;
    rebuiltAt: number;
}

export interface CommandTriggerSearchProjection {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    searchText: string;
    source: 'cmd' | 'alias';
    matchLevel: 1 | 2 | 3;
    aliasId: number | null;
}

export interface CommandProjection {
    effectiveFeatures: EffectiveFeatureProjection[];
    commandTriggers: CommandTriggerProjection[];
    commandTriggerSearch: CommandTriggerSearchProjection[];
    meta: {
        pluginId: string;
        manifestHash: string;
        overrideFingerprint: string;
        indexVersion: number;
        rebuiltAt: number;
    };
}

export function buildSearchEntries(
    pluginId: string,
    featureCode: string,
    cmdKey: string,
    text: string,
    source: 'cmd' | 'alias',
    aliasId: number | null,
): CommandTriggerSearchProjection[] {
    const normalized = normalizeTextKey(text);
    if (!normalized) return [];

    const entries: CommandTriggerSearchProjection[] = [];

    // Exact original text
    entries.push({ pluginId, featureCode, cmdKey, searchText: normalized, source, matchLevel: 3, aliasId });

    // Full pinyin + initials
    const pinyins = computePinyin(normalized);
    if (pinyins.full && pinyins.full !== normalized) {
        entries.push({ pluginId, featureCode, cmdKey, searchText: pinyins.full, source, matchLevel: 2, aliasId });
    }
    if (pinyins.initials && pinyins.initials !== normalized && pinyins.initials !== pinyins.full) {
        entries.push({ pluginId, featureCode, cmdKey, searchText: pinyins.initials, source, matchLevel: 1, aliasId });
    }

    return entries;
}

export function buildCommandProjection(input: BuildProjectionInput): CommandProjection {
    const map = new Map<string, { source: 'manifest' | 'dynamic'; featureOrder: number; feature: PluginFeature }>();

    for (const item of [...input.manifestFeatures].sort((a, b) => a.featureOrder - b.featureOrder)) {
        map.set(item.code, { source: 'manifest', featureOrder: item.featureOrder, feature: item.feature });
    }

    const manifestCount = input.manifestFeatures.length;
    const activeDynamic = input.overrides
        .filter((o): o is Extract<FeatureOverrideInput, { state: 'active' }> => o.state === 'active')
        .sort((a, b) => a.code.localeCompare(b.code));
    const dynamicOrder = new Map(activeDynamic.map((o, index) => [o.code, manifestCount + index]));

    for (const override of input.overrides) {
        if (override.state === 'removed') {
            map.delete(override.code);
        }
        else {
            map.set(override.code, {
                source: 'dynamic',
                featureOrder: map.get(override.code)?.featureOrder ?? dynamicOrder.get(override.code) ?? manifestCount,
                feature: override.feature,
            });
        }
    }

    const effectiveFeatures: EffectiveFeatureProjection[] = [];
    const commandTriggers: CommandTriggerProjection[] = [];
    const commandTriggerSearch: CommandTriggerSearchProjection[] = [];

    for (const [code, record] of [...map.entries()].sort((a, b) => a[1].featureOrder - b[1].featureOrder)) {
        const normalized = normalizeFeature(record.feature);
        effectiveFeatures.push({
            pluginId: input.pluginId,
            code,
            source: record.source,
            featureOrder: record.featureOrder,
            featureJson: normalized.featureJson,
            featureHash: normalized.featureHash,
            rebuiltAt: input.now,
        });

        for (const command of normalized.commands) {
            commandTriggers.push({
                pluginId: input.pluginId,
                featureCode: code,
                cmdKey: command.cmdKey,
                triggerIndex: command.triggerIndex,
                type: command.type,
                label: command.label ?? null,
                matcherJson: command.matcherJson,
                scoreBase: 90,
                rebuiltAt: input.now,
            });

            if (command.type === 'text' && command.normalizedKey) {
                const searchEntries = buildSearchEntries(
                    input.pluginId,
                    code,
                    command.cmdKey,
                    command.normalizedKey,
                    'cmd',
                    null,
                );
                commandTriggerSearch.push(...searchEntries);
            }
        }
    }

    const overrideFingerprint = hashStable(stableJson(input.overrides));

    return {
        effectiveFeatures,
        commandTriggers,
        commandTriggerSearch,
        meta: {
            pluginId: input.pluginId,
            manifestHash: input.manifestHash,
            overrideFingerprint,
            indexVersion: input.indexVersion,
            rebuiltAt: input.now,
        },
    };
}
