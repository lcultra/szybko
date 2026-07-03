import type { PluginFeature } from '@szybko/shared';
import type { ManifestFeatureInput } from '../../../commands/command-projection-builder';
import type { PlatformDrizzleDatabase } from '../platform-database';
import { eq } from 'drizzle-orm';
import { normalizeFeature } from '../../../commands/feature-normalizer';
import { manifestFeatureSnapshot } from '../schema';

export class ManifestFeatureRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    replaceForPlugin(pluginId: string, manifestHash: string, features: PluginFeature[], now: number): void {
        this.db.delete(manifestFeatureSnapshot)
            .where(eq(manifestFeatureSnapshot.pluginId, pluginId))
            .run();

        if (features.length === 0)
            return;

        const values = features.map((feature, index) => {
            const normalized = normalizeFeature(feature);
            return {
                pluginId,
                code: normalized.code,
                featureOrder: index,
                featureJson: normalized.featureJson,
                featureHash: normalized.featureHash,
                manifestHash,
                indexedAt: now,
            };
        });

        this.db.insert(manifestFeatureSnapshot).values(values).run();
    }

    listForProjection(pluginId: string): ManifestFeatureInput[] {
        const rows = this.db.select()
            .from(manifestFeatureSnapshot)
            .where(eq(manifestFeatureSnapshot.pluginId, pluginId))
            .orderBy(manifestFeatureSnapshot.featureOrder)
            .all();

        return rows.map(row => ({
            code: row.code,
            featureOrder: row.featureOrder,
            feature: JSON.parse(row.featureJson) as PluginFeature,
        }));
    }
}
