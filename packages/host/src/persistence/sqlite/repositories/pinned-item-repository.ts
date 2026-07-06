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
        const all = this.list(); // ordered by sortOrder asc
        const sourceIndex = all.findIndex(r => r.itemId === itemId);
        if (sourceIndex === -1) return;

        // Remove from current position and insert at new position
        const [moved] = all.splice(sourceIndex, 1);
        const insertAt = Math.min(toIndex, all.length);
        all.splice(insertAt, 0, moved);

        // Reassign contiguous sortOrder in a transaction
        this.db.transaction((tx) => {
            for (let i = 0; i < all.length; i++) {
                tx.update(pinnedItem)
                    .set({ sortOrder: i })
                    .where(eq(pinnedItem.itemId, all[i].itemId))
                    .run();
            }
        });
    }
}
