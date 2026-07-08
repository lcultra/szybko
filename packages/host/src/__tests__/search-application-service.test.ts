import { describe, it, expect, vi } from 'vitest';
import { SearchApplicationService } from '../app/search/search-application-service';
import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { WindowManager } from '../window/window-manager';
import type { MatchSessionManager } from '../input/match-session-manager';
import type { LauncherItemService } from '../app/search/launcher-item-service';

describe('SearchApplicationService', () => {
  it('should reject query when no window exists', async () => {
    const mockDb = { drizzle: () => ({}) } as unknown as PlatformDatabase;
    const mockCatalog = {} as PluginCatalog;
    const mockCoordinator = {} as RuntimeCoordinator;
    const mockWinManager = { getWindow: () => null } as unknown as WindowManager;
    const mockSessionManager = {} as MatchSessionManager;
    const mockItemService = { recordUsage: vi.fn() } as unknown as LauncherItemService;

    const service = new SearchApplicationService({
      platformDb: mockDb,
      pluginCatalog: mockCatalog,
      coordinator: mockCoordinator,
      windowManager: mockWinManager,
      sessionManager: mockSessionManager,
      launcherItemService: mockItemService,
      emitter: () => {},
    });

    const result = await service.query({ queryId: 'q1', query: 'test', timestamp: Date.now() });
    expect(result.ok).toBe(false);
  });
});
