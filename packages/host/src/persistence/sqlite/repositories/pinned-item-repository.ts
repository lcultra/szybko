import type { PlatformDrizzleDatabase } from '../platform-database';
import { asc, eq } from 'drizzle-orm';
import { pinnedItem } from '../schema';

export interface PinnedItemRow {
    itemId: string;
    sortOrder: number;
    pinnedAt: number;
}

export class PinnedItemRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    list(): PinnedItemRow[] {
        return this.db.select()
            .from(pinnedItem)
            .orderBy(asc(pinnedItem.sortOrder))
            .all();
    }

    add(itemId: string, sortOrder: number): void {
        this.db.insert(pinnedItem).values({ itemId, sortOrder, pinnedAt: Date.now() }).onConflictDoUpdate({
            target: pinnedItem.itemId,
            set: { sortOrder, pinnedAt: Date.now() },
        }).run();
    }

    remove(itemId: string): void {
        this.db.delete(pinnedItem).where(eq(pinnedItem.itemId, itemId)).run();
    }

    reorder(itemId: string, toIndex: number): void {
        this.db.update(pinnedItem).set({ sortOrder: toIndex }).where(eq(pinnedItem.itemId, itemId)).run();
    }
}
