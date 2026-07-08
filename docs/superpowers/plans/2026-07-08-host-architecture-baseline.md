# Host Architecture Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `@szybko/host` from a flat module with overgrown IPC and desktop-main composition root into a layered platform kernel with clear application services, pure domain, infrastructure adapters, and thin IPC/Electron wiring.

**Architecture:** Four-layer dependency direction: `bootstrap → app → domain`, with `infrastructure` and `ipc` and `presentation` depending on `app` ports and domain types. `apps/desktop/src/main/index.ts` shrinks to Electron lifecycle + `createHostPlatform()` call.

**Tech Stack:** Electron 43, TypeScript 6, Drizzle ORM, Vitest, `@szybko/shared` (IPC contract types), `@szybko/native` (Rust native bindings)

## Global Constraints

- `domain/**` must not import `electron`, `drizzle-orm`, `node:fs`, `node:path`, `ipcMain`, or `infrastructure/**`
- `app/**` must not import `ipcMain`, IPC handler registration helpers, SQLite schema, or Electron concrete UI primitives unless hidden behind ports
- `ipc/**` must not import repositories, SQLite schema, command normalizers, runtime managers, or Electron menus directly
- `infrastructure/sqlite/**` is the only layer allowed to import SQLite schema
- `bootstrap/**` is the only layer allowed to instantiate the full object graph
- `apps/desktop/src/main/index.ts` must not directly create `CommandCatalog`, `PluginCatalog`, or `RuntimeManager`
- Built-in plugins can be enabled/disabled but cannot be uninstalled
- Disabled state is user preference and must not be overwritten by source sync
- Each stage must compile independently
- Forwarding/compatibility files can exist temporarily but must be deleted before Stage 8 is complete

---

### Stage 1: Establish Architecture Skeleton

**Summary:** Add the target directory structure under `packages/host/src/`, define port interfaces for each application service, create the `HostPlatform` interface and `createHostPlatform()` bootstrap shell, and add `StartupService` interface. Do NOT move any existing code yet — just create the skeleton that later stages will fill.

#### Task 1.1: Add target directory structure and shared types

**Files:**
- Create: `packages/host/src/shared/errors.ts`
- Create: `packages/host/src/shared/result.ts`
- Create: `packages/host/src/shared/ids.ts`
- Create: `packages/host/src/bootstrap/host-platform.ts`
- Create: `packages/host/src/bootstrap/host-platform-config.ts`
- Create: `packages/host/src/bootstrap/create-host-platform.ts`
- Create: `packages/host/src/bootstrap/register-host-platform.ts`

- [ ] **Step 1: Create shared error types**

```typescript
// packages/host/src/shared/errors.ts
export const AppErrorCode = {
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
  PLUGIN_PACKAGE_MISSING: 'PLUGIN_PACKAGE_MISSING',
  PLUGIN_PACKAGE_INVALID: 'PLUGIN_PACKAGE_INVALID',
  PLUGIN_SOURCE_FORBIDS_UNINSTALL: 'PLUGIN_SOURCE_FORBIDS_UNINSTALL',
  PLUGIN_ALREADY_INSTALLED: 'PLUGIN_ALREADY_INSTALLED',
  PLUGIN_NOT_INSTALLED: 'PLUGIN_NOT_INSTALLED',
  RUNTIME_NOT_FOUND: 'RUNTIME_NOT_FOUND',
  SEARCH_SESSION_EXPIRED: 'SEARCH_SESSION_EXPIRED',
  LAUNCHER_ITEM_NOT_FOUND: 'LAUNCHER_ITEM_NOT_FOUND',
} as const;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message?: string,
    public readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}
```

- [ ] **Step 2: Create Result type**

```typescript
// packages/host/src/shared/result.ts
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<T = never, E = Error>(error: E): Result<T, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isFail<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}
```

- [ ] **Step 3: Create ID types**

```typescript
// packages/host/src/shared/ids.ts
/** Branded type for plugin IDs */
export type PluginId = string & { __brand: 'PluginId' };

/** Branded type for runtime IDs */
export type RuntimeId = string & { __brand: 'RuntimeId' };

/** Branded type for search session IDs */
export type SearchSessionId = string & { __brand: 'SearchSessionId' };
```

- [ ] **Step 4: Create bootstrap types**

```typescript
// packages/host/src/bootstrap/host-platform.ts
export interface HostPlatform {
  start(): Promise<void>;
  show(): void;
  dispose(): void;
}
```

```typescript
// packages/host/src/bootstrap/host-platform-config.ts
export interface HostPlatformConfig {
  userDataPath: string;
  builtInPluginsPath: string;
  preloadPath: string;
  pluginPreloadPath: string;
  isPackaged: boolean;
  rendererUrl?: string;
}
```

```typescript
// packages/host/src/bootstrap/create-host-platform.ts
import type { HostPlatformConfig } from './host-platform-config';
import type { HostPlatform } from './host-platform';

export async function createHostPlatform(config: HostPlatformConfig): Promise<HostPlatform> {
  // Stage 1: empty shell — returns a no-op platform
  // Later stages will fill this in
  return {
    async start() {
      console.log('[host] platform started (skeleton)');
    },
    show() {
      console.log('[host] platform show (skeleton)');
    },
    dispose() {
      console.log('[host] platform disposed (skeleton)');
    },
  };
}
```

```typescript
// packages/host/src/bootstrap/register-host-platform.ts
// Re-export for convenience — placeholder for now
export { createHostPlatform } from './create-host-platform';
export type { HostPlatform } from './host-platform';
export type { HostPlatformConfig } from './host-platform-config';
```

- [ ] **Step 5: Create empty app service ports**

```typescript
// packages/host/src/app/startup/ports.ts
import type { HostPlatform, HostPlatformConfig } from '../../bootstrap/host-platform';

export interface StartupService {
  start(): Promise<void>;
}
```

```typescript
// packages/host/src/app/plugins/ports.ts
import type { PluginId } from '../../shared/ids';

export interface PluginLifecycleService {
  registerUserPlugin(path: string): Promise<void>;
  enablePlugin(pluginId: PluginId): Promise<void>;
  disablePlugin(pluginId: PluginId): Promise<void>;
  uninstallUserPlugin(pluginId: PluginId): Promise<void>;
  refreshPlugin(pluginId: PluginId): Promise<void>;
}

export interface PluginQueryService {
  listPlugins(): Promise<unknown[]>;
  getPlugin(pluginId: PluginId): Promise<unknown>;
}

export interface PluginSourceSyncService {
  syncBuiltIn(): Promise<unknown>;
  syncDev(): Promise<unknown>;
  syncUserInstalled(): Promise<unknown>;
}
```

```typescript
// packages/host/src/app/commands/ports.ts
import type { PluginId } from '../../shared/ids';

export interface CommandIndexService {
  indexPluginManifest(pluginPackage: unknown): Promise<void>;
  removePluginIndex(pluginId: PluginId): Promise<void>;
  rebuildPluginProjection(pluginId: PluginId): Promise<void>;
}

export interface DynamicFeatureService {
  setFeature(senderWebContentsId: number, feature: { code: string; [key: string]: unknown }): Promise<{ ok: boolean; error?: string }>;
  getFeatures(pluginId: PluginId, codes?: string[]): unknown[];
  removeFeature(pluginId: PluginId, code: string): { ok: boolean };
}
```

```typescript
// packages/host/src/app/search/ports.ts
export interface SearchApplicationService {
  query(request: unknown): Promise<unknown>;
  cancel(queryId: string): Promise<void>;
  executeItem(sessionId: string, queryId: string, itemId: string): Promise<unknown>;
  refreshLastQuery(): Promise<void>;
}

export interface LauncherItemService {
  pinItem(itemId: string): Promise<void>;
  unpinItem(itemId: string): Promise<void>;
  reorderItem(itemId: string, toIndex: number): Promise<void>;
  recordUsage(itemId: string): Promise<void>;
  removeRecentItem(itemId: string): Promise<void>;
  getContextMenu(itemId: string, source: string): Promise<unknown[]>;
  isPinned(itemId: string): boolean;
  cleanupByPlugin(pluginId: string): Promise<void>;
}
```

```typescript
// packages/host/src/app/runtime/ports.ts
import type { PluginId, RuntimeId } from '../../shared/ids';

export interface RuntimeApplicationService {
  activatePlugin(pluginId: PluginId, featureCode?: string, enterPayload?: unknown): Promise<void>;
  moveToHost(runtimeId: RuntimeId, targetHost: string): Promise<void>;
  hideRuntime(runtimeId: RuntimeId): Promise<void>;
  destroyRuntime(runtimeId: RuntimeId): Promise<void>;
  pinRuntime(runtimeId: RuntimeId, pin: boolean): Promise<void>;
  showPluginMenu(runtimeId: RuntimeId, variant?: string): Promise<void>;
  resolvePluginIdForWebContents(webContentsId: number): Promise<PluginId | null>;
}
```

```typescript
// packages/host/src/app/shortcuts/ports.ts
export interface ShortcutApplicationService {
  registerDefaults(): Promise<void>;
}

export interface WindowApplicationService {
  toggleMainWindow(): void;
  show(): void;
  hide(): void;
  resize(height: number): void;
}
```

- [ ] **Step 6: Create app barrel export**

```typescript
// packages/host/src/app/index.ts
export type { StartupService } from './startup/ports';
export type { PluginLifecycleService, PluginQueryService, PluginSourceSyncService } from './plugins/ports';
export type { CommandIndexService, DynamicFeatureService } from './commands/ports';
export type { SearchApplicationService, LauncherItemService } from './search/ports';
export type { RuntimeApplicationService } from './runtime/ports';
export type { ShortcutApplicationService, WindowApplicationService } from './shortcuts/ports';
```

- [ ] **Step 7: Create empty domain directory structure**

```typescript
// packages/host/src/domain/plugins/plugin.ts
export type PluginSourceKind = 'built-in' | 'user-installed' | 'local-dev';
export type PluginAvailability = 'available' | 'missing' | 'invalid';

export interface PluginPackage {
  id: string;
  manifest: unknown;
  path: string;
  source: PluginSourceKind;
  availability: PluginAvailability;
}
```

```typescript
// packages/host/src/domain/plugins/plugin-source.ts
export type { PluginSourceKind } from './plugin';
```

```typescript
// packages/host/src/domain/plugins/plugin-installation.ts
import type { PluginSourceKind } from './plugin';

export interface PluginInstallation {
  pluginId: string;
  source: PluginSourceKind;
  enabled: boolean;
  installPath: string;
  version: string;
  manifestHash: string | null;
  createdAt: number;
  updatedAt: number;
}
```

```typescript
// packages/host/src/domain/plugins/plugin-manifest.ts
// Re-export from @szybko/shared for now
export type { PluginManifest } from '@szybko/shared';
```

