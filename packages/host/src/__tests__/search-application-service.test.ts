import type { RuntimeCoordinator } from '../app/runtime/runtime-coordinator';
import type { LauncherItemService } from '../app/search/launcher-item-service';
import type { PluginQuery } from '../domain/plugins/plugin-query';
import type { PlatformDatabase } from '../infrastructure/sqlite/platform-database';
import type { WindowManager } from '../presentation/window/window-manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchApplicationService } from '../app/search/search-application-service';

// ── Module-level mocks ──

/** Shared holder that the SearchSession mock updates on construction. */
const sessionHolder = vi.hoisted(() => ({ current: null as any }));

const MockSearchSession = vi.hoisted(() => {
    return class {
        queryId: string;
        sessionId = 'mock-session-id';
        isCancelled = false;
        cancel = vi.fn();
        search = vi.fn().mockResolvedValue(undefined);
        resolveItem = vi.fn().mockReturnValue(null);
        executeItem = vi.fn().mockResolvedValue({ ok: true });

        constructor(queryId: string) {
            this.queryId = queryId;
            sessionHolder.current = this;
        }
    };
});

vi.mock('../app/search/search-session', () => ({ SearchSession: MockSearchSession }));

// ── Helpers ──

function createMockWin() {
    return {
        isDestroyed: () => false,
        webContents: { send: vi.fn() },
    };
}

interface Deps {
    platformDb?: PlatformDatabase;
    pluginCatalog?: PluginQuery;
    coordinator?: RuntimeCoordinator;
    windowManager?: WindowManager;
    launcherItemService?: LauncherItemService;
}

function createService(overrides?: Deps): SearchApplicationService {
    const baseDb = { drizzle: () => ({}) } as unknown as PlatformDatabase;
    const baseItemSvc = { recordUsage: vi.fn() } as unknown as LauncherItemService;

    return new SearchApplicationService({
        platformDb: overrides?.platformDb ?? baseDb,
        pluginCatalog: overrides?.pluginCatalog ?? ({} as PluginQuery),
        coordinator: overrides?.coordinator ?? ({} as RuntimeCoordinator),
        windowManager: overrides?.windowManager ?? ({ getWindow: () => null } as unknown as WindowManager),
        launcherItemService: overrides?.launcherItemService ?? baseItemSvc,
        emitter: () => {},
    });
}

/** Create a service whose window returns a non-null BrowserWindow-like object. */
function createServiceWithWindow(): SearchApplicationService {
    const win = createMockWin();
    return createService({
        windowManager: { getWindow: () => win } as unknown as WindowManager,
    });
}

/** Call query() with minimal defaults and return the service. */
async function startSession(service: SearchApplicationService): Promise<void> {
    const result = await service.query({ queryId: 'q1', query: 'test', timestamp: Date.now() });
    expect(result.ok).toBe(true);
    expect(sessionHolder.current).not.toBeNull();
}

// ── Tests ──

describe('searchApplicationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionHolder.current = null;
    });

    // ── query ──

    it('should reject query when no window exists', async () => {
        const service = createService();
        const result = await service.query({ queryId: 'q1', query: 'test', timestamp: Date.now() });
        expect(result.ok).toBe(false);
    });

    // ── executeItem ──

    it('should return Session expired when no current session exists', async () => {
        const service = createService();
        const result = await service.executeItem('any-sid', 'any-qid', 'any-item');
        expect(result).toEqual({ ok: false, error: 'Session expired' });
    });

    it('should return Session expired when session is cancelled', async () => {
        const service = createServiceWithWindow();
        await startSession(service);

        // Simulate cancellation on the mock session
        sessionHolder.current.isCancelled = true;

        const result = await service.executeItem('mock-session-id', 'q1', 'any-item');
        expect(result).toEqual({ ok: false, error: 'Session expired' });
    });

    it('should return Session expired when sessionId does not match', async () => {
        const service = createServiceWithWindow();
        await startSession(service);

        const result = await service.executeItem('wrong-session-id', 'q1', 'any-item');
        expect(result).toEqual({ ok: false, error: 'Session expired' });
    });

    it('should return Session expired when queryId does not match', async () => {
        const service = createServiceWithWindow();
        await startSession(service);

        const result = await service.executeItem('mock-session-id', 'wrong-query-id', 'any-item');
        expect(result).toEqual({ ok: false, error: 'Session expired' });
    });

    it('should return Item not found when item is absent from session', async () => {
        const service = createServiceWithWindow();
        await startSession(service);

        // resolveItem already returns null by default in the mock
        const result = await service.executeItem('mock-session-id', 'q1', 'absent-item');
        expect(result).toEqual({ ok: false, error: 'Item not found in current session' });
    });

    // ── cancel ──

    it('should cancel the current session and clear it', async () => {
        const service = createServiceWithWindow();
        await startSession(service);

        const session = sessionHolder.current;
        service.cancel();

        // Session's cancel method was called
        expect(session.cancel).toHaveBeenCalledTimes(1);

        // Subsequent executeItem returns Session expired (no current session)
        const result = await service.executeItem('mock-session-id', 'q1', 'any-item');
        expect(result).toEqual({ ok: false, error: 'Session expired' });
    });

    it('should be safe to call cancel when no session exists', () => {
        const service = createService();
        // Should not throw
        service.cancel();
    });
});
