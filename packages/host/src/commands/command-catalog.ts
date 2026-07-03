import type { PluginFeature, PluginManifest } from '@szybko/shared';
import type { PlatformDatabase, PlatformDrizzleDatabase } from '../persistence/sqlite/platform-database';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { CommandProjectionRepository } from '../persistence/sqlite/repositories/command-projection-repository';
import { FeatureOverrideRepository } from '../persistence/sqlite/repositories/feature-override-repository';
import { ManifestFeatureRepository } from '../persistence/sqlite/repositories/manifest-feature-repository';
import { PluginInstallationRepository } from '../persistence/sqlite/repositories/plugin-installation-repository';
import { commandAlias } from '../persistence/sqlite/schema';
import { buildCommandProjection, buildSearchEntries } from './command-projection-builder';
import { stableJson } from './feature-normalizer';

const INDEX_VERSION = 2;

function hashManifest(manifest: PluginManifest): string {
    return createHash('sha256').update(stableJson(manifest.features)).digest('hex');
}

function dedupSearchEntries(entries: import('./command-projection-builder').CommandTriggerSearchProjection[]): import('./command-projection-builder').CommandTriggerSearchProjection[] {
    const seen = new Map<string, import('./command-projection-builder').CommandTriggerSearchProjection>();
    for (const e of entries) {
        const key = `${e.pluginId}:${e.featureCode}:${e.cmdKey}:${e.searchText}`;
        const existing = seen.get(key);
        if (!existing) { seen.set(key, e); continue; }
        const sourcePrio = (s: string) => s === 'cmd' ? 1 : 2;
        if (sourcePrio(e.source) < sourcePrio(existing.source)) { seen.set(key, e); continue; }
        if (sourcePrio(e.source) > sourcePrio(existing.source)) continue;
        if (e.matchLevel > existing.matchLevel) { seen.set(key, e); continue; }
        if (e.matchLevel < existing.matchLevel) continue;
        const curId = e.aliasId ?? 0;
        const exId = existing.aliasId ?? 0;
        if (curId < exId) { seen.set(key, e); }
    }
    return [...seen.values()];
}

function createRepositories(db: PlatformDrizzleDatabase) {
    return {
        pluginInstallations: new PluginInstallationRepository(db),
        manifestFeatures: new ManifestFeatureRepository(db),
        featureOverrides: new FeatureOverrideRepository(db),
        commandProjections: new CommandProjectionRepository(db),
    };
}

export class CommandCatalog {
    constructor(private platformDb: PlatformDatabase) {}

    static createForDatabase(platformDb: PlatformDatabase): CommandCatalog {
        return new CommandCatalog(platformDb);
    }

    indexPlugin(pluginId: string, manifest: PluginManifest, pluginPath: string): void {
        const now = Date.now();
        const manifestHash = hashManifest(manifest);

        this.platformDb.transaction((tx) => {
            const repos = createRepositories(tx);
            repos.pluginInstallations.upsertBuiltIn({
                pluginId,
                installPath: pluginPath,
                manifestHash,
                now,
            });
            repos.manifestFeatures.replaceForPlugin(pluginId, manifestHash, manifest.features, now);

            const projection = buildCommandProjection({
                pluginId,
                manifestHash,
                indexVersion: INDEX_VERSION,
                now,
                manifestFeatures: manifest.features.map((feature, featureOrder) => ({ code: feature.code, featureOrder, feature })),
                overrides: repos.featureOverrides.listForProjection(pluginId),
            });

            // Read active aliases and expand into search entries
            const activeAliases = tx.select()
                .from(commandAlias)
                .where(and(
                    eq(commandAlias.pluginId, pluginId),
                    eq(commandAlias.state, 'active'),
                ))
                .all();

            for (const alias of activeAliases) {
                // Only project alias if target trigger exists and type='text'
                const targetTrigger = projection.commandTriggers.find(
                    ct => ct.cmdKey === alias.targetCmdKey && ct.type === 'text',
                );
                if (!targetTrigger) continue;

                const searchEntries = buildSearchEntries(
                    pluginId, alias.featureCode, alias.targetCmdKey,
                    alias.aliasNormalized, 'alias', alias.id,
                );
                projection.commandTriggerSearch.push(...searchEntries);
            }

            // Deduplicate search entries
            projection.commandTriggerSearch = dedupSearchEntries(projection.commandTriggerSearch);

            repos.commandProjections.replaceForPlugin(pluginId, projection);
        });
    }

    setFeature(pluginId: string, feature: PluginFeature): { ok: boolean; error?: string } {
        try {
            this.platformDb.transaction((tx) => {
                const repos = createRepositories(tx);
                repos.featureOverrides.setActive(pluginId, feature, Date.now());
                this.rebuildPluginWithRepositories(pluginId, repos, Date.now(), tx);
            });
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: (e as Error).message };
        }
    }

    getDynamicFeatures(pluginId: string, codes?: string[]): PluginFeature[] {
        return createRepositories(this.platformDb.drizzle()).featureOverrides.listActiveFeatures(pluginId, codes);
    }

    removeFeature(pluginId: string, code: string): { ok: boolean; error?: string } {
        try {
            this.platformDb.transaction((tx) => {
                const repos = createRepositories(tx);
                repos.featureOverrides.setRemoved(pluginId, code, Date.now());
                this.rebuildPluginWithRepositories(pluginId, repos, Date.now(), tx);
            });
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: (e as Error).message };
        }
    }

    private rebuildPluginWithRepositories(
        pluginId: string,
        repos: ReturnType<typeof createRepositories>,
        now: number,
        tx: PlatformDrizzleDatabase,
    ): void {
        const installation = repos.pluginInstallations.get(pluginId);
        if (!installation)
            throw new Error(`Plugin ${pluginId} is not installed`);

        const manifestFeatures = repos.manifestFeatures.listForProjection(pluginId);
        const projection = buildCommandProjection({
            pluginId,
            manifestHash: installation.manifestHash,
            indexVersion: INDEX_VERSION,
            now,
            manifestFeatures,
            overrides: repos.featureOverrides.listForProjection(pluginId),
        });

        // Read active aliases and expand into search entries
        const activeAliases = tx.select()
            .from(commandAlias)
            .where(and(
                eq(commandAlias.pluginId, pluginId),
                eq(commandAlias.state, 'active'),
            ))
            .all();

        for (const alias of activeAliases) {
            // Only project alias if target trigger exists and type='text'
            const targetTrigger = projection.commandTriggers.find(
                ct => ct.cmdKey === alias.targetCmdKey && ct.type === 'text',
            );
            if (!targetTrigger) continue;

            const searchEntries = buildSearchEntries(
                pluginId, alias.featureCode, alias.targetCmdKey,
                alias.aliasNormalized, 'alias', alias.id,
            );
            projection.commandTriggerSearch.push(...searchEntries);
        }

        // Deduplicate search entries
        projection.commandTriggerSearch = dedupSearchEntries(projection.commandTriggerSearch);

        repos.commandProjections.replaceForPlugin(pluginId, projection);
    }
}
