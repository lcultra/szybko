import type { PluginFeature, PluginManifest, SearchResult } from '@szybko/shared';
import { createHash } from 'node:crypto';
import { buildCommandProjection } from './command-projection-builder';
import { normalizeTextKey, stableJson } from './feature-normalizer';
import type { PlatformDatabase, PlatformDrizzleDatabase } from '../persistence/sqlite/platform-database';
import { CommandProjectionRepository } from '../persistence/sqlite/repositories/command-projection-repository';
import { FeatureOverrideRepository } from '../persistence/sqlite/repositories/feature-override-repository';
import { ManifestFeatureRepository } from '../persistence/sqlite/repositories/manifest-feature-repository';
import { PluginInstallationRepository } from '../persistence/sqlite/repositories/plugin-installation-repository';

const INDEX_VERSION = 1;

function hashManifest(manifest: PluginManifest): string {
    return createHash('sha256').update(stableJson(manifest.features)).digest('hex');
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

            repos.commandProjections.replaceForPlugin(pluginId, projection);
        });
    }

    match(query: string): SearchResult[] {
        const normalized = normalizeTextKey(query);
        if (!normalized)
            return [];

        const rows = createRepositories(this.platformDb.drizzle()).commandProjections.matchTextCommand(normalized);

        return rows
            .filter(row => row.type === 'text')
            .map(row => ({
                id: `plugin-activate-${row.pluginId}-${row.featureCode}-${row.cmdKey}`,
                title: row.label || row.featureCode,
                subtitle: `打开 ${row.pluginId}`,
                icon: '🧩',
                group: '插件',
                score: row.scoreBase,
                action: { type: 'plugin.open', payload: { pluginId: row.pluginId, featureCode: row.featureCode } },
            }));
    }

    setFeature(pluginId: string, feature: PluginFeature): { ok: boolean; error?: string } {
        try {
            this.platformDb.transaction((tx) => {
                const repos = createRepositories(tx);
                repos.featureOverrides.setActive(pluginId, feature, Date.now());
                this.rebuildPluginWithRepositories(pluginId, repos, Date.now());
            });
            return { ok: true };
        } catch (e) {
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
                this.rebuildPluginWithRepositories(pluginId, repos, Date.now());
            });
            return { ok: true };
        } catch (e) {
            return { ok: false, error: (e as Error).message };
        }
    }

    private rebuildPluginWithRepositories(
        pluginId: string,
        repos: ReturnType<typeof createRepositories>,
        now: number,
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

        repos.commandProjections.replaceForPlugin(pluginId, projection);
    }
}