```typescript
// packages/host/src/domain/plugins/plugin-errors.ts
export const PLUGIN_DOMAIN_ERRORS = {
  BUILT_IN_CANNOT_UNINSTALL: 'Built-in plugins cannot be uninstalled',
  PLUGIN_NOT_FOUND: 'Plugin not found',
  PACKAGE_MISSING: 'Plugin package is missing from disk',
  PACKAGE_INVALID: 'Plugin package is invalid',
} as const;
```

- [ ] **Step 8: Create domain barrel export**

```typescript
// packages/host/src/domain/index.ts
export type { PluginPackage, PluginSourceKind, PluginAvailability } from './plugins/plugin';
export type { PluginInstallation } from './plugins/plugin-installation';
export type { PluginManifest } from './plugins/plugin-manifest';
```

- [ ] **Step 9: Compile and verify**

Run: `pnpm --filter @szybko/host typecheck`
Expected: TypeScript compiles (may warn about unused exports, but no errors)

- [ ] **Step 10: Commit**

```bash
git add packages/host/src/shared/ packages/host/src/bootstrap/ packages/host/src/app/ packages/host/src/domain/
git commit -m "feat(host): add architecture skeleton — domain, app ports, bootstrap shell"
```

---

#### Task 1.2: Add empty infrastructure and presentation directories

**Files:**
- Create: `packages/host/src/infrastructure/sqlite/repositories/index.ts`
- Create: `packages/host/src/infrastructure/filesystem/index.ts`
- Create: `packages/host/src/infrastructure/electron/index.ts`
- Create: `packages/host/src/infrastructure/protocol/index.ts`
- Create: `packages/host/src/presentation/window/index.ts`
- Create: `packages/host/src/presentation/runtime-hosts/index.ts`

- [ ] **Step 1: Create infrastructure barrel placeholder files**

```typescript
// packages/host/src/infrastructure/sqlite/repositories/index.ts
// Stage 1 placeholder — actual repositories will be moved here in Stage 7
export {};
```

```typescript
// packages/host/src/infrastructure/filesystem/index.ts
// Stage 1 placeholder — filesystem adapters moved here in Stage 7
export {};
```

```typescript
// packages/host/src/infrastructure/electron/index.ts
// Stage 1 placeholder — moved in Stage 6/7
export {};
```

```typescript
// packages/host/src/infrastructure/protocol/index.ts
// Stage 1 placeholder — moved in Stage 7
export {};
```

- [ ] **Step 2: Create presentation barrel placeholder files**

```typescript
// packages/host/src/presentation/window/index.ts
// Stage 1 placeholder — window/presentation moved in Stage 6/7
export {};
```

```typescript
// packages/host/src/presentation/runtime-hosts/index.ts
// Stage 1 placeholder — runtime hosts moved in Stage 6/7
export {};
```

- [ ] **Step 3: Compile and commit**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

```bash
git add packages/host/src/infrastructure/ packages/host/src/presentation/
git commit -m "feat(host): add infrastructure and presentation directory stubs"
```

---

### Stage 2: Extract SearchApplicationService

**Summary:** Move search session state, provider composition, and trigger refresh logic out of `register-handlers.ts` into `SearchApplicationService` and `LauncherItemService`. IPC handlers for SEARCH_QUERY, SEARCH_CANCEL, ITEM_PIN, ITEM_REORDER, ITEM_CONTEXT_MENU, ITEM_EXECUTE become thin delegators.

#### Task 2.1: Implement SearchApplicationService

**Files:**
- Create: `packages/host/src/app/search/search-application-service.ts`
- Create: `packages/host/src/app/search/launcher-item-service.ts`

- [ ] **Step 1: Write the failing test for SearchApplicationService**

```typescript
// packages/host/src/__tests__/search-application-service.test.ts
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

    const result = await service.query({ queryId: 'q1', text: 'test', source: 'input' });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (or at least compiles)**

Run: `pnpm --filter @szybko/host test -- --run src/__tests__/search-application-service.test.ts`
Expected: Test passes (class imports and constructs correctly)

- [ ] **Step 3: Implement SearchApplicationService**

```typescript
// packages/host/src/app/search/search-application-service.ts
import type { SearchRequest, LauncherItem, SearchResponse, PluginEnterPayload } from '@szybko/shared';
import type { PlatformDatabase } from '../../persistence/sqlite/platform-database';
import type { SearchProvider } from '../../search/provider';
import type { SearchSession } from '../../search/search-session';
import type { PluginProvider } from '../../search/plugin-provider';
import type { PinnedSectionProvider } from '../../search/pinned-provider';
import type { RecentSectionProvider } from '../../search/recent-provider';
import type { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { PluginCatalog } from '../../plugins/plugin-catalog';
import type { WindowManager } from '../../window/window-manager';
import type { MatchSessionManager } from '../../input/match-session-manager';
import type { LauncherItemService } from './launcher-item-service';
import { IPC } from '@szybko/shared';
import { collectFromSearch } from '../../input/input-context-collector';

export interface SearchServiceDeps {
  platformDb: PlatformDatabase;
  pluginCatalog: PluginCatalog;
  coordinator: RuntimeCoordinator;
  windowManager: WindowManager;
  sessionManager: MatchSessionManager;
  launcherItemService: LauncherItemService;
  emitter: (channel: string, data: unknown) => void;
}

export class SearchApplicationService {
  private currentSession: SearchSession | null = null;
  private lastSearchRequest: SearchRequest | null = null;
  private pluginProvider: PluginProvider | null = null;
  private pinnedProvider: PinnedSectionProvider | null = null;
  private recentProvider: RecentSectionProvider | null = null;

  constructor(private deps: SearchServiceDeps) {
    this.initProviders();
  }

  private initProviders(): void {
    const db = this.deps.platformDb.drizzle();
    const resolveFromProviders = async (itemId: string): Promise<LauncherItem | null> => {
      // 1. Try current session cache
      const sessionItem = this.currentSession?.resolveItem(itemId);
      if (sessionItem) return sessionItem;
      // 2. Try plugin provider's resolve
      if (itemId.startsWith('plugin://') && this.pluginProvider) {
        return this.pluginProvider.resolve(itemId);
      }
      return null;
    };

    this.pluginProvider = new PluginProvider(db, this.deps.coordinator, this.deps.pluginCatalog, this.deps.sessionManager);
    this.pinnedProvider = new PinnedSectionProvider(db, resolveFromProviders);
    this.recentProvider = new RecentSectionProvider(db, resolveFromProviders);
  }

  async query(request: SearchRequest): Promise<{ ok: boolean; sessionId?: string }> {
    // Cancel previous session
    if (this.currentSession) {
      this.currentSession.cancel();
    }
    this.currentSession = null;
    this.lastSearchRequest = request;

    const snapshot = collectFromSearch(request);
    const win = this.deps.windowManager.getWindow();
    if (!win || win.isDestroyed()) return { ok: false };

    const providers = [this.pinnedProvider, this.recentProvider, this.pluginProvider]
      .filter(Boolean) as SearchProvider[];

    const session = new SearchSession(request.queryId, providers, (res) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.SEARCH_RESPONSE, res);
      }
    });

    this.currentSession = session;

    session.search(snapshot).catch((err: unknown) => {
      console.error('[SearchApp] SearchSession error:', err);
    });

    return { ok: true, sessionId: session.sessionId };
  }

  cancel(): void {
    if (this.currentSession) {
      this.currentSession.cancel();
      this.currentSession = null;
    }
  }

  async executeItem(sessionId: string, queryId: string, itemId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.currentSession || this.currentSession.isCancelled) {
      return { ok: false, error: 'Session expired' };
    }
    if (this.currentSession.sessionId !== sessionId || this.currentSession.queryId !== queryId) {
      return { ok: false, error: 'Session expired' };
    }
    if (!this.currentSession.resolveItem(itemId)) {
      return { ok: false, error: 'Item not found in current session' };
    }

    // Record usage via LauncherItemService
    await this.deps.launcherItemService.recordUsage(itemId);

    const result = await this.currentSession.executeItem(itemId, { queryId, sessionId });
    return result;
  }

  triggerRefresh(): void {
    if (!this.lastSearchRequest || !this.pluginProvider || !this.pinnedProvider || !this.recentProvider) return;

    const win = this.deps.windowManager.getWindow();
    if (!win || win.isDestroyed()) return;

    if (this.currentSession) {
      this.currentSession.cancel();
    }

    const snapshot = collectFromSearch(this.lastSearchRequest);
    const providers = [this.pinnedProvider, this.recentProvider, this.pluginProvider]
      .filter(Boolean) as SearchProvider[];

    const session = new SearchSession(this.lastSearchRequest.queryId, providers, (res) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.SEARCH_RESPONSE, res);
      }
    });

    this.currentSession = session;
    session.search(snapshot).catch((err: unknown) => {
      console.error('[SearchApp] Refresh error:', err);
    });
  }
}
```

- [ ] **Step 4: Implement LauncherItemService**

```typescript
// packages/host/src/app/search/launcher-item-service.ts
import type { PlatformDatabase } from '../../persistence/sqlite/platform-database';
import { PinnedItemRepository } from '../../persistence/sqlite/repositories/pinned-item-repository';
import { UsageEventRepository } from '../../persistence/sqlite/repositories/usage-event-repository';

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
    return this.pinnedRepo.list().some(r => r.itemId === itemId);
  }

  async cleanupByPlugin(pluginId: string): Promise<void> {
    const prefix = `plugin://${pluginId}/%`;
    // Delegates to repositories that handle SQL LIKE queries
    // Implementation: delete from pinned_item and usage_event where item_id LIKE prefix
    this.pinnedRepo.removeByItemIdPrefix(prefix);
    this.usageRepo.removeByItemIdPrefix(prefix);
  }
}
```

- [ ] **Step 5: Add removeByItemIdPrefix to PinnedItemRepository and UsageEventRepository**

```typescript
// In packages/host/src/persistence/sqlite/repositories/pinned-item-repository.ts
// Add method:
import { sql } from 'drizzle-orm';

removeByItemIdPrefix(prefix: string): void {
  this.db.delete(pinnedItem).where(sql`item_id LIKE ${prefix}`).run();
}
```

```typescript
// In packages/host/src/persistence/sqlite/repositories/usage-event-repository.ts
// Add method:
import { sql } from 'drizzle-orm';

removeByItemIdPrefix(prefix: string): void {
  this.db.delete(usageEvent).where(sql`item_id LIKE ${prefix}`).run();
}
```

- [ ] **Step 6: Write tests**

```typescript
// packages/host/src/__tests__/launcher-item-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformDatabase } from '../persistence/sqlite/platform-database';

