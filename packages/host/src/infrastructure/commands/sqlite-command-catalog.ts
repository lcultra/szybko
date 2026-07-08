import type { PluginFeature, PluginManifest } from '@szybko/shared';
import type { CommandProjection, CommandTriggerSearchProjection } from '../../domain/commands/command-projection-builder';
import type { PlatformDatabase, PlatformDrizzleDatabase } from '../sqlite/platform-database';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { buildCommandProjection, buildSearchEntries } from '../../domain/commands/command-projection-builder';
import { stableJson } from '../../domain/commands/feature-normalizer';
import { CommandProjectionRepository } from '../sqlite/repositories/command-projection-repository';
import { FeatureOverrideRepository } from '../sqlite/repositories/feature-override-repository';
import { ManifestFeatureRepository } from '../sqlite/repositories/manifest-feature-repository';
import { PluginInstallationRepository } from '../sqlite/repositories/plugin-installation-repository';
import { commandAlias } from '../sqlite/schema';

const INDEX_VERSION = 2;

const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.svg'];

const sourcePrio = (s: string) => s === 'cmd' ? 1 : 2;

function hashManifest(manifest: PluginManifest): string {
    return createHash('sha256').update(stableJson(manifest.features)).digest('hex');
}

function dedupSearchEntries(entries: CommandTriggerSearchProjection[]): CommandTriggerSearchProjection[] {
    const seen = new Map<string, CommandTriggerSearchProjection>();
    for (const e of entries) {
        const key = `${e.pluginId}:${e.featureCode}:${e.cmdKey}:${e.searchText}`;
        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, e);
            continue;
        }
        if (sourcePrio(e.source) < sourcePrio(existing.source)) {
            seen.set(key, e);
            continue;
        }
        if (sourcePrio(e.source) > sourcePrio(existing.source))
            continue;
        if (e.matchLevel > existing.matchLevel) {
            seen.set(key, e);
            continue;
        }
        if (e.matchLevel < existing.matchLevel)
            continue;
        const curId = e.aliasId ?? 0;
        const exId = existing.aliasId ?? 0;
        if (curId < exId) {
            seen.set(key, e);
        }
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

    private pluginCatalog: import('../../infrastructure/filesystem/plugin-catalog').PluginCatalog | null = null;

    setPluginCatalog(catalog: import('../../infrastructure/filesystem/plugin-catalog').PluginCatalog): void {
        this.pluginCatalog = catalog;
    }

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

            // Expand aliases into search entries
            this.expandAliasesInProjection(tx, pluginId, projection);

            repos.commandProjections.replaceForPlugin(pluginId, projection);
        });
    }

    private validateFeatureIcon(pluginId: string, iconPath: string): string | null {
        const plugin = this.pluginCatalog?.get(pluginId);
        if (!plugin) {
            return 'Plugin not found or catalog not initialized';
        }

        const ext = extname(iconPath).toLowerCase();
        const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
        if (!ALLOWED_IMAGE_EXTS.includes(normalizedExt)) {
            return `icon 必须是 .png / .jpg / .jpeg / .svg 格式，实际: ${ext}`;
        }

        const resolved = resolve(plugin.path, iconPath);
        const rel = relative(plugin.path, resolved);
        if (rel.startsWith('..') || rel === '') {
            return 'icon 路径逃逸了插件目录';
        }

        if (!existsSync(resolved)) {
            return `icon 文件不存在: ${resolved}`;
        }

        return null;
    }

    setFeature(pluginId: string, feature: PluginFeature): { ok: boolean; error?: string } {
        if (feature.icon) {
            const validationError = this.validateFeatureIcon(pluginId, feature.icon);
            if (validationError) {
                return { ok: false, error: validationError };
            }
        }

        try {
            this.platformDb.transaction((tx) => {
                const repos = createRepositories(tx);
                repos.featureOverrides.setActive(pluginId, feature, Date.now());
                this.rebuildPluginProjectionInternal(pluginId, repos, Date.now(), tx);
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
                this.rebuildPluginProjectionInternal(pluginId, repos, Date.now(), tx);
            });
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: (e as Error).message };
        }
    }

    removePluginIndex(pluginId: string): void {
        const repos = createRepositories(this.platformDb.drizzle());
        repos.commandProjections.removeByPluginId(pluginId);
    }

    private expandAliasesInProjection(
        tx: PlatformDrizzleDatabase,
        pluginId: string,
        projection: CommandProjection,
    ): void {
        const activeAliases = tx.select()
            .from(commandAlias)
            .where(and(
                eq(commandAlias.pluginId, pluginId),
                eq(commandAlias.state, 'active'),
            ))
            .all();

        for (const alias of activeAliases) {
            const targetTrigger = projection.commandTriggers.find(
                ct => ct.cmdKey === alias.targetCmdKey && ct.type === 'text',
            );
            if (!targetTrigger)
                continue;

            const searchEntries = buildSearchEntries(
                pluginId,
                alias.featureCode,
                alias.targetCmdKey,
                alias.aliasNormalized,
                'alias',
                alias.id,
            );
            projection.commandTriggerSearch.push(...searchEntries);
        }
        projection.commandTriggerSearch = dedupSearchEntries(projection.commandTriggerSearch);
    }

    private rebuildPluginProjectionInternal(
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

        // Expand aliases into search entries
        this.expandAliasesInProjection(tx, pluginId, projection);

        repos.commandProjections.replaceForPlugin(pluginId, projection);
    }

    /** Public entry point for rebuilding a plugin's command projection from current state. */
    rebuildPluginWithRepositories(pluginId?: string): void {
        if (pluginId) {
            this.platformDb.transaction((tx) => {
                const repos = createRepositories(tx);
                this.rebuildPluginProjectionInternal(pluginId, repos, Date.now(), tx);
            });
        }
        // If no pluginId, could rebuild all enabled plugins in the future.
    }
}
