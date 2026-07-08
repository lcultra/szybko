import type { PlatformDatabase } from '../../infrastructure/sqlite/platform-database';
import { PinnedItemRepository } from '../../infrastructure/sqlite/repositories/pinned-item-repository';
import { UsageEventRepository } from '../../infrastructure/sqlite/repositories/usage-event-repository';

export class LauncherItemService {
  private pinnedRepo: PinnedItemRepository;
  private usageRepo: UsageEventRepository;

  constructor(platformDb: PlatformDatabase) {
    const db = platformDb.drizzle();
    this.pinnedRepo = new PinnedItemRepository(db);
    this.usageRepo = new UsageEventRepository(db);
  }

  async pinItem(itemId: string): Promise<void> {
    this.pinnedRepo.add(itemId, Date.now());
  }

  async unpinItem(itemId: string): Promise<void> {
    this.pinnedRepo.remove(itemId);
  }

  async reorderItem(itemId: string, toIndex: number): Promise<void> {
    this.pinnedRepo.reorder(itemId, toIndex);
  }

  async recordUsage(itemId: string): Promise<void> {
    this.usageRepo.record(itemId);
  }

  async removeRecentItem(itemId: string): Promise<void> {
    this.usageRepo.removeByItemId(itemId);
  }

  isPinned(itemId: string): boolean {
    return this.pinnedRepo.exists(itemId);
  }

  async cleanupByPlugin(pluginId: string): Promise<void> {
    const prefix = `plugin://${pluginId}/%`;
    // Delegates to repositories that handle SQL LIKE queries
    // Implementation: delete from pinned_item and usage_event where item_id LIKE prefix
    this.pinnedRepo.removeByItemIdPrefix(prefix);
    this.usageRepo.removeByItemIdPrefix(prefix);
  }
}
