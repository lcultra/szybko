import type { CommandProjection } from '../../../commands/command-projection-builder';
import type { PlatformDrizzleDatabase } from '../platform-database';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { commandProjectionMeta, commandTrigger, effectiveFeature, pluginInstallation } from '../schema';

export interface CommandSearchRow {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    triggerIndex: number;
    source: 'feature_cmd' | 'alias';
    type: 'text' | 'regex' | 'over' | 'img' | 'files' | 'window';
    label: string | null;
    normalizedKey: string | null;
    targetCmdKey: string | null;
    scoreBase: number;
    featureJson: string;
}

export class CommandProjectionRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    replaceForPlugin(pluginId: string, projection: CommandProjection): void {
        this.db.delete(effectiveFeature).where(eq(effectiveFeature.pluginId, pluginId)).run();
        this.db.delete(commandTrigger).where(eq(commandTrigger.pluginId, pluginId)).run();
        if (projection.effectiveFeatures.length > 0)
            this.db.insert(effectiveFeature).values(projection.effectiveFeatures).run();
        if (projection.commandTriggers.length > 0)
            this.db.insert(commandTrigger).values(projection.commandTriggers).run();
        this.db.insert(commandProjectionMeta)
            .values(projection.meta)
            .onConflictDoUpdate({
                target: commandProjectionMeta.pluginId,
                set: {
                    manifestHash: projection.meta.manifestHash,
                    overrideFingerprint: projection.meta.overrideFingerprint,
                    indexVersion: projection.meta.indexVersion,
                    rebuiltAt: projection.meta.rebuiltAt,
                },
            })
            .run();
    }

    listTriggersByType(types: CommandSearchRow['type'][]): CommandSearchRow[] {
        return this.db.select({
            pluginId: commandTrigger.pluginId,
            featureCode: commandTrigger.featureCode,
            cmdKey: commandTrigger.cmdKey,
            triggerIndex: commandTrigger.triggerIndex,
            source: commandTrigger.source,
            type: commandTrigger.type,
            label: commandTrigger.label,
            normalizedKey: commandTrigger.normalizedKey,
            targetCmdKey: commandTrigger.targetCmdKey,
            scoreBase: commandTrigger.scoreBase,
            featureJson: effectiveFeature.featureJson,
        })
            .from(commandTrigger)
            .innerJoin(effectiveFeature, and(
                eq(effectiveFeature.pluginId, commandTrigger.pluginId),
                eq(effectiveFeature.code, commandTrigger.featureCode),
            ))
            .innerJoin(pluginInstallation, eq(pluginInstallation.pluginId, commandTrigger.pluginId))
            .where(and(
                eq(pluginInstallation.enabled, 1),
                inArray(commandTrigger.type, types),
            ))
            .orderBy(
                desc(commandTrigger.scoreBase),
                asc(effectiveFeature.featureOrder),
                asc(commandTrigger.triggerIndex),
            )
            .all();
    }
}
