import type { PlatformDrizzleDatabase } from '../platform-database';
import { and, asc, eq } from 'drizzle-orm';
import { commandTrigger, pinnedTrigger, pluginInstallation } from '../schema';

export class PinnedTriggerRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    /** 列出当前有效的固定项（仅 enabled plugin + 存在 trigger） */
    listWithTrigger(): Array<{ pluginId: string; featureCode: string; cmdKey: string; sortOrder: number }> {
        return this.db.select({
            pluginId: pinnedTrigger.pluginId,
            featureCode: pinnedTrigger.featureCode,
            cmdKey: pinnedTrigger.cmdKey,
            sortOrder: pinnedTrigger.sortOrder,
        })
            .from(pinnedTrigger)
            .innerJoin(commandTrigger, and(
                eq(commandTrigger.pluginId, pinnedTrigger.pluginId),
                eq(commandTrigger.featureCode, pinnedTrigger.featureCode),
                eq(commandTrigger.cmdKey, pinnedTrigger.cmdKey),
            ))
            .innerJoin(pluginInstallation, eq(pluginInstallation.pluginId, pinnedTrigger.pluginId))
            .where(eq(pluginInstallation.enabled, 1))
            .orderBy(asc(pinnedTrigger.sortOrder))
            .all();
    }

    add(pluginId: string, featureCode: string, cmdKey: string, sortOrder: number): void {
        this.db.insert(pinnedTrigger).values({ pluginId, featureCode, cmdKey, sortOrder, pinnedAt: Date.now() }).onConflictDoUpdate({
            target: [pinnedTrigger.pluginId, pinnedTrigger.featureCode, pinnedTrigger.cmdKey],
            set: { sortOrder, pinnedAt: Date.now() },
        }).run();
    }

    remove(pluginId: string, featureCode: string, cmdKey: string): void {
        this.db.delete(pinnedTrigger)
            .where(and(
                eq(pinnedTrigger.pluginId, pluginId),
                eq(pinnedTrigger.featureCode, featureCode),
                eq(pinnedTrigger.cmdKey, cmdKey),
            ))
            .run();
    }
}