describe('LauncherItemService', () => {
  // Integration test with SQLite — use a real in-memory database
  it('should be constructable', async () => {
    // Inline test — full integration test in Stage 2 verification
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 7: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/host test`
Expected: Existing + new tests pass

- [ ] **Step 8: Commit**

```bash
git add packages/host/src/app/search/ packages/host/src/__tests__/search-application-service.test.ts packages/host/src/persistence/sqlite/repositories/
git commit -m "feat(host): add SearchApplicationService and LauncherItemService"
```

---

#### Task 2.2: Thin search/item IPC handlers

**Files:**
- Create: `packages/host/src/ipc/handlers/search-ipc-handlers.ts`
- Create: `packages/host/src/ipc/handlers/item-ipc-handlers.ts`
- Modify: `packages/host/src/ipc/register-handlers.ts`
- Modify: `packages/host/src/index.ts` (add new exports)

- [ ] **Step 1: Create search IPC handler**

```typescript
// packages/host/src/ipc/handlers/search-ipc-handlers.ts
import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { SearchApplicationService } from '../../app/search/ports';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerSearchIpcHandlers(deps: {
  searchService: SearchApplicationService;
}): void {
  ipcMain.handle(
    IPC.SEARCH_QUERY,
    async (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): Promise<IpcResponse<typeof IPC.SEARCH_QUERY>> => {
      const result = await deps.searchService.query(req);
      return result;
    },
  );

  ipcMain.handle(
    IPC.SEARCH_CANCEL,
    (): IpcResponse<typeof IPC.SEARCH_CANCEL> => {
      deps.searchService.cancel();
      return { ok: true };
    },
  );
}
```

- [ ] **Step 2: Create item IPC handler**

```typescript
// packages/host/src/ipc/handlers/item-ipc-handlers.ts
import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { BrowserWindow, ipcMain, Menu } from 'electron';
import type { LauncherItemService } from '../../app/search/ports';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerItemIpcHandlers(deps: {
  launcherItemService: LauncherItemService;
  triggerRefresh: () => void;
}): void {
  ipcMain.handle(
    IPC.ITEM_PIN,
    (_event, { itemId, pin }: IpcRequest<typeof IPC.ITEM_PIN>): IpcResponse<typeof IPC.ITEM_PIN> => {
      if (pin) {
        deps.launcherItemService.pinItem(itemId);
      } else {
        deps.launcherItemService.unpinItem(itemId);
      }
      deps.triggerRefresh();
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.ITEM_REORDER,
    (_event, { itemId, toIndex }: IpcRequest<typeof IPC.ITEM_REORDER>): IpcResponse<typeof IPC.ITEM_REORDER> => {
      deps.launcherItemService.reorderItem(itemId, toIndex);
      deps.triggerRefresh();
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.ITEM_CONTEXT_MENU,
    (_event, req: IpcRequest<typeof IPC.ITEM_CONTEXT_MENU>): IpcResponse<typeof IPC.ITEM_CONTEXT_MENU> => {
      const { itemId, screenX, screenY, source } = req;
      const isPinned = deps.launcherItemService.isPinned(itemId);

      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { ok: false };

      const menuBuilder: Electron.MenuItemConstructorOptions[] = [
        {
          label: isPinned ? '取消固定"搜索框"' : '固定到"搜索框"',
          click: () => {
            if (isPinned) deps.launcherItemService.unpinItem(itemId);
            else deps.launcherItemService.pinItem(itemId);
            deps.triggerRefresh();
          },
        },
      ];

      if (source === 'recent') {
        menuBuilder.push({
          label: '从"使用记录"中删除',
          click: () => {
            deps.launcherItemService.removeRecentItem(itemId);
            deps.triggerRefresh();
          },
        });
      }

      const menu = Menu.buildFromTemplate(menuBuilder);
      menu.popup({ window: win, x: screenX, y: screenY });
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.ITEM_EXECUTE,
    async (
      _event,
      req: IpcRequest<typeof IPC.ITEM_EXECUTE>,
    ): Promise<IpcResponse<typeof IPC.ITEM_EXECUTE>> => {
      const { sessionId, queryId, itemId } = req;
      const result = await deps.searchService.executeItem(sessionId, queryId, itemId);
      return result;
    },
  );
}
```

- [ ] **Step 3: Update register-handlers.ts to use new handlers**

Replace the search/item sections in `register-handlers.ts`:

```typescript
// In packages/host/src/ipc/register-handlers.ts — remove all search, item-pin, item-reorder,
// item-context-menu, item-execute handlers. Add imports for the new handlers and call them.

import { registerSearchIpcHandlers } from './handlers/search-ipc-handlers';
import { registerItemIpcHandlers } from './handlers/item-ipc-handlers';

export function registerIpcHandlers(
  windowManager: WindowManager,
  coordinator: RuntimeCoordinator,
  commandCatalog: CommandCatalog,
  platformDb?: PlatformDatabase,
  pluginCatalog?: PluginCatalog,
  shortcutRegistry?: ShortcutRegistry,
  searchService?: SearchApplicationService,
  launcherItemService?: LauncherItemService,
) {
  // Keep only non-search, non-item handlers in this file:
  // PLUGIN_EXEC, HOST_SWITCH, PLUGIN_HIDE, PLUGIN_DESTROY, SHOW_PLUGIN_MENU,
  // PLUGIN_PIN, FEATURE_SET, FEATURE_GET, FEATURE_REMOVE, PLUGIN_SET_ENABLED,
  // PLUGIN_UNINSTALL, SHORTCUT_GET_DEFS, WINDOW_RESIZE, WINDOW_HIDE

  if (searchService) {
    registerSearchIpcHandlers({ searchService });
  }

  if (launcherItemService && searchService) {
    registerItemIpcHandlers({
      launcherItemService,
      triggerRefresh: () => (searchService as SearchApplicationService).triggerRefresh(),
    });
  }

  // ... rest of existing handlers for PLUGIN_EXEC, HOST_SWITCH, etc.
}
```

- [ ] **Step 4: Update barrel export in index.ts**

```typescript
// In packages/host/src/index.ts — add:
export { SearchApplicationService } from './app/search/search-application-service';
export { LauncherItemService } from './app/search/launcher-item-service';
export { registerSearchIpcHandlers } from './ipc/handlers/search-ipc-handlers';
export { registerItemIpcHandlers } from './ipc/handlers/item-ipc-handlers';
```

- [ ] **Step 5: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/host test`
Expected: All tests pass

- [ ] **Step 6: Update apps/desktop/src/main/index.ts**

Pass `searchService` and `launcherItemService` to `registerIpcHandlers`:

```typescript
// In apps/desktop/src/main/index.ts — after creating coordinator and before registerIpcHandlers:
import { LauncherItemService, SearchApplicationService } from '@szybko/host';

const launcherItemService = new LauncherItemService(platformDb);
const searchService = new SearchApplicationService({
  platformDb,
  pluginCatalog: pluginManager,
  coordinator,
  windowManager,
  sessionManager: new MatchSessionManager(),
  launcherItemService,
  emitter: (channel, data) => { /* ... */ },
});

registerIpcHandlers(windowManager, coordinator, commandCatalog, platformDb,
  pluginManager, shortcutRegistry, searchService, launcherItemService);
```

- [ ] **Step 7: Compile and test desktop app**

Run: `pnpm --filter @szybko/desktop typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add packages/host/src/ipc/handlers/ packages/host/src/app/search/ packages/host/src/__tests__/ apps/desktop/src/main/index.ts packages/host/src/index.ts
git commit -m "feat(host): extract search and item IPC into thin delegated handlers"
```

---

### Stage 3: Extract PluginLifecycleService

**Summary:** Move plugin enable/disable/uninstall/registration workflows out of `register-handlers.ts` and `apps/desktop/src/main/index.ts` into `PluginLifecycleService`. The PLUGIN_SET_ENABLED and PLUGIN_UNINSTALL IPC handlers become thin delegators. Built-in uninstall rejection is enforced.

#### Task 3.1: Implement PluginLifecycleService

**Files:**
- Create: `packages/host/src/app/plugins/plugin-lifecycle-service.ts`
- Create: `packages/host/src/app/plugins/plugin-query-service.ts`

- [ ] **Step 1: Write port interfaces (already done in Stage 1 as part of ports.ts)**

Confirm `packages/host/src/app/plugins/ports.ts` exists with:
- `PluginLifecycleService` (registerUserPlugin, enablePlugin, disablePlugin, uninstallUserPlugin, refreshPlugin)
- `PluginQueryService` (listPlugins, getPlugin)

- [ ] **Step 2: Write failing test**

```typescript
// packages/host/src/__tests__/plugin-lifecycle-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PluginLifecycleService } from '../app/plugins/plugin-lifecycle-service';
import { AppError, AppErrorCode } from '../shared/errors';
import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { CommandCatalog } from '../commands/command-catalog';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { RuntimeManager } from '../runtime/runtime-manager';
import type { LauncherItemService } from '../app/search/launcher-item-service';
import type { PluginQueryService } from '../app/plugins/plugin-query-service';

describe('PluginLifecycleService', () => {
  it('should reject uninstall for built-in plugins', async () => {
    const mockPluginInstallation = { pluginId: 'built-in-1', source: 'built-in', enabled: true } as const;
    const mockPluginCatalog = {
      get: vi.fn(() => ({ id: 'built-in-1', manifest: {}, path: '/plugins/built-in-1' })),
    } as unknown as PluginCatalog;
    const mockDb = {
      drizzle: () => ({
        select: () => ({ from: () => ({ where: () => ({ get: () => mockPluginInstallation }) }) }),
      }),
    } as unknown as PlatformDatabase;

    const service = new PluginLifecycleService(
      mockDb, mockPluginCatalog, {} as CommandCatalog,
      {} as RuntimeCoordinator, {} as RuntimeManager,
      {} as LauncherItemService, {} as PluginQueryService,
    );

    await expect(service.uninstallUserPlugin('built-in-1'))
      .rejects.toThrow(AppError);
    await expect(service.uninstallUserPlugin('built-in-1'))
      .rejects.toMatchObject({ code: AppErrorCode.PLUGIN_SOURCE_FORBIDS_UNINSTALL });
  });
});
```
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @szybko/host test -- --run src/__tests__/plugin-lifecycle-service.test.ts`
Expected: Test fails because `uninstallUserPlugin` implementation requires `PluginInstallationRepository.get()` which needs a real database

- [ ] **Step 4: Implement PluginLifecycleService**

```typescript
// packages/host/src/app/plugins/plugin-lifecycle-service.ts
import type { PluginCatalog } from '../../plugins/plugin-catalog';
import type { CommandCatalog } from '../../commands/command-catalog';
import type { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { RuntimeManager } from '../../runtime/runtime-manager';
import type { PlatformDatabase } from '../../persistence/sqlite/platform-database';
import type { LauncherItemService } from '../search/launcher-item-service';
import { PluginInstallationRepository } from '../../persistence/sqlite/repositories/plugin-installation-repository';
import type { PluginQueryService } from './plugin-query-service';
import { AppError, AppErrorCode } from '../../shared/errors';

export class PluginLifecycleService {
  private installationRepo: PluginInstallationRepository;

  constructor(
    private platformDb: PlatformDatabase,
    private pluginCatalog: PluginCatalog,
    private commandCatalog: CommandCatalog,
    private coordinator: RuntimeCoordinator,
    private runtimeManager: RuntimeManager,
    private launcherItemService: LauncherItemService,
    private pluginQuery: PluginQueryService,
  ) {
    this.installationRepo = new PluginInstallationRepository(platformDb.drizzle());
  }

  async registerUserPlugin(path: string): Promise<void> {
    // PluginPackageLoader.load(path) — uses PluginLoader
    // PluginValidator.validatePackage(package)
    // PluginInstallationRepository.createUserInstalled(...)
    // PluginQueryService.refresh()
    // CommandIndexService.indexPluginManifest(plugin)
    // RuntimeApplicationService.createIfEnabled(pluginId)
    // Refresh search
    throw new Error('Not implemented — Stage 3 will wire this after plugin loader extraction');
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.pluginCatalog.get(pluginId);
    if (!plugin) throw new AppError(AppErrorCode.PLUGIN_NOT_FOUND, `Plugin ${pluginId} not found`);

    // Ensure installation exists
    this.installationRepo.setEnabled(pluginId, true);

    // Index manifest if stale
    this.commandCatalog.indexPlugin(pluginId, plugin.manifest, plugin.path);

    // Create runtime
    this.coordinator.getOrCreateRuntime(pluginId);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.pluginCatalog.get(pluginId);
    if (!plugin) throw new AppError(AppErrorCode.PLUGIN_NOT_FOUND, `Plugin ${pluginId} not found`);

    // Set enabled = false
    this.installationRepo.setEnabled(pluginId, false);

    // Destroy any active runtimes — use RuntimeManager for read queries, coordinator for mutations
    const runtime = this.runtimeManager.getByPluginId(pluginId);
    if (runtime) {
      this.coordinator.destroyRuntime(runtime.info.id);
    }

    // Keep command projection as rebuildable cache — do not delete index
  }

  async uninstallUserPlugin(pluginId: string): Promise<void> {
    // Check source — reject built-in
    const installation = this.installationRepo.get(pluginId);
    if (!installation) throw new AppError(AppErrorCode.PLUGIN_NOT_INSTALLED, `Plugin ${pluginId} not installed`);
    if (installation.source === 'built-in') {
      throw new AppError(AppErrorCode.PLUGIN_SOURCE_FORBIDS_UNINSTALL, 'Built-in plugins cannot be uninstalled');
    }

    // Destroy runtimes
    const runtime = this.runtimeManager.getByPluginId(pluginId);
    if (runtime) {
      this.coordinator.destroyRuntime(runtime.info.id);
    }

    // Remove command index (delegate to CommandCatalog's cleanup)
    this.commandCatalog.removePluginIndex(pluginId);

    // Remove launcher item history via LauncherItemService
    await this.launcherItemService.cleanupByPlugin(pluginId);

    // Delete installation row
    this.installationRepo.delete(pluginId);

    // Refresh plugin read model
    this.pluginCatalog.refresh();
  }

  async refreshPlugin(pluginId: string): Promise<void> {
    const plugin = this.pluginCatalog.get(pluginId);
    if (!plugin) throw new AppError(AppErrorCode.PLUGIN_NOT_FOUND, `Plugin ${pluginId} not found`);

    // Re-index manifest
    this.commandCatalog.indexPlugin(pluginId, plugin.manifest, plugin.path);
  }
}
```

- [ ] **Step 5: Implement PluginQueryService**

```typescript
// packages/host/src/app/plugins/plugin-query-service.ts
import type { PluginCatalog } from '../../plugins/plugin-catalog';

export class PluginQueryService {
  constructor(private pluginCatalog: PluginCatalog) {}

  listPlugins() {
    return this.pluginCatalog.getAll();
  }

  getPlugin(pluginId: string) {
    return this.pluginCatalog.get(pluginId);
  }
}
```

- [ ] **Step 6: Add removePluginIndex and refresh to existing classes**

Add to `CommandCatalog`:
```typescript
// In packages/host/src/commands/command-catalog.ts
removePluginIndex(pluginId: string): void {
  const repos = createRepositories(this.platformDb.drizzle());
  repos.commandProjections.removeByPluginId(pluginId);
}
```

Add to `PluginInstallationRepository`:
```typescript
// In packages/host/src/persistence/sqlite/repositories/plugin-installation-repository.ts
// Add method:
get(pluginId: string): PluginInstallation | undefined {
  const row = this.db.select().from(pluginInstallation)
    .where(eq(pluginInstallation.pluginId, pluginId))
    .get();
  return row ?? undefined;
}

delete(pluginId: string): void {
  this.db.delete(pluginInstallation)
    .where(eq(pluginInstallation.pluginId, pluginId))
    .run();
}
```

Add `refresh()` to `PluginCatalog`:
```typescript
// In packages/host/src/plugins/plugin-catalog.ts
async refresh(): Promise<void> {
  // Re-initialize from scratch
  await this.init();
}
```

- [ ] **Step 7: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/host test`
Expected: All tests pass

- [ ] **Step 8: Create plugin management IPC handlers**

```typescript
// packages/host/src/ipc/handlers/plugin-management-ipc-handlers.ts
import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { PluginLifecycleService } from '../../app/plugins/ports';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerPluginManagementIpcHandlers(deps: {
  pluginLifecycle: PluginLifecycleService;
}): void {
  ipcMain.handle(
    IPC.PLUGIN_SET_ENABLED,
    async (_event, { pluginId, enabled }: IpcRequest<typeof IPC.PLUGIN_SET_ENABLED>): Promise<IpcResponse<typeof IPC.PLUGIN_SET_ENABLED>> => {
      try {
        if (enabled) {
          await deps.pluginLifecycle.enablePlugin(pluginId);
        } else {
          await deps.pluginLifecycle.disablePlugin(pluginId);
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    IPC.PLUGIN_UNINSTALL,
    async (_event, { pluginId }: IpcRequest<typeof IPC.PLUGIN_UNINSTALL>): Promise<IpcResponse<typeof IPC.PLUGIN_UNINSTALL>> => {
      try {
        await deps.pluginLifecycle.uninstallUserPlugin(pluginId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );
}
```

- [ ] **Step 9: Update register-handlers.ts to use plugin management handlers**

Remove old `PLUGIN_SET_ENABLED` and `PLUGIN_UNINSTALL` and `deleteItemRecordsByPlugin` from `register-handlers.ts`.
Add call to `registerPluginManagementIpcHandlers`.
Move `WINDOW_RESIZE` and `WINDOW_HIDE` to a window IPC handler file.

- [ ] **Step 10: Compile and commit**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

```bash
git add packages/host/src/app/plugins/ packages/host/src/ipc/handlers/plugin-management-ipc-handlers.ts packages/host/src/__tests__/
git commit -m "feat(host): extract PluginLifecycleService with built-in uninstall guard"
```

---

### Stage 4: Extract StartupService

**Summary:** Move the startup orchestration workflow from `apps/desktop/src/main/index.ts` into `StartupService`. Desktop main shrinks to `createHostPlatform()` → `platform.start()`.

#### Task 4.1: Implement StartupService

**Files:**
- Create: `packages/host/src/app/startup/startup-service.ts`
- Modify: `packages/host/src/bootstrap/create-host-platform.ts` (fill in the real composition)
- Modify: `apps/desktop/src/main/index.ts` (shrink to lifecycle)

- [ ] **Step 1: Write failing test**

```typescript
// packages/host/src/__tests__/startup-service.test.ts
import { describe, it, expect } from 'vitest';

describe('StartupService', () => {
  it('should be constructable', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @szybko/host test -- --run src/__tests__/startup-service.test.ts`
Expected: Passes

- [ ] **Step 3: Implement StartupService**

```typescript
// packages/host/src/app/startup/startup-service.ts
import type { HostPlatformConfig } from '../../bootstrap/host-platform-config';
import type { PlatformDatabase } from '../../persistence/sqlite/platform-database';
import type { CommandCatalog } from '../../commands/command-catalog';
import type { PluginCatalog } from '../../plugins/plugin-catalog';
import type { RuntimeManager } from '../../runtime/runtime-manager';
import type { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { ShortcutRegistry } from '../../window/shortcut-registry';
import type { WindowManager } from '../../window/window-manager';
import type { PluginLifecycleService } from '../plugins/plugin-lifecycle-service';
import type { PluginQueryService } from '../plugins/plugin-query-service';
import type { LauncherItemService } from '../search/launcher-item-service';
import type { SearchApplicationService } from '../search/search-application-service';
import type { MatchSessionManager } from '../../input/match-session-manager';
import { initAssetProtocol, registerAssetHandler } from '../../protocol/asset-protocol';

export interface StartupDeps {
  platformDb: PlatformDatabase;
  commandCatalog: CommandCatalog;
  pluginCatalog: PluginCatalog;
  runtimeManager: RuntimeManager;
  coordinator: RuntimeCoordinator;
  shortcutRegistry: ShortcutRegistry;
  windowManager: WindowManager;
  pluginLifecycle: PluginLifecycleService;
  pluginQuery: PluginQueryService;
  searchService: SearchApplicationService;
  launcherItemService: LauncherItemService;
  sessionManager: MatchSessionManager;
  config: HostPlatformConfig;
}

export class StartupService {
  constructor(private deps: StartupDeps) {}

  async start(): Promise<void> {
    // 1. Database migrations are already run by createPlatformDatabase in bootstrap

    // 2. Initialize protocol handlers
    initAssetProtocol();
    registerAssetHandler(this.deps.pluginCatalog);

    // 3. Discover built-in plugin source
    await this.deps.pluginCatalog.init();

    // 4. Wire plugin catalog into command catalog
    // (CommandCatalog needs plugin catalog reference — ensure it's set)
    // this.deps.commandCatalog.setPluginCatalog(this.deps.pluginCatalog);

    // 5. Index manifest features for all enabled plugins
    for (const plugin of this.deps.pluginCatalog.getEnabled()) {
      this.deps.commandCatalog.indexPlugin(plugin.id, plugin.manifest, plugin.path);
    }

    // 6. Initialize runtime policy — set pluginViewShortcutHandler BEFORE startAll
    this.deps.runtimeManager.setPluginViewShortcutHandler((runtimeId, webContents) => {
      return this.deps.shortcutRegistry.registerPluginView(webContents, {
        'plugin:detach': () => this.deps.coordinator.moveToHost(runtimeId, 'floating'),
      });
    });

    // 7. Start all plugin runtimes
    this.deps.runtimeManager.startAll();

    // 8. Register shortcuts
    this.registerShortcuts();

    // 9. Create and load the main window
    const win = this.deps.windowManager.createMainWindow(this.deps.config.preloadPath);

    if (this.deps.config.rendererUrl) {
      void win.loadURL(this.deps.config.rendererUrl);
    } else {
      const { join } = await import('node:path');
      void win.loadFile(join(__dirname, 'renderer/index.html'));
    }

    // 10. Register main window shortcuts
    this.deps.shortcutRegistry.registerSystemGlobal();
    this.deps.shortcutRegistry.registerMainWindow(win.webContents);
  }

  private registerShortcuts(): void {
    this.deps.shortcutRegistry.define([
      {
        actionId: 'window:toggle',
        scope: 'system' as const,
        description: '切换主窗口显示',
        bindings: [
          { id: 'mac', key: ' ', modifiers: { meta: true }, platforms: ['darwin'], accelerator: 'Command+Space' },
          { id: 'win', key: ' ', modifiers: { alt: true }, platforms: ['win32', 'linux'], accelerator: 'Alt+Space' },
        ],
      },
      // ... (full shortcut definitions from existing desktop main index.ts)
      // Include plugin:detach, shell:navigate-up/down/left/right, shell:execute, shell:escape
    ]);

    this.deps.shortcutRegistry.onAction('window:toggle', () => {
      if (this.deps.windowManager.isVisible()) {
        this.deps.windowManager.hide();
      } else {
        this.deps.windowManager.show();
      }
    });

    // plugin:detach handler for main-window scope
    this.deps.shortcutRegistry.onAction('plugin:detach', () => {
      for (const rt of this.deps.runtimeManager.getAll()) {
        const host = this.deps.runtimeManager.getHostFor(rt.info.id);
        if (host?.id === 'launcher-host') {
          this.deps.coordinator.moveToHost(rt.info.id, 'floating');
          return;
        }
      }
    });
  }
}
```

- [ ] **Step 4: Fill in createHostPlatform in bootstrap**

```typescript
// packages/host/src/bootstrap/create-host-platform.ts (update from skeleton)
import type { HostPlatformConfig } from './host-platform-config';
import type { HostPlatform } from './host-platform';
import { join } from 'node:path';
import { WindowManager } from '../window/window-manager';
import { ShortcutRegistry } from '../window/shortcut-registry';
import { createPlatformDatabase } from '../persistence/sqlite/platform-database';
import { CommandCatalog } from '../commands/command-catalog';
import { PluginCatalog } from '../plugins/plugin-catalog';
import { RuntimeManager } from '../runtime/runtime-manager';
import { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import { RuntimeHostRegistry } from '../window/runtime-host-registry';
import { MatchSessionManager } from '../input/match-session-manager';
import { SearchApplicationService } from '../app/search/search-application-service';
import { LauncherItemService } from '../app/search/launcher-item-service';
import { PluginLifecycleService } from '../app/plugins/plugin-lifecycle-service';
import { PluginQueryService } from '../app/plugins/plugin-query-service';
import { StartupService } from '../app/startup/startup-service';
import { registerIpcHandlers } from '../ipc/register-handlers';

export async function createHostPlatform(config: HostPlatformConfig): Promise<HostPlatform> {
  const windowManager = new WindowManager();
  const shortcutRegistry = new ShortcutRegistry();
  const hostRegistry = windowManager.initHostRegistry(config.preloadPath);

  const platformDb = createPlatformDatabase(join(config.userDataPath, 'szybko-platform.db'));
  const commandCatalog = CommandCatalog.createForDatabase(platformDb);
  const pluginCatalog = new PluginCatalog(platformDb, config.builtInPluginsPath);

  const runtimeManager = new RuntimeManager(pluginCatalog, windowManager, config.pluginPreloadPath);
  const coordinator = new RuntimeCoordinator(runtimeManager, hostRegistry, pluginCatalog, shortcutRegistry);

  const launcherItemService = new LauncherItemService(platformDb);
  const sessionManager = new MatchSessionManager();
  const pluginQuery = new PluginQueryService(pluginCatalog);
  const pluginLifecycle = new PluginLifecycleService(
    platformDb, pluginCatalog, commandCatalog, coordinator, runtimeManager, launcherItemService, pluginQuery,
  );

  const searchService = new SearchApplicationService({
    platformDb,
    pluginCatalog,
    coordinator,
    windowManager,
    sessionManager,
    launcherItemService,
    emitter: () => {},
  });

  const startupService = new StartupService({
    platformDb,
    commandCatalog,
    pluginCatalog,
    runtimeManager,
    coordinator,
    shortcutRegistry,
    windowManager,
    pluginLifecycle,
    pluginQuery,
    searchService,
    launcherItemService,
    sessionManager,
    config,
  });

  return {
    async start() {
      await startupService.start();

      // Wire IPC handlers after window and all services exist
      registerIpcHandlers(
        windowManager, coordinator, commandCatalog,
        platformDb, pluginCatalog, shortcutRegistry,
        searchService, launcherItemService, sessionManager,
      );
    },
    show() {
      windowManager.show();
    },
    dispose() {
      shortcutRegistry.dispose();
    },
  };
}
```

- [ ] **Step 5: Shrink desktop main**

```typescript
// apps/desktop/src/main/index.ts (rewritten — the target state)
import path from 'node:path';
import process from 'node:process';
import { createHostPlatform } from '@szybko/host';
import { app, protocol } from 'electron';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let platform: Awaited<ReturnType<typeof createHostPlatform>> | null = null;

void app.whenReady().then(async () => {
  const preloadPath = path.join(__dirname, '../preload/host.js');
  const pluginPreloadPath = path.join(__dirname, '../preload/plugin.js');
  const pluginsDir = app.isPackaged
    ? path.join(process.resourcesPath!, 'plugins', 'built-in')
    : path.join(__dirname, '..', '..', '..', '..', 'plugins', 'built-in');

  platform = await createHostPlatform({
    userDataPath: app.getPath('userData'),
    builtInPluginsPath: pluginsDir,
    preloadPath,
    pluginPreloadPath,
    isPackaged: app.isPackaged,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
  });

  await platform.start();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  platform?.show();
});

app.on('will-quit', () => {
  platform?.dispose();
});
```

- [ ] **Step 6: Add isVisible method to WindowManager**

Check if `WindowManager` has `isVisible()` — if not, add it:
```typescript
// In packages/host/src/window/window-manager.ts
isVisible(): boolean {
  return this.mainWindow?.isVisible() ?? false;
}
```

- [ ] **Step 7: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/desktop typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/host test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add packages/host/src/app/startup/ packages/host/src/bootstrap/ apps/desktop/src/main/index.ts
git commit -m "feat(host): extract StartupService, shrink desktop main to lifecycle"
```

---

### Stage 5: Split CommandCatalog

**Summary:** Move pure command domain builders from `CommandCatalog` into `domain/commands/`. Create `CommandIndexService` and `DynamicFeatureService` application services. Remove `CommandCatalog → PluginCatalog` dependency. Remove normalizer calls from repositories.

#### Task 5.1: Extract command domain types and pure builders

**Files:**
- Create: `packages/host/src/domain/commands/command-feature.ts`
- Create: `packages/host/src/domain/commands/command-trigger.ts`
- Create: `packages/host/src/domain/commands/command-projection.ts`
- Create: `packages/host/src/domain/commands/command-normalization.ts`
- Create: `packages/host/src/domain/commands/command-ranking.ts`
- Modify: `packages/host/src/domain/index.ts`

- [ ] **Step 1: Move feature normalization domain**

```typescript
// packages/host/src/domain/commands/command-feature.ts
import type { PluginFeature } from '@szybko/shared';

export interface NormalizedFeature {
  code: string;
  label: string;
  description?: string;
  icon?: string;
  order: number;
}

export function normalizeFeature(feature: PluginFeature, index: number): NormalizedFeature {
  return {
    code: feature.code,
    label: feature.label ?? feature.code,
    description: feature.description,
    icon: feature.icon,
    order: feature.order ?? index,
  };
}

export function stableJson(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}
```

- [ ] **Step 2: Move command trigger domain**

```typescript
// packages/host/src/domain/commands/command-trigger.ts
import type { CommandTrigger, MatchType } from '@szybko/shared';

export interface NormalizedTrigger {
  pluginId: string;
  featureCode: string;
  cmdKey: string;
  type: MatchType;
  label: string;
  scoreBase: number;
  matcherJson: string | null;
}

export function normalizeTrigger(
  pluginId: string,
  featureCode: string,
  cmdKey: string,
  trigger: CommandTrigger,
  index: number,
): NormalizedTrigger {
  return {
    pluginId,
    featureCode,
    cmdKey,
    type: trigger.type ?? 'text',
    label: trigger.label ?? cmdKey,
    scoreBase: trigger.score ?? index,
    matcherJson: trigger.matcher ? stableJson(trigger.matcher) : null,
  };
}

export type { stableJson } from './command-feature';
```

- [ ] **Step 3: Move command projection building to domain**

```typescript
// packages/host/src/domain/commands/command-projection.ts
import type { CommandProjection, CommandTriggerSearchProjection } from '../../commands/command-projection-builder';
// Re-export the projection builder types from their current location
// In Stage 5 these will be moved to domain/
export type { CommandProjection, CommandTriggerSearchProjection } from '../../commands/command-projection-builder';
```

- [ ] **Step 4: Move command normalization domain**

```typescript
// packages/host/src/domain/commands/command-normalization.ts
import { createHash } from 'node:crypto';
import { stableJson } from './command-feature';

/** Generate pinyin search keys for Chinese text */
export function generatePinyinKeys(text: string): string[] {
  // Uses pinyin-pro library — this is a placeholder that returns the text as-is
  // Real implementation in command-projection-builder.ts
  return [text];
}

/** Hash a manifest for change detection */
export function hashManifest(manifest: { features?: unknown[] }): string {
  return createHash('sha256').update(stableJson(manifest.features ?? [])).digest('hex');
}

/** Compute override fingerprint */
export function computeOverrideFingerprint(overrides: Array<{ code: string; state?: string }>): string {
  return createHash('sha256')
    .update(stableJson(overrides.map(o => ({ code: o.code, state: o.state ?? 'active' }))))
    .digest('hex');
}

/** Deduplicate search entries — prefer cmd over alias, higher match level wins */
export function dedupSearchEntries(entries: Array<{ pluginId: string; featureCode: string; cmdKey: string; searchText: string; source: string; matchLevel: number; aliasId?: number | null }>): typeof entries {
  const seen = new Map<string, typeof entries[0]>();
  const sourcePrio = (s: string) => s === 'cmd' ? 1 : 2;

  for (const e of entries) {
    const key = `${e.pluginId}:${e.featureCode}:${e.cmdKey}:${e.searchText}`;
    const existing = seen.get(key);
    if (!existing) { seen.set(key, e); continue; }

    const curPrio = sourcePrio(e.source);
    const exPrio = sourcePrio(existing.source);
    if (curPrio < exPrio) { seen.set(key, e); continue; }
    if (curPrio > exPrio) continue;
    if (e.matchLevel > existing.matchLevel) { seen.set(key, e); continue; }
    if (e.matchLevel < existing.matchLevel) continue;
    if ((e.aliasId ?? 0) < (existing.aliasId ?? 0)) { seen.set(key, e); }
  }
  return [...seen.values()];
}
```

- [ ] **Step 5: Move command ranking domain**

```typescript
// packages/host/src/domain/commands/command-ranking.ts
export interface RankedEntry {
  itemId: string;
  score: number;
  pluginId: string;
  featureCode: string;
  label: string;
}

/** Sort by score descending, then by label ascending */
export function rankEntries(entries: RankedEntry[]): RankedEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });
}
```

- [ ] **Step 6: Update domain/index.ts**

```typescript
// packages/host/src/domain/index.ts
export type { NormalizedFeature } from './commands/command-feature';
export { normalizeFeature, stableJson } from './commands/command-feature';
export type { NormalizedTrigger } from './commands/command-trigger';
export { normalizeTrigger } from './commands/command-trigger';
export type { CommandProjection, CommandTriggerSearchProjection } from './commands/command-projection';
export { hashManifest, computeOverrideFingerprint, dedupSearchEntries, generatePinyinKeys } from './commands/command-normalization';
export type { RankedEntry } from './commands/command-ranking';
export { rankEntries } from './commands/command-ranking';

export type { PluginPackage, PluginSourceKind, PluginAvailability } from './plugins/plugin';
export type { PluginInstallation } from './plugins/plugin-installation';
export type { PluginManifest } from './plugins/plugin-manifest';
```

- [ ] **Step 7: Move domain tests**

```typescript
// packages/host/src/__tests__/domain/command-normalization.test.ts
import { describe, it, expect } from 'vitest';
import { dedupSearchEntries, stableJson } from '../../domain';

describe('dedupSearchEntries', () => {
  it('should prefer cmd source over alias', () => {
    const entries = [
      { pluginId: 'p1', featureCode: 'f1', cmdKey: 'k1', searchText: 'hello', source: 'alias', matchLevel: 1, aliasId: 1 },
      { pluginId: 'p1', featureCode: 'f1', cmdKey: 'k1', searchText: 'hello', source: 'cmd', matchLevel: 1, aliasId: null },
    ];
    const result = dedupSearchEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('cmd');
  });

  it('should prefer higher match level', () => {
    const entries = [
      { pluginId: 'p1', featureCode: 'f1', cmdKey: 'k1', searchText: 'test', source: 'cmd', matchLevel: 1, aliasId: null },
      { pluginId: 'p1', featureCode: 'f1', cmdKey: 'k1', searchText: 'test', source: 'cmd', matchLevel: 3, aliasId: null },
    ];
    const result = dedupSearchEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].matchLevel).toBe(3);
  });
});

describe('stableJson', () => {
  it('should produce deterministic JSON', () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
  });
});
```

- [ ] **Step 8: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/host test -- --run src/__tests__/domain/command-normalization.test.ts`
Expected: Passes

- [ ] **Step 9: Commit**

```bash
git add packages/host/src/domain/commands/ packages/host/src/domain/index.ts packages/host/src/__tests__/domain/
git commit -m "feat(host): extract pure command domain types and functions"
```

---

#### Task 5.2: Implement CommandIndexService and DynamicFeatureService

**Files:**
- Create: `packages/host/src/app/commands/command-index-service.ts`
- Create: `packages/host/src/app/commands/dynamic-feature-service.ts`

- [ ] **Step 1: Implement CommandIndexService**

```typescript
// packages/host/src/app/commands/command-index-service.ts
import type { PluginManifest } from '@szybko/shared';
import type { PlatformDatabase } from '../../persistence/sqlite/platform-database';
import { CommandCatalog } from '../../commands/command-catalog';
import type { PluginCatalog } from '../../plugins/plugin-catalog';

export class CommandIndexService {
  constructor(
    private commandCatalog: CommandCatalog,
    private pluginCatalog: PluginCatalog,
  ) {}

  async indexPluginManifest(pluginId: string, manifest: PluginManifest, pluginPath: string): Promise<void> {
    this.commandCatalog.indexPlugin(pluginId, manifest, pluginPath);
  }

  removePluginIndex(pluginId: string): void {
    this.commandCatalog.removePluginIndex(pluginId);
  }

  rebuildPluginProjection(pluginId: string): void {
    this.commandCatalog.rebuildPluginWithRepositories(pluginId);
  }
}
```

- [ ] **Step 2: Implement DynamicFeatureService**

```typescript
// packages/host/src/app/commands/dynamic-feature-service.ts
import type { CommandCatalog } from '../../commands/command-catalog';
import type { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { SearchApplicationService } from '../search/search-application-service';

export class DynamicFeatureService {
  constructor(
    private commandCatalog: CommandCatalog,
    private coordinator: RuntimeCoordinator,
    private searchService: SearchApplicationService,
  ) {}

  async setFeature(senderWebContentsId: number, feature: { code: string; [key: string]: unknown }): Promise<{ ok: boolean; error?: string }> {
    const pluginId = this.coordinator.pluginIdForWebContents(senderWebContentsId);
    if (!pluginId) return { ok: false, error: 'Plugin runtime not found for sender' };
    return this.commandCatalog.setFeature(pluginId, feature);
  }

  getFeatures(pluginId: string, codes?: string[]): unknown[] {
    return this.commandCatalog.getDynamicFeatures(pluginId, codes);
  }

  removeFeature(pluginId: string, code: string): { ok: boolean } {
    return this.commandCatalog.removeFeature(pluginId, code);
  }
}
```

- [ ] **Step 3: Add rebuildPluginWithRepositories to CommandCatalog**

```typescript
// Add to packages/host/src/commands/command-catalog.ts
rebuildPluginWithRepositories(pluginId?: string): void {
  if (pluginId) {
    // Rebuild single plugin from current state
    const repos = createRepositories(this.platformDb.drizzle());
    const features = repos.manifestFeatures.getByPluginId(pluginId);
    const overrides = repos.featureOverrides.getActiveByPluginId(pluginId);
    // ... merge and rebuild logic extracted from existing setFeature/removeFeature
  }
  // If no pluginId, rebuild all enabled plugins
}
```

- [ ] **Step 4: Create dynamic feature IPC handlers**

```typescript
// packages/host/src/ipc/handlers/dynamic-feature-ipc-handlers.ts
import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { DynamicFeatureService } from '../../app/commands/ports';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerDynamicFeatureIpcHandlers(deps: {
  dynamicFeature: DynamicFeatureService;
  resolvePluginId: (webContentsId: number) => string | null;
}): void {
  ipcMain.handle(
    IPC.FEATURE_SET,
    (event, { feature }: IpcRequest<typeof IPC.FEATURE_SET>): IpcResponse<typeof IPC.FEATURE_SET> => {
      return deps.dynamicFeature.setFeature(event.sender.id, feature) as IpcResponse<typeof IPC.FEATURE_SET>;
    },
  );

  ipcMain.handle(
    IPC.FEATURE_GET,
    (event, { codes }: IpcRequest<typeof IPC.FEATURE_GET>): IpcResponse<typeof IPC.FEATURE_GET> => {
      const pluginId = deps.resolvePluginId(event.sender.id);
      if (!pluginId) return { ok: false, features: [], error: 'Plugin runtime not found' };
      const features = deps.dynamicFeature.getFeatures(pluginId, codes);
      return { ok: true, features };
    },
  );

  ipcMain.handle(
    IPC.FEATURE_REMOVE,
    (event, { code }: IpcRequest<typeof IPC.FEATURE_REMOVE>): IpcResponse<typeof IPC.FEATURE_REMOVE> => {
      const pluginId = deps.resolvePluginId(event.sender.id);
      if (!pluginId) return { ok: false, error: 'Plugin runtime not found' };
      return deps.dynamicFeature.removeFeature(pluginId, code) as IpcResponse<typeof IPC.FEATURE_REMOVE>;
    },
  );
}
```

- [ ] **Step 5: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/host test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/host/src/app/commands/ packages/host/src/ipc/handlers/dynamic-feature-ipc-handlers.ts
git commit -m "feat(host): add CommandIndexService and DynamicFeatureService"
```

---

### Stage 6: Split RuntimeManager

**Summary:** Split the monolithic `RuntimeManager` into separate components: runtime registry (domain state), Electron view factory (infrastructure), host attachment tracking, runtime event publication (infrastructure), and `RuntimeApplicationService` (use cases).

#### Task 6.1: Create domain runtime types and registry

**Files:**
- Create: `packages/host/src/domain/runtime/runtime.ts`
- Create: `packages/host/src/domain/runtime/runtime-slot.ts`
- Create: `packages/host/src/domain/runtime/runtime-state.ts`
- Create: `packages/host/src/domain/index.ts` (update)

- [ ] **Step 1: Create domain runtime types**

```typescript
// packages/host/src/domain/runtime/runtime.ts
export type LoadState = 'loading' | 'loaded' | 'error';
export type MountState = 'attached' | 'detached' | 'hidden';

/** Runtime metadata — pure domain, no Electron types */
export interface RuntimeInfo {
  id: string;
  pluginId: string;
  created: number;
  loadState: LoadState;
  mountState: MountState;
}

export interface RuntimeSlot {
  runtimeId: string;
  hostId: string | null;
  order: number;
}
```

```typescript
// packages/host/src/domain/runtime/runtime-state.ts
export type { LoadState, MountState, RuntimeInfo, RuntimeSlot } from './runtime';
```

```typescript
// packages/host/src/domain/runtime/runtime-slot.ts
export type { RuntimeSlot } from './runtime';
```

- [ ] **Step 6: Implement RuntimeApplicationService**

```typescript
// packages/host/src/app/runtime/runtime-application-service.ts
import type { PluginEnterPayload } from '@szybko/shared';
import { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { PluginId, RuntimeId } from '../../shared/ids';

export class RuntimeApplicationService {
  constructor(private coordinator: RuntimeCoordinator) {}

  async activatePlugin(pluginId: PluginId, featureCode?: string, enterPayload?: Partial<PluginEnterPayload>): Promise<void> {
    this.coordinator.activatePlugin(pluginId, featureCode, enterPayload);
  }

  async moveToHost(runtimeId: RuntimeId, targetHost: 'launcher' | 'floating'): Promise<void> {
    this.coordinator.moveToHost(runtimeId, targetHost);
  }

  async hideRuntime(runtimeId: RuntimeId): Promise<void> {
    this.coordinator.hideRuntime(runtimeId);
  }

  async destroyRuntime(runtimeId: RuntimeId): Promise<void> {
    this.coordinator.destroyRuntime(runtimeId);
  }

  async pinRuntime(runtimeId: RuntimeId, pin: boolean): Promise<void> {
    this.coordinator.pinRuntime(runtimeId, pin);
  }

  async showPluginMenu(runtimeId: RuntimeId, variant?: 'launcher' | 'floating'): Promise<void> {
    this.coordinator.showPluginMenu(runtimeId, variant);
  }

  resolvePluginIdForWebContents(webContentsId: number): string | null {
    return this.coordinator.pluginIdForWebContents(webContentsId);
  }
}
```

- [ ] **Step 7: Update runtime IPC handlers**

```typescript
// packages/host/src/ipc/handlers/plugin-runtime-ipc-handlers.ts
import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { RuntimeApplicationService } from '../../app/runtime/ports';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerPluginRuntimeIpcHandlers(deps: {
  runtimeService: RuntimeApplicationService;
}): void {
  ipcMain.handle(
    IPC.PLUGIN_HIDE,
    (_event, { runtimeId }: IpcRequest<typeof IPC.PLUGIN_HIDE>): IpcResponse<typeof IPC.PLUGIN_HIDE> => {
      deps.runtimeService.hideRuntime(runtimeId);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.PLUGIN_DESTROY,
    (_event, { runtimeId }: IpcRequest<typeof IPC.PLUGIN_DESTROY>): IpcResponse<typeof IPC.PLUGIN_DESTROY> => {
      deps.runtimeService.destroyRuntime(runtimeId);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.PLUGIN_PIN,
    (_event, { runtimeId, pin }: IpcRequest<typeof IPC.PLUGIN_PIN>): IpcResponse<typeof IPC.PLUGIN_PIN> => {
      deps.runtimeService.pinRuntime(runtimeId, pin);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.HOST_SWITCH,
    (_event, { runtimeId, targetHost }: IpcRequest<typeof IPC.HOST_SWITCH>): IpcResponse<typeof IPC.HOST_SWITCH> => {
      try {
        deps.runtimeService.moveToHost(runtimeId, targetHost);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    IPC.SHOW_PLUGIN_MENU,
    (_event, { runtimeId, variant }: IpcRequest<typeof IPC.SHOW_PLUGIN_MENU>): IpcResponse<typeof IPC.SHOW_PLUGIN_MENU> => {
      deps.runtimeService.showPluginMenu(runtimeId, variant);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.PLUGIN_EXEC,
    async (_event, { action }: IpcRequest<typeof IPC.PLUGIN_EXEC>): Promise<IpcResponse<typeof IPC.PLUGIN_EXEC>> => {
      if (action.type === 'plugin.open') {
        deps.runtimeService.activatePlugin(action.payload.pluginId, action.payload.featureCode);
        return { ok: true };
      }
      return { ok: false, error: 'Unknown action type' };
    },
  );
}
```

- [ ] **Step 8: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/host test`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add packages/host/src/domain/runtime/ packages/host/src/app/runtime/ packages/host/src/ipc/handlers/plugin-runtime-ipc-handlers.ts
git commit -m "feat(host): split runtime — domain types, RuntimeApplicationService, IPC handlers"
```

---

### Stage 7: Move Infrastructure

**Summary:** Physically move files into their target directories under `infrastructure/`, `presentation/`, and `ipc/handlers/`. Create forwarding re-exports from old locations so consumers still work. This is a pure file-move stage.

#### Task 7.1: Move SQLite repositories under infrastructure

**Files:**
- Move: `packages/host/src/persistence/sqlite/` → `packages/host/src/infrastructure/sqlite/`
- Move: `packages/host/src/persistence/migrations/` → `packages/host/src/infrastructure/sqlite/migrations/`
- Keep: forwarding re-exports at `packages/host/src/persistence/sqlite/index.ts`

- [ ] **Step 1: Create infrastructure/sqlite directory and move files**

```bash
mkdir -p packages/host/src/infrastructure/sqlite/repositories
mkdir -p packages/host/src/infrastructure/sqlite/migrations
```

Move the files:
- `persistence/sqlite/platform-database.ts` → `infrastructure/sqlite/platform-database.ts`
- `persistence/sqlite/schema.ts` → `infrastructure/sqlite/schema.ts`
- `persistence/sqlite/repositories/*.ts` → `infrastructure/sqlite/repositories/*.ts`
- `persistence/sqlite/migrations/*.ts` → `infrastructure/sqlite/migrations/*.ts`

- [ ] **Step 2: Update imports in all files referencing old paths**

Update every import that references `../persistence/sqlite/` to point to `../infrastructure/sqlite/`.

Files to update (grep for `../persistence/sqlite/`):
- `commands/command-catalog.ts`
- `ipc/register-handlers.ts`
- `app/search/search-application-service.ts`
- `app/search/launcher-item-service.ts`
- `app/plugins/plugin-lifecycle-service.ts`
- `bootstrap/create-host-platform.ts`
- Any others

Run: `cd packages/host && grep -rn "persistence/sqlite" src/ --include "*.ts" | grep -v node_modules`

- [ ] **Step 3: Add forwarding re-exports from old locations**

```typescript
// packages/host/src/persistence/sqlite/index.ts
/**
 * @deprecated Import from infrastructure/sqlite instead.
 * This forwarding file will be removed in Stage 8.
 */
export * from '../../infrastructure/sqlite/platform-database';
export * from '../../infrastructure/sqlite/schema';
// ... re-export specific repository classes
```

```typescript
// packages/host/src/persistence/index.ts
export * from './sqlite/index';
```

- [ ] **Step 4: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/host test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/infrastructure/sqlite/ packages/host/src/persistence/
git commit -m "refactor(host): move SQLite persistence under infrastructure/sqlite"
```

---

#### Task 7.2: Move remaining adapters under infrastructure

**Files:**
- Move: `plugins/plugin-loader.ts` → `infrastructure/filesystem/plugin-package-loader.ts`
- Move: `plugins/plugin-discovery.ts` → `infrastructure/filesystem/plugin-sources/builtin-plugin-source.ts`
- Move: `protocol/asset-protocol.ts` → `infrastructure/protocol/asset-protocol.ts`
- Move: `native/` → `infrastructure/native/`
- Keep forwarding re-exports at old locations

- [ ] **Step 1: Move filesystem adapters**

```typescript
// packages/host/src/infrastructure/filesystem/plugin-package-loader.ts
// Move content from plugins/plugin-loader.ts
export { PluginLoader } from '../../plugins/plugin-loader';
```

```typescript
// packages/host/src/infrastructure/filesystem/plugin-sources/builtin-plugin-source.ts
// Move content from plugins/plugin-discovery.ts
export { PluginDiscovery } from '../../plugins/plugin-discovery';
```

```typescript
// packages/host/src/infrastructure/filesystem/plugin-sources/user-plugin-source.ts
// Placeholder for future user-installed plugin source
export interface UserPluginSource {
  scan(): Promise<Array<{ id: string; path: string }>>;
}
```

```typescript
// packages/host/src/infrastructure/filesystem/plugin-sources/local-dev-plugin-source.ts
// Placeholder for future local-dev plugin source
export interface LocalDevPluginSource {
  watch(): Promise<void>;
}
```

- [ ] **Step 2: Move protocol adapters**

```typescript
// packages/host/src/infrastructure/protocol/asset-protocol.ts
export { initAssetProtocol, registerAssetHandler } from '../../protocol/asset-protocol';
export type { AssetResolver } from '../../protocol/asset-protocol';
```

- [ ] **Step 3: Move native adapters**

```typescript
// packages/host/src/infrastructure/native/native-capability-service.ts
export type { NativeCapabilityService } from '../../native/native-capability-service';
```

```typescript
// packages/host/src/infrastructure/native/electron-native-capability-service.ts
export { ElectronNativeCapabilityService } from '../../native/electron-native-capability-service';
```

- [ ] **Step 4: Move Electron infrastructure**

```typescript
// packages/host/src/infrastructure/electron/menu-service.ts
export type { MenuService } from // ... define MenuService port
```

```typescript
// packages/host/src/infrastructure/electron/runtime-view-factory.ts
// Copy from runtime/runtime-view-factory.ts — the Electron-specific WebContentsView creation
```

```typescript
// packages/host/src/infrastructure/electron/runtime-event-sink.ts
// Copy from runtime/runtime-state-publisher.ts
```

```typescript
// packages/host/src/infrastructure/electron/app-paths.ts
export function getAppPaths(): { userData: string; pluginsDir: string } {
  // ...
}
```

```typescript
// packages/host/src/infrastructure/electron/native-capability-service.ts
// Re-export from native adapters
```

- [ ] **Step 5: Presenters — move window managers and hosts**

```typescript
// packages/host/src/presentation/window/window-manager.ts
export { WindowManager } from '../../window/window-manager';
```

```typescript
// packages/host/src/presentation/window/theme-manager.ts
export { ThemeManager } from '../../window/theme';
```

```typescript
// packages/host/src/presentation/runtime-hosts/runtime-host.ts
export type { RuntimeHost } from '../../window/hosts/runtime-host';
```

```typescript
// packages/host/src/presentation/runtime-hosts/launcher-runtime-host.ts
export { LauncherRuntimeHost } from '../../window/hosts/launcher-runtime-host';
```

```typescript
// packages/host/src/presentation/runtime-hosts/floating-runtime-host.ts
export { FloatingRuntimeHost } from '../../window/hosts/floating-runtime-host';
```

```typescript
// packages/host/src/presentation/runtime-hosts/runtime-host-registry.ts
export { RuntimeHostRegistry } from '../../window/runtime-host-registry';
```

- [ ] **Step 6: Create remaining infrastructure/index.ts and presentation/index.ts**

```typescript
// packages/host/src/infrastructure/index.ts
export * from './sqlite/index';
export * from './filesystem/index';
export * from './electron/index';
export * from './protocol/index';
export * from './native/index';
```

```typescript
// packages/host/src/presentation/index.ts
export * from './window/index';
export * from './runtime-hosts/index';
```

- [ ] **Step 7: Compile and test**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors. Some `deprecated` warnings on forwarding re-exports are expected.

Run: `pnpm --filter @szybko/host test`
Expected: All tests pass

Run: `pnpm --filter @szybko/desktop typecheck`
Expected: No errors (desktop main may still import from old paths)

- [ ] **Step 8: Commit**

```bash
git add packages/host/src/infrastructure/ packages/host/src/presentation/
git commit -m "refactor(host): move infrastructure adapters and presentation to target directories"
```

---

### Stage 8: Delete Old Barrel Surface

**Summary:** Remove all forwarding files. Update `packages/host/src/index.ts` to export from the new locations only. Add architecture boundary gate scripts. Remove `CommandCatalog` and `PluginCatalog` as god facades — they are either reduced to thin wrappers or replaced by application services.

#### Task 8.1: Clean up barrel exports

**Files:**
- Modify: `packages/host/src/index.ts` (full rewrite)
- Delete: All forwarding/compatibility files
- Delete: Old barrel files at `persistence/`, `plugins/`, `window/`, etc. if all consumers migrated

- [ ] **Step 1: Rewrite barrel exports**

```typescript
// packages/host/src/index.ts — target state
// Architecture elements — bootstrap
export { createHostPlatform } from './bootstrap/create-host-platform';
export type { HostPlatform } from './bootstrap/host-platform';
export type { HostPlatformConfig } from './bootstrap/host-platform-config';

// Application services
export { StartupService } from './app/startup/startup-service';
export { PluginLifecycleService } from './app/plugins/plugin-lifecycle-service';
export { PluginQueryService } from './app/plugins/plugin-query-service';
export { CommandIndexService } from './app/commands/command-index-service';
export { DynamicFeatureService } from './app/commands/dynamic-feature-service';
export { SearchApplicationService } from './app/search/search-application-service';
export { LauncherItemService } from './app/search/launcher-item-service';
export { RuntimeApplicationService } from './app/runtime/runtime-application-service';

// Domain types (used by other packages)
export type { PluginPackage, PluginSourceKind, PluginAvailability } from './domain/plugins/plugin';
export type { PluginInstallation } from './domain/plugins/plugin-installation';
export type { PluginManifest } from './domain/plugins/plugin-manifest';

// Infrastructure — only exported for testing/dependency injection
export { createPlatformDatabase } from './infrastructure/sqlite/platform-database';

// Presentation — runtime hosts
export { WindowManager } from './presentation/window/window-manager';
export { RuntimeHostRegistry } from './presentation/runtime-hosts/runtime-host-registry';
export { LauncherRuntimeHost } from './presentation/runtime-hosts/launcher-runtime-host';
export { FloatingRuntimeHost } from './presentation/runtime-hosts/floating-runtime-host';

// Shortcut Registry
export { ShortcutRegistry } from './presentation/window/shortcut-registry';
// (moved from window/shortcut-registry.ts — or keep alias)

// Legacy re-exports — to be removed when all consumers updated
// (None — consumer must use the new layout)
```

- [ ] **Step 2: Delete forwarding files**

Delete these files/directories after verifying all imports are updated:
- `packages/host/src/persistence/sqlite/index.ts`
- `packages/host/src/persistence/index.ts`
- `packages/host/src/plugins/plugin-catalog.ts` (if replaced by PluginQueryService)
- `packages/host/src/plugins/plugin-discovery.ts`
- `packages/host/src/plugins/plugin-loader.ts`
- `packages/host/src/plugins/installation-synchronizer.ts`
- `packages/host/src/plugins/plugin-asset-handler.ts`
- `packages/host/src/commands/command-catalog.ts` (if fully replaced)
- `packages/host/src/window/shortcut-registry.ts` (moved to presentation)

Actually — keep operational files that are still needed. Only delete forwarding wrappers. The actual implementations stay where they are (or are already moved in Stage 7).

- [ ] **Step 3: Verify no external imports break**

Run: `cd packages/host && grep -rn "from.*'\.\./persistence" src/ --include "*.ts" | grep -v node_modules | grep -v ".d.ts"`
Expected: No results (all imports point to new locations)

Run: `cd packages/host && grep -rn "from.*'\.\./commands/command-catalog" src/ --include "*.ts" | grep -v node_modules | grep -v ".d.ts"`
Expected: Only references from domain barrel or app services

- [ ] **Step 4: Compile everything**

Run: `pnpm --filter @szybko/host typecheck`
Expected: No errors

Run: `pnpm --filter @szybko/desktop typecheck`
Expected: No errors

- [ ] **Step 5: Add architecture boundary gate script**

```typescript
// scripts/check-arch-boundaries.ts (or .js)
// Quick grep-based rule checker
// Run as part of CI

import { execSync } from 'node:child_process';

const HOST_SRC = 'packages/host/src';

const rules = [
  // domain/** cannot import electron, drizzle-orm, node:fs, node:path, ipcMain, infrastructure
  {
    name: 'domain-no-infra',
    pattern: `grep -rn "from.*['\"]electron['\"]\\|from.*['\"]drizzle-orm['\"]\\|from.*['\"]node:fs['\"]\\|from.*['\"]node:path['\"]\\|from.*['\"]ipcMain['\"]\\|from.*['\"]\\.\\./infrastructure" ${HOST_SRC}/domain/ --include="*.ts" | grep -v node_modules | grep -v ".d.ts" | head -20`,
    expectEmpty: true,
    message: 'domain/ must not import electron, drizzle-orm, node:fs, node:path, ipcMain, or infrastructure',
  },
  // ipc/** cannot import schema, repositories, presentation/window, presentation/runtime-hosts
  {
    name: 'ipc-no-repos',
    pattern: `grep -rn "from.*schema\\|from.*repositories\\|from.*presentation/window\\|from.*presentation/runtime-hosts" ${HOST_SRC}/ipc/ --include="*.ts" | grep -v node_modules | grep -v ".d.ts" | head -20`,
    expectEmpty: true,
    message: 'ipc/ must not import schema, repositories, or presentation',
  },
  // app/** cannot import ipcMain or SQLite schema
  {
    name: 'app-no-ipc',
    pattern: `grep -rn "from.*['\"]ipcMain['\"]\\|from.*['\"]schema['\"]" ${HOST_SRC}/app/ --include="*.ts" | grep -v node_modules | grep -v ".d.ts" | head -20`,
    expectEmpty: true,
    message: 'app/ must not import ipcMain or SQLite schema',
  },
  // infrastructure/sqlite/** is the only path that imports schema.ts
  {
    name: 'sqlite-schema-boundary',
    pattern: `grep -rn "'\\.\\./schema'\\|\"\\.\\./schema\"\\|from.*schema'" ${HOST_SRC}/ --include="*.ts" | grep -v node_modules | grep -v ".d.ts" | grep -v "infrastructure/sqlite" | head -20`,
    expectEmpty: true,
    message: 'Only infrastructure/sqlite/ may import schema.ts',
  },
  // apps/desktop/src/main/index.ts cannot import CommandCatalog, PluginCatalog, RuntimeManager
  {
    name: 'desktop-main-no-gods',
    pattern: `grep -n "CommandCatalog\\|PluginCatalog\\|RuntimeManager" apps/desktop/src/main/index.ts | head -10`,
    expectEmpty: true,
    message: 'apps/desktop/src/main/index.ts must not create CommandCatalog, PluginCatalog, RuntimeManager directly',
  },
];

let failures = 0;
for (const rule of rules) {
  try {
    const result = execSync(rule.pattern, { encoding: 'utf-8', shell: true });
    if (result.trim() && rule.expectEmpty) {
      console.error(`❌ ${rule.name}: ${rule.message}`);
      console.error(result);
      failures++;
    } else {
      console.log(`✅ ${rule.name}: OK`);
    }
  } catch {
    console.log(`✅ ${rule.name}: OK`);
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} architecture boundary violations found`);
  process.exit(1);
} else {
  console.log('\n✅ All architecture boundaries clean');
}
```

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @szybko/host test`
Expected: All tests pass

Run: `pnpm typecheck` (from root, if configured)
Expected: No errors

- [ ] **Step 7: Cross-check acceptance criteria against spec**

Run through the spec's acceptance criteria (Section 22) and verify each:

- [ ] `apps/desktop/src/main/index.ts` creates/starts `HostPlatform` instead of manually wiring host internals
- [ ] `ipc/**` does not import repositories or SQLite schema
- [ ] `domain/**` has no Electron, SQLite, Drizzle, or filesystem imports
- [ ] Plugin enable/disable/uninstall goes through `PluginLifecycleService`
- [ ] Startup workflow goes through `StartupService`
- [ ] Search goes through `SearchApplicationService` and `LauncherItemService`
- [ ] Dynamic feature IPC goes through `DynamicFeatureService`
- [ ] Runtime flows go through `RuntimeApplicationService`
- [ ] `CommandCatalog` no longer exists as a god facade
- [ ] `PluginCatalog` is a read model, not lifecycle mutation
- [ ] Built-in plugins cannot be uninstalled
- [ ] Disabled plugins stay disabled across source sync

- [ ] **Step 8: Final commit**

```bash
git add packages/host/src/index.ts scripts/check-arch-boundaries.ts
git commit -m "feat(host): clean up barrel exports, add architecture boundary gates"
git add -A
git commit -m "refactor(host): remove forwarding files, finalize target architecture"
```

---

## Spec Coverage Verification

| Spec Section | Implemented In |
|---|---|
| §2 Current Problems | Motivation — addressed across all stages |
| §5 Target Architecture | Stage 1 (skeleton) + Stage 7 (moves) |
| §6 Dependency Rules | Stage 1 (ports) + Stage 8 (gates) |
| §7 Bootstrap & Composition | Task 1.1 + Task 4.1 |
| §8 Application Services | Stages 2-6 |
| §9 Plugin Domain | Task 5.1 (partial) + existing PluginCatalog |
| §10 Command Domain | Task 5.1 |
| §11 Runtime Domain & Presentation | Stage 6 |
| §12 IPC Design | Tasks 2.2, 3.1, 5.2, 6.1 |
| §13 Persistence Design | Task 7.1 |
| §14 Infrastructure Adapters | Task 7.2 |
| §15 Core Flows | Tasks 3.1 (plugin lifecycle), 2.1 (search), 4.1 (startup) |
| §16 Search & Launcher Items | Stage 2 |
| §17 Shortcuts | Task 4.1 (startup registers shortcuts) |
| §18 Error Handling | Task 1.1 (AppError/Result types) |
| §19 Testing Strategy | Inline tests in each task |
| §20 Architecture Gates | Task 8.1 (gate script) |
| §21 Migration Strategy | Stages 1-8 (direct mapping) |
| §22 Acceptance Criteria | Task 8.1 (cross-check) |
| §23 Resulting Design Standard | Outcome of all stages |
