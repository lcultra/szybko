import type { PlatformDrizzleDatabase } from '../platform-database';
import { and, desc, eq, sql } from 'drizzle-orm';
import { commandTrigger, pluginInstallation, usageHistory } from '../schema';

export class UsageHistoryRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    record(pluginId: string, featureCode: string, cmdKey: string, query?: string, matchLevel?: number): void {
        this.db.insert(usageHistory).values({
            pluginId,
            featureCode,
            cmdKey,
            query,
            matchLevel,
            selectedAt: Date.now(),
        }).run();
    }

    /** 聚合高频使用（只计当前有效 trigger） */
    topUsed(limit = 20): Array<{ pluginId: string; featureCode: string; cmdKey: string; freq: number; lastUsed: number }> {
        return this.db.select({
            pluginId: usageHistory.pluginId,
            featureCode: usageHistory.featureCode,
            cmdKey: usageHistory.cmdKey,
            freq: sql<number>`COUNT(*)`.as('freq'),
            lastUsed: sql<number>`MAX(${usageHistory.selectedAt})`.as('last_used'),
        })
            .from(usageHistory)
            .innerJoin(commandTrigger, and(
                eq(commandTrigger.pluginId, usageHistory.pluginId),
                eq(commandTrigger.featureCode, usageHistory.featureCode),
                eq(commandTrigger.cmdKey, usageHistory.cmdKey),
            ))
            .innerJoin(pluginInstallation, eq(pluginInstallation.pluginId, usageHistory.pluginId))
            .where(eq(pluginInstallation.enabled, 1))
            .groupBy(usageHistory.pluginId, usageHistory.featureCode, usageHistory.cmdKey)
            .orderBy(desc(sql`freq`), desc(sql`last_used`))
            .limit(limit)
            .all();
    }
}
