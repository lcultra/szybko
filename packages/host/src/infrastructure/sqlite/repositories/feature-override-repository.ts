import type { PluginFeature } from '@szybko/shared';
import type { FeatureOverrideInput } from '../../../domain/commands/command-projection-builder';
import type { PlatformDrizzleDatabase } from '../platform-database';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { normalizeFeature, normalizeFeatureCode } from '../../../domain/commands/feature-normalizer';
import { featureOverride } from '../schema';

export class FeatureOverrideRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    setActive(pluginId: string, feature: PluginFeature, now: number): void {
        const normalized = normalizeFeature(feature);
        this.db.insert(featureOverride)
            .values({
                pluginId,
                code: normalized.code,
                state: 'active',
                featureJson: normalized.featureJson,
                featureHash: normalized.featureHash,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: [featureOverride.pluginId, featureOverride.code],
                set: {
                    state: 'active',
                    featureJson: normalized.featureJson,
                    featureHash: normalized.featureHash,
                    updatedAt: now,
                },
            })
            .run();
    }

    setRemoved(pluginId: string, code: string, now: number): void {
        const normalizedCode = normalizeFeatureCode(code);
        this.db.insert(featureOverride)
            .values({
                pluginId,
                code: normalizedCode,
                state: 'removed',
                featureJson: null,
                featureHash: null,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: [featureOverride.pluginId, featureOverride.code],
                set: {
                    state: 'removed',
                    featureJson: null,
                    featureHash: null,
                    updatedAt: now,
                },
            })
            .run();
    }

    listForProjection(pluginId: string): FeatureOverrideInput[] {
        const rows = this.db.select()
            .from(featureOverride)
            .where(eq(featureOverride.pluginId, pluginId))
            .orderBy(asc(featureOverride.code))
            .all();

        return rows.map((row) => {
            if (row.state === 'active') {
                const feature = JSON.parse(row.featureJson!) as PluginFeature;
                return { code: row.code, state: 'active', feature } as FeatureOverrideInput;
            }
            return { code: row.code, state: 'removed' } as FeatureOverrideInput;
        });
    }

    listActiveFeatures(pluginId: string, codes?: string[]): PluginFeature[] {
        const conditions = [
            eq(featureOverride.pluginId, pluginId),
            eq(featureOverride.state, 'active'),
        ];
        if (codes && codes.length > 0) {
            conditions.push(inArray(featureOverride.code, codes.map(normalizeFeatureCode)));
        }

        const rows = this.db.select()
            .from(featureOverride)
            .where(and(...conditions))
            .all();

        return rows.map(row => JSON.parse(row.featureJson!) as PluginFeature);
    }
}
