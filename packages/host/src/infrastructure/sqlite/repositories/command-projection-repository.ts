import type { CommandProjection } from '../../../commands/command-projection-builder';
import type { PlatformDrizzleDatabase } from '../platform-database';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { commandAlias, commandProjectionMeta, commandTrigger, commandTriggerSearch, effectiveFeature, pluginInstallation } from '../schema';

function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, char => `\\${char}`);
}

export interface TextSearchMatch {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    searchText: string;
    sourceText: string | null;
    featureOrder: number;
    triggerIndex: number;
    type: 'text';
    label: string | null;
    matcherJson: string;
    scoreBase: number;
    matchLevel: 1 | 2 | 3;
    source: 'cmd' | 'alias';
    aliasId: number | null;
}

export interface CommandSearchRow {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    triggerIndex: number;
    source: 'feature_cmd';
    type: 'text' | 'regex' | 'over' | 'img' | 'files' | 'window';
    label: string | null;
    scoreBase: number;
    matcherJson: string;
}

export class CommandProjectionRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    replaceForPlugin(pluginId: string, projection: CommandProjection): void {
        this.db.delete(effectiveFeature).where(eq(effectiveFeature.pluginId, pluginId)).run();
        this.db.delete(commandTrigger).where(eq(commandTrigger.pluginId, pluginId)).run();
        this.db.delete(commandTriggerSearch).where(eq(commandTriggerSearch.pluginId, pluginId)).run();

        if (projection.effectiveFeatures.length > 0)
            this.db.insert(effectiveFeature).values(projection.effectiveFeatures).run();
        if (projection.commandTriggers.length > 0)
            this.db.insert(commandTrigger).values(projection.commandTriggers).run();
        if (projection.commandTriggerSearch.length > 0)
            this.db.insert(commandTriggerSearch).values(projection.commandTriggerSearch).run();

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
            source: sql<'feature_cmd'>`'feature_cmd'`,
            type: commandTrigger.type,
            label: commandTrigger.label,
            scoreBase: commandTrigger.scoreBase,
            matcherJson: commandTrigger.matcherJson,
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

    getTrigger(pluginId: string, featureCode: string, cmdKey: string): CommandSearchRow | null {
        return this.db.select({
            pluginId: commandTrigger.pluginId,
            featureCode: commandTrigger.featureCode,
            cmdKey: commandTrigger.cmdKey,
            triggerIndex: commandTrigger.triggerIndex,
            source: sql<'feature_cmd'>`'feature_cmd'`,
            type: commandTrigger.type,
            label: commandTrigger.label,
            scoreBase: commandTrigger.scoreBase,
            matcherJson: commandTrigger.matcherJson,
        })
            .from(commandTrigger)
            .where(and(
                eq(commandTrigger.pluginId, pluginId),
                eq(commandTrigger.featureCode, featureCode),
                eq(commandTrigger.cmdKey, cmdKey),
            ))
            .limit(1)
            .get() ?? null;
    }

    removeByPluginId(pluginId: string): void {
        this.db.delete(effectiveFeature).where(eq(effectiveFeature.pluginId, pluginId)).run();
        this.db.delete(commandTrigger).where(eq(commandTrigger.pluginId, pluginId)).run();
        this.db.delete(commandTriggerSearch).where(eq(commandTriggerSearch.pluginId, pluginId)).run();
        this.db.delete(commandProjectionMeta).where(eq(commandProjectionMeta.pluginId, pluginId)).run();
    }

    searchByText(normalizedQuery: string): TextSearchMatch[] {
        const escapedQuery = escapeLikePattern(normalizedQuery);
        const containsPattern = `%${escapedQuery}%`;
        const prefixPattern = `${escapedQuery}%`;
        const matchPriority = sql<number>`case
            when ${commandTriggerSearch.searchText} = ${normalizedQuery} then 0
            when ${commandTriggerSearch.searchText} like ${prefixPattern} escape '\\' then 1
            else 2
        end`;

        return this.db.select({
            pluginId: commandTriggerSearch.pluginId,
            featureCode: commandTriggerSearch.featureCode,
            cmdKey: commandTriggerSearch.cmdKey,
            searchText: commandTriggerSearch.searchText,
            sourceText: sql<string | null>`case
                when ${commandTriggerSearch.source} = 'alias' then ${commandAlias.aliasNormalized}
                else ${commandTrigger.label}
            end`,
            featureOrder: effectiveFeature.featureOrder,
            triggerIndex: commandTrigger.triggerIndex,
            type: sql<'text'>`'text'`,
            label: commandTrigger.label,
            matcherJson: commandTrigger.matcherJson,
            scoreBase: commandTrigger.scoreBase,
            matchLevel: sql<1 | 2 | 3>`${commandTriggerSearch.matchLevel}`,
            source: commandTriggerSearch.source,
            aliasId: commandTriggerSearch.aliasId,
        })
            .from(commandTriggerSearch)
            .innerJoin(commandTrigger, and(
                eq(commandTrigger.pluginId, commandTriggerSearch.pluginId),
                eq(commandTrigger.featureCode, commandTriggerSearch.featureCode),
                eq(commandTrigger.cmdKey, commandTriggerSearch.cmdKey),
            ))
            .innerJoin(effectiveFeature, and(
                eq(effectiveFeature.pluginId, commandTriggerSearch.pluginId),
                eq(effectiveFeature.code, commandTriggerSearch.featureCode),
            ))
            .innerJoin(pluginInstallation, eq(pluginInstallation.pluginId, commandTriggerSearch.pluginId))
            .leftJoin(commandAlias, eq(commandAlias.id, commandTriggerSearch.aliasId))
            .where(and(
                eq(pluginInstallation.enabled, 1),
                sql`${commandTriggerSearch.searchText} like ${containsPattern} escape '\\'`,
            ))
            .orderBy(
                matchPriority,
                desc(commandTriggerSearch.matchLevel),
                desc(commandTrigger.scoreBase),
                asc(effectiveFeature.featureOrder),
                asc(commandTrigger.triggerIndex),
            )
            .all();
    }
}
