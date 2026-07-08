import type { PlatformDrizzleDatabase } from '../platform-database';
import { desc, eq, sql } from 'drizzle-orm';
import { usageEvent } from '../schema';

export interface UsageEventRow {
    id: number;
    itemId: string;
    query: string | null;
    selectedAt: number;
}

export interface UsageAggregation {
    itemId: string;
    freq: number;
    lastUsed: number;
}

export class UsageEventRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    record(itemId: string, query?: string): void {
        this.db.insert(usageEvent).values({
            itemId,
            query: query ?? null,
            selectedAt: Date.now(),
        }).run();
    }

    /** 按最近使用排序，取 top N */
    topUsed(limit = 20): UsageAggregation[] {
        return this.db.select({
            itemId: usageEvent.itemId,
            freq: sql<number>`COUNT(*)`.as('freq'),
            lastUsed: sql<number>`MAX(${usageEvent.selectedAt})`.as('last_used'),
        })
            .from(usageEvent)
            .groupBy(usageEvent.itemId)
            .orderBy(desc(sql`last_used`))
            .limit(limit)
            .all();
    }

    /** 删除指定 item 的所有使用记录 */
    removeByItemId(itemId: string): void {
        this.db.delete(usageEvent).where(eq(usageEvent.itemId, itemId)).run();
    }

    /** 按 item_id 前缀删除（用于清理某个 plugin 的所有记录） */
    removeByItemIdPrefix(prefix: string): void {
        this.db.delete(usageEvent).where(sql`item_id LIKE ${prefix}`).run();
    }
}
