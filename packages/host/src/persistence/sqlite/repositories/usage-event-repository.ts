import type { PlatformDrizzleDatabase } from '../platform-database';
import { desc, sql } from 'drizzle-orm';
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

    /** 按使用频率 + 最近使用排序，取 top N */
    topUsed(limit = 20): UsageAggregation[] {
        return this.db.select({
            itemId: usageEvent.itemId,
            freq: sql<number>`COUNT(*)`.as('freq'),
            lastUsed: sql<number>`MAX(${usageEvent.selectedAt})`.as('last_used'),
        })
            .from(usageEvent)
            .groupBy(usageEvent.itemId)
            .orderBy(desc(sql`freq`), desc(sql`last_used`))
            .limit(limit)
            .all();
    }
}
