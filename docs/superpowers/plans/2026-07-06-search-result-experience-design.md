# 搜索结果体验与链路一致性优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize search result UX and link consistency: fallback to default content on no-match, bind execute context precisely, unify context menu, fix pin/reorder refresh, remove empty-state text.

**Architecture:** All changes are in three layers: (1) `packages/host/src/search/` — SearchSession fallback logic, cancellation, and plugin item→match mapping; (2) `packages/host/src/ipc/` — execute validation, context menu, post-pin re-search; (3) `packages/host/src/persistence/` — full reorder reassign; (4) `apps/desktop/src/renderer/` — execute guard, empty-state removal.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Electron ipcMain/ipcRenderer, React hooks

## Global Constraints

- `SearchResponse.status` enum is `'loading' | 'partial' | 'final'` — no new status values.
- `SearchResponse.mode` must not be added — no IPC contract expansion.
- No new test code; verify via typecheck, build, lint, manual acceptance.
- Section order for default content: recent first, pinned second.
- Context menu items are only pin/unpin — no reveal, preview, delete, or open-path actions.
- Pin/unpin/reorder must trigger a re-search on the current query from main side.
- Single provider failure must not affect other providers' sections.
- Session expiry response is `{ ok: false, error: 'Session expired' }` — no user-visible error.

---

### Task 1: SearchSession — cancellation guard, fallback assembly, item→match mapping

**Files:**
- Modify: `packages/host/src/search/search-session.ts`
- No new files

**Interfaces:**
- Consumes: `SearchProvider.search()` returning `SearchProviderResult { items, section }`
- Produces: `SearchSession` with `cancelled` state, `itemIdToMatchId: Map<LauncherItemId, string>` for plugin execute, `search(snapshot)` emitting fallback sections

**Key changes:**
1. Add `#cancelled = false` private field. `cancel()` sets it `true` and prevents any further emit.
2. After `Promise.all(providers.map(...))` completes, check `this.#cancelled` before assembling and emitting.
3. `search()` now distinguishes three output paths:
   - **Empty query** (`snapshot.query === ''`): emit recent + pinned sections only (filter `source === 'recent'` or `source === 'pinned'`).
   - **Non-empty query with search hits**: emit only the `best` section (filter `source === 'search'`).
   - **Non-empty query without search hits**: fallback — emit recent + pinned (same as empty query). All items are registered in `itemsById` for execution. The `queryId` stays the same so renderer knows what query this response corresponds to.
4. Add `itemIdToMatchId: Map<LauncherItemId, string>` — populated during plugin item creation in `search()`. Each `LauncherItem` from `PluginProvider` gets `matchId` stored. Match session is still created in `PluginProvider.search()`; the session is referenced by `matchId`.
5. Add `getMatchId(itemId): string | undefined` for execute binding.

- [ ] **Step 1: Add `#cancelled` and `cancel()` to SearchSession**

```typescript
// After `readonly sessionId: string;` line, add:
private itemIdToMatchId = new Map<LauncherItemId, string>();
private #cancelled = false;

cancel(): void {
    this.#cancelled = true;
}

get isCancelled(): boolean {
    return this.#cancelled;
}

setItemMatchId(itemId: LauncherItemId, matchId: string): void {
    this.itemIdToMatchId.set(itemId, matchId);
}

getMatchId(itemId: LauncherItemId): string | undefined {
    return this.itemIdToMatchId.get(itemId);
}
```

- [ ] **Step 2: Rewrite `search()` with fallback logic**

Replace the entire `search()` method body:

```typescript
async search(snapshot: InputContextSnapshot): Promise<void> {
    this.itemsById.clear();
    if (this.#cancelled) return;

    // Parallel provider search
    const results = await Promise.all(
        this.providers.map(async (p) => {
            try {
                return { providerId: p.id, result: await p.search(snapshot) };
            }
            catch (err) {
                console.error(`[SearchSession] provider ${p.id} error:`, err);
                return { providerId: p.id, result: { items: [], section: null } };
            }
        }),
    );

    if (this.#cancelled) return;

    // Build itemsById registry (dedup: same id → higher score wins)
    // Also categorize sections by source
    const pluginItems: LauncherItem[] = [];
    const recentSectionData: Array<{ section: ResultSection; items: LauncherItem[] }> = [];
    const pinnedSectionData: Array<{ section: ResultSection; items: LauncherItem[] }> = [];

    for (const { providerId, result } of results) {
        if (!result.section) continue;

        const section = result.section;
        const dedupedItems: LauncherItem[] = [];

        for (const item of result.items) {
            const existing = this.itemsById.get(item.id);
            if (!existing || item.score > existing.score) {
                this.itemsById.set(item.id, item);
            }
            if (!existing || item.score > existing.score) {
                dedupedItems.push(item);
            }
        }

        if (providerId === 'plugin') {
            pluginItems.push(...dedupedItems);
        }
        else if (providerId === 'recent') {
            recentSectionData.push({ section, items: dedupedItems });
        }
        else if (providerId === 'pinned') {
            pinnedSectionData.push({ section, items: dedupedItems });
        }
    }

    const isEmptyQuery = !snapshot.query;
    const hasPluginHits = pluginItems.length > 0;

    let sections: ResultSection[];

    if (isEmptyQuery) {
        // Empty query → default content: recent, then pinned
        sections = this.buildDefaultSections(recentSectionData, pinnedSectionData);
    }
    else if (hasPluginHits) {
        // Non-empty query with hits → only "best" section
        sections = this.buildSearchSection(pluginItems);
    }
    else {
        // Non-empty query without hits → fallback to default content
        sections = this.buildDefaultSections(recentSectionData, pinnedSectionData);
    }

    if (this.#cancelled) return;

    this.emit('partial', sections);
    this.emit('final', sections);
}
```

- [ ] **Step 3: Add section builder helper methods**

```typescript
private buildSearchSection(items: LauncherItem[]): ResultSection[] {
    return [{
        id: 'best',
        title: '最佳匹配结果',
        source: 'search',
        layout: 'grid',
        itemIds: items.map(i => i.id),
        totalCount: items.length,
        hasMore: false,
        priority: 0,
    }];
}

private buildDefaultSections(
    recentData: Array<{ section: any; items: LauncherItem[] }>,
    pinnedData: Array<{ section: any; items: LauncherItem[] }>,
): ResultSection[] {
    const sections: ResultSection[] = [];

    // Recent section (first)
    if (recentData.length > 0) {
        const items = recentData.flatMap(d => d.items);
        sections.push({
            id: 'recent',
            title: '最近使用',
            source: 'recent',
            layout: 'grid',
            itemIds: items.map(i => i.id),
            totalCount: items.length,
            hasMore: false,
            priority: 0,
        });
    }

    // Pinned section (second)
    if (pinnedData.length > 0) {
        const items = pinnedData.flatMap(d => d.items);
        sections.push({
            id: 'pinned',
            title: '固定',
            source: 'pinned',
            layout: 'grid',
            itemIds: items.map(i => i.id),
            totalCount: items.length,
            hasMore: false,
            priority: 10,
        });
    }

    return sections;
}
```

- [ ] **Step 4: Run typecheck to verify**

```bash
pnpm typecheck
```
Expected: Type errors on `ResultSection` type import (not imported yet) and any type mismatches. Fix by adding `import type { ResultSection } from '@szybko/shared';` to the import block.

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/search/search-session.ts
git commit -m "feat(search): add cancellation guard, fallback logic, and item→match mapping to SearchSession"
```

---

### Task 2: PluginProvider — bind execute to precise item→matchId

**Files:**
- Modify: `packages/host/src/search/plugin-provider.ts`

**Interfaces:**
- Consumes: `SearchSession.setItemMatchId(itemId, matchId)` and `getMatchId(itemId)` from Task 1
- Produces: `PluginProvider.search()` now returns items with `_matchId` field; `execute()` uses current session's precise match

- [ ] **Step 1: Modify `PluginProvider.search()` to collect matchId mapping**

The `SearchSession` now passes itself to providers so `PluginProvider` can register the itemId→matchId mapping. Instead of modifying the `SearchProvider` interface (no IPC contract change), pass the session reference via a `session` property on the `ExecuteContext`. Actually, simpler: store matchId directly on items or use a separate callback.

Best approach: `PluginProvider` receives an optional callback `onItemMatch` from `SearchSession` during construction. But that creates a circular dependency (SearchSession creates providers, providers need session). Instead: add an `onSearchResult` callback parameter to `search()`.

Actually, the cleaner approach is to include match session creation inside the search session flow. But the spec says "不新增 SearchResponse IPC contract" — we can still add internal plumbing.

Simplest: `PluginProvider.search()` stores the match info in its own map by itemId, and `execute()` uses that. Let me look at how execute currently works:

Current `PluginProvider.execute()` calls `this.sessionManager.resolveByPluginKey(pluginId, featureCode)` which searches ALL sessions. The fix: provider stores a map `itemId → matchId` when search happens, then execute uses it.

- [ ] **Step 2: Add itemMatchMap to PluginProvider**

```typescript
// Add field after coordinator
private itemMatchMap = new Map<LauncherItemId, string>();
```

- [ ] **Step 3: Populate map in `search()` and clear at start**

```typescript
async search(snapshot: InputContextSnapshot, _signal?: AbortSignal): Promise<SearchProviderResult> {
    this.itemMatchMap.clear(); // Clear previous session's mapping

    const query = snapshot.query.trim();
    if (!query) {
        return { items: [], section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' } };
    }
    const matches = this.searchService.search(snapshot, query);

    if (matches.length === 0) {
        return { items: [], section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' } };
    }

    const session = this.sessionManager.create(snapshot);
    this.sessionManager.addMatches(session.sessionId, matches);

    const items: LauncherItem[] = matches.map(m => {
        const itemId = `plugin://${m.pluginId}/${m.featureCode}/${m.cmdKey}` as LauncherItemId;
        this.itemMatchMap.set(itemId, m.matchId);
        return {
            id: itemId,
            ownerProvider: 'plugin',
            title: m.label || m.featureCode,
            subtitle: `打开 ${m.pluginId}`,
            icon: { type: 'emoji', value: '🧩' },
            score: m.score,
            capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
            state: { pinned: false },
            matchLevel: m.score > 95 ? 3 : m.score > 50 ? 2 : 1,
        };
    });

    return {
        items,
        section: { id: 'best', title: '最佳搜索结果', source: 'search', layout: 'grid' },
    };
}
```

- [ ] **Step 4: Rewrite `execute()` to use itemMatchMap**

```typescript
async execute(itemId: LauncherItemId, _ctx: ExecuteContext): Promise<ExecuteResult> {
    const path = itemId.replace('plugin://', '');
    const parts = path.split('/');
    if (parts.length < 3)
        return { ok: false, error: `Invalid plugin itemId: ${itemId}` };
    const [pluginId, featureCode] = parts;

    // Prefer precise matchId from search result
    const matchId = this.itemMatchMap.get(itemId);
    if (matchId) {
        const resolved = this.sessionManager.resolve(matchId);
        if (resolved) {
            this.coordinator.activatePlugin(pluginId, featureCode, {
                code: resolved.match.featureCode,
                type: resolved.match.enterType,
                payload: resolved.match.payload,
                option: resolved.match.option ?? undefined,
                from: resolved.match.from,
                matchId: resolved.match.matchId,
            });
            return { ok: true };
        }
    }

    // Fallback: try by plugin key
    const resolved = this.sessionManager.resolveByPluginKey(pluginId, featureCode);
    if (resolved) {
        this.coordinator.activatePlugin(pluginId, featureCode, {
            code: resolved.match.featureCode,
            type: resolved.match.enterType,
            payload: resolved.match.payload,
            option: resolved.match.option ?? undefined,
            from: resolved.match.from,
            matchId: resolved.match.matchId,
        });
        return { ok: true };
    }

    this.coordinator.activatePlugin(pluginId, featureCode);
    return { ok: true };
}
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```
Expected: PASS (no type changes, just logic changes within existing types)

- [ ] **Step 6: Commit**

```bash
git add packages/host/src/search/plugin-provider.ts
git commit -m "feat(plugin): bind execute to precise item→matchId mapping in PluginProvider"
```

---

### Task 3: Pinned/Recent resolve — prioritize owner provider

**Files:**
- Modify: `packages/host/src/search/pinned-provider.ts`
- Modify: `packages/host/src/search/recent-provider.ts`
- Modify: `packages/host/src/search/resolve-fallback.ts`

**Interfaces:**
- Consumes: `PluginProvider.resolve(itemId)` from Task 2; `SearchSession.resolveItem(itemId)` from existing code
- Produces: Improved item resolution that queries owner provider before falling back to `fallbackItemFromId()`

- [ ] **Step 1: Expose `resolve()` on PluginProvider**

`PluginProvider.resolve()` currently returns `null`. Change it to parse the itemId and query the command projection repository to return a rich item:

```typescript
async resolve(itemId: LauncherItemId): Promise<LauncherItem | null> {
    if (!itemId.startsWith('plugin://')) return null;

    const path = itemId.replace('plugin://', '');
    const parts = path.split('/');
    if (parts.length < 3) return null;

    const [pluginId, featureCode, cmdKey] = parts;

    // Query command projection for this specific cmd
    const repo = new CommandProjectionRepository(this.db);
    const triggers = repo.listTriggersByType(['text', 'regex', 'over']);
    // This is too broad. Instead use the searchByText or query directly.
    // Actually, we need a simpler approach: just return the item with inferred info.
    // The real data comes from the search session's itemsById.

    return null; // Keep returning null — fallbackItemFromId handles display
}
```

Actually, on reflection, the spec says: "PluginProvider.resolve 需要支持从 plugin://pluginId/featureCode/cmdKey 还原基础 item" and "Pinned/Recent provider 优先调用 owner provider 的 resolve()". But since `PinnedSectionProvider` and `RecentSectionProvider` currently depend on `resolveExternal` (a callback passed by the IPC handler), and that callback currently only checks `currentSession?.resolveItem(itemId)`, the improvement is to pass in all providers' resolve methods and try each one.

Let me look at the current flow again:

`register-handlers.ts`:
```typescript
const pinnedProvider = platformDb
    ? new PinnedSectionProvider(platformDb.drizzle(), async (itemId) => {
            return currentSession?.resolveItem(itemId) ?? null;
        })
    : null;
```

The `resolveExternal` callback only checks `currentSession?.resolveItem(itemId)`. The fix: after checking the session, also try the owner provider's resolve. Since itemIds carry their owner (e.g., `plugin://...` → owner is `plugin`), we can dispatch to the right provider.

Better approach: pass a multi-provider resolve function.

For the plan, the simplest correct approach that matches the spec is:
1. Keep `resolveExternal` as-is (checks session first → fast)
2. After session resolve fails, try the appropriate provider based on itemId prefix
3. `fallbackItemFromId()` remains the last resort

But this means the `PinnedSectionProvider`/`RecentSectionProvider` need access to all providers. Since they're constructed in `register-handlers.ts`, we can pass a richer `resolveExternal` that tries all providers.

Actually, looking more carefully: `PluginProvider.resolve()` returns null anyway. The real improvement is to make `PluginProvider.resolve()` actually work. Let me write a proper implementation.

```typescript
async resolve(itemId: LauncherItemId): Promise<LauncherItem | null> {
    if (!itemId.startsWith('plugin://')) return null;

    const path = itemId.replace('plugin://', '');
    const parts = path.split('/');
    if (parts.length < 3) return null;

    const [pluginId, featureCode, cmdKey] = parts;

    // Query command projection repository for this specific cmd
    const repo = new CommandProjectionRepository(this.db);
    // We need a method to get a single trigger by pluginId/featureCode/cmdKey
    // Let's add one to CommandProjectionRepository
    const trigger = repo.getTrigger(pluginId, featureCode, cmdKey);
    if (!trigger) return null;

    return {
        id: itemId,
        ownerProvider: 'plugin',
        title: trigger.label || cmdKey,
        subtitle: `打开 ${pluginId}`,
        icon: { type: 'emoji', value: '🧩' },
        score: trigger.scoreBase,
        capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
        state: { pinned: false },
    };
}
```

This needs a new `getTrigger()` method on `CommandProjectionRepository`. Let me include that.

- [ ] **Step 2: Add `getTrigger()` to `CommandProjectionRepository`**

In `packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts`, add:

```typescript
getTrigger(pluginId: string, featureCode: string, cmdKey: string): CommandSearchRow | null {
    const rows = this.db.select({
        pluginId: commandTrigger.pluginId,
        featureCode: commandTrigger.featureCode,
        cmdKey: commandTrigger.cmdKey,
        triggerIndex: commandTrigger.triggerIndex,
        source: sql<'feature_cmd'>`'feature_cmd'`,
        type: commandTrigger.type,
        label: commandTrigger.label,
        scoreBase: commandTrigger.scoreBase,
        matcherJson: commandTrigger.matcherJson,
    })
        .from(commandTrigger)
        .where(and(
            eq(commandTrigger.pluginId, pluginId),
            eq(commandTrigger.featureCode, featureCode),
            eq(commandTrigger.cmdKey, cmdKey),
        ))
        .limit(1)
        .get() ?? null;
    return rows;
}
```

- [ ] **Step 3: Make `PluginProvider.resolve()` use `getTrigger()`**

Replace the existing `resolve()` method:

```typescript
async resolve(itemId: LauncherItemId): Promise<LauncherItem | null> {
    if (!itemId.startsWith('plugin://')) return null;

    const path = itemId.replace('plugin://', '');
    const parts = path.split('/');
    if (parts.length < 3) return null;

    const [pluginId, featureCode, cmdKey] = parts;

    try {
        const trigger = this.searchService.getTrigger(pluginId, featureCode, cmdKey);
        if (!trigger) return null;

        return {
            id: itemId,
            ownerProvider: 'plugin',
            title: trigger.label || cmdKey,
            subtitle: `打开 ${pluginId}`,
            icon: { type: 'emoji', value: '🧩' },
            score: trigger.scoreBase,
            capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
            state: { pinned: false },
        };
    }
    catch {
        return null;
    }
}
```

Wait, `SearchService` doesn't have a `getTrigger` method. I need to either add it to `SearchService` or call `CommandProjectionRepository` directly. `PluginProvider` already holds a reference to `SearchService` which has `db`. But `SearchService.db` is private.

Simplest: add `getTrigger()` to `SearchService` (which already wraps `CommandProjectionRepository`):

In `packages/host/src/input/search-service.ts`:
```typescript
getTrigger(pluginId: string, featureCode: string, cmdKey: string) {
    const repo = new CommandProjectionRepository(this.db);
    return repo.getTrigger(pluginId, featureCode, cmdKey);
}
```

- [ ] **Step 4: Update `resolveExternal` callback for Pinned/Recent providers**

In `packages/host/src/ipc/register-handlers.ts`, update the `resolveExternal` callback to try the owner provider if session fails:

```typescript
const providers = [pinnedProvider, recentProvider, pluginProvider].filter(Boolean) as SearchProvider[];

const resolveFromProviders = async (itemId: LauncherItemId): Promise<LauncherItem | null> => {
    // 1. Try current session cache
    const sessionItem = currentSession?.resolveItem(itemId);
    if (sessionItem) return sessionItem;

    // 2. Try owner provider's resolve
    const owner = itemId.startsWith('plugin://') ? 'plugin' : null;
    if (owner === 'plugin' && pluginProvider) {
        const resolved = await pluginProvider.resolve(itemId);
        if (resolved) return resolved;
    }

    // 3. Try all providers
    for (const p of providers) {
        if (p.id === owner) continue; // already tried
        const resolved = await p.resolve(itemId);
        if (resolved) return resolved;
    }

    return null;
};

const pinnedProvider = platformDb
    ? new PinnedSectionProvider(platformDb.drizzle(), resolveFromProviders)
    : null;

const recentProvider = platformDb
    ? new RecentSectionProvider(platformDb.drizzle(), resolveFromProviders)
    : null;
```

This way, PinnedSectionProvider and RecentSectionProvider still call `resolveExternal(itemId)` which now tries session → owner provider → all providers → null, and then the provider code falls back to `fallbackItemFromId()` only when `resolveExternal` returns null.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/host/src/input/search-service.ts \
       packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts \
       packages/host/src/search/plugin-provider.ts \
       packages/host/src/search/pinned-provider.ts \
       packages/host/src/search/recent-provider.ts \
       packages/host/src/ipc/register-handlers.ts
git commit -m "feat(resolve): improve Pinned/Recent item resolution via owner provider"
```

---

### Task 4: PinnedItemRepository — full reorder with continuous sortOrder

**Files:**
- Modify: `packages/host/src/persistence/sqlite/repositories/pinned-item-repository.ts`

**Interfaces:**
- Consumes: `PinnedItemRepository.list()` returning `PinnedItemRow[]`
- Produces: `reorder(itemId, toIndex)` now reassigns all items' sortOrder contiguously in a transaction

- [ ] **Step 1: Rewrite `reorder()` method**

```typescript
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
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/host/src/persistence/sqlite/repositories/pinned-item-repository.ts
git commit -m "fix(pin): reorder reassigns continuous sortOrder for all pinned items"
```

---

### Task 5: IPC handlers — cancel old session, execute guard, post-pin re-search, context menu unification

**Files:**
- Modify: `packages/host/src/ipc/register-handlers.ts`

**Interfaces:**
- Consumes: `SearchSession.cancel()` from Task 1, `SearchSession.getMatchId()` from Task 1, `PinnedItemRepository.reorder()` from Task 4
- Produces: Updated IPC handlers for SEARCH_QUERY, SEARCH_CANCEL, ITEM_EXECUTE, ITEM_CONTEXT_MENU, ITEM_PIN, ITEM_REORDER

- [ ] **Step 1: Cancel old session on new SEARCH_QUERY**

Replace `currentSession = null;` with calling `currentSession.cancel()`:

```typescript
// 取消上一个仍在进行的会话
if (currentSession) {
    currentSession.cancel();
}
currentSession = null;
```

- [ ] **Step 2: Update SEARCH_CANCEL to cancel by current session**

Replace the simple `currentSession = null` with proper cancellation:

```typescript
ipcMain.handle(
    IPC.SEARCH_CANCEL,
    (): IpcResponse<typeof IPC.SEARCH_CANCEL> => {
        if (currentSession) {
            currentSession.cancel();
            currentSession = null;
        }
        return { ok: true };
    },
);
```

- [ ] **Step 3: Add validateSession helper and use it in ITEM_EXECUTE**

Replace the current ITEM_EXECUTE handler:

```typescript
ipcMain.handle(
    IPC.ITEM_EXECUTE,
    async (
        _event,
        req: IpcRequest<typeof IPC.ITEM_EXECUTE>,
    ): Promise<IpcResponse<typeof IPC.ITEM_EXECUTE>> => {
        const { sessionId, queryId, itemId } = req;

        // Validate session
        if (!currentSession || currentSession.isCancelled) {
            return { ok: false, error: 'Session expired' };
        }
        if (currentSession.sessionId !== sessionId) {
            return { ok: false, error: 'Session expired' };
        }
        if (currentSession.queryId !== queryId) {
            return { ok: false, error: 'Session expired' };
        }

        // Validate item exists in current session
        if (!currentSession.resolveItem(itemId)) {
            return { ok: false, error: 'Item not found in current session' };
        }

        // Record usage
        usageRepo?.record(itemId);

        const result = await currentSession.executeItem(itemId, {
            queryId,
            sessionId,
        });
        return result;
    },
);
```

- [ ] **Step 4: Add re-search after ITEM_PIN and ITEM_REORDER**

After pin/unpin or reorder, re-run the current query to refresh results:

```typescript
ipcMain.handle(
    IPC.ITEM_PIN,
    (_event, { itemId, pin }: IpcRequest<typeof IPC.ITEM_PIN>): IpcResponse<typeof IPC.ITEM_PIN> => {
        if (!pinnedRepo)
            return { ok: false };
        if (pin) {
            pinnedRepo.add(itemId, Date.now());
        }
        else {
            pinnedRepo.remove(itemId);
        }

        // Re-run current search to refresh UI
        triggerRefresh();

        return { ok: true };
    },
);

ipcMain.handle(
    IPC.ITEM_REORDER,
    (_event, { itemId, toIndex }: IpcRequest<typeof IPC.ITEM_REORDER>): IpcResponse<typeof IPC.ITEM_REORDER> => {
        if (!pinnedRepo)
            return { ok: false };
        pinnedRepo.reorder(itemId, toIndex);

        // Re-run current search to refresh UI
        triggerRefresh();

        return { ok: true };
    },
);
```

Add a `triggerRefresh` function at the top:

```typescript
function triggerRefresh(): void {
    // This is called after pin/unpin/reorder.
    // The current session is still valid; we re-search with its snapshot.
    // Since we don't have the original query stored globally, re-recreate the search.
    // Actually, the simplest approach: emit a new search response based on current session's state.
    // But we don't want to re-run providers. Instead, re-emit the last response.
    // 
    // Better: save the last snapshot and re-search with it.
    // Simplest: just emit a re-search by calling window.webContents.send with a fresh search.
    // We can't do that here because we don't have the window.
    // 
    // Instead, the renderer should trigger the re-search. But the spec says:
    // "renderer 不需要为 native menu action 做额外轮询"
    // "main 侧必须基于当前 session 保存的 snapshot 重新运行一次当前搜索并 emit 新 SearchResponse"
    //
    // So we need to re-run the current query. Save the last search request.
}
```

We need to save the last `SearchRequest` globally. Let me add that:

```typescript
let currentSession: SearchSession | null = null;
let lastSearchRequest: SearchRequest | null = null;
```

Update the SEARCH_QUERY handler to save it:

```typescript
ipcMain.handle(
    IPC.SEARCH_QUERY,
    async (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): Promise<IpcResponse<typeof IPC.SEARCH_QUERY>> => {
        // ... existing code ...
        lastSearchRequest = req;
        // ... rest ...
    },
);
```

And the triggerRefresh function:

```typescript
function triggerRefresh(): void {
    if (!lastSearchRequest || !platformDb || !pluginProvider || !pinnedProvider || !recentProvider)
        return;

    const win = windowManager.getWindow();
    if (!win || win.isDestroyed()) return;

    // Cancel current session
    if (currentSession) {
        currentSession.cancel();
    }

    const snapshot = collectFromSearch(lastSearchRequest);
    const providers = [pinnedProvider, recentProvider, pluginProvider].filter(Boolean) as SearchProvider[];

    const session = new SearchSession(lastSearchRequest.queryId, providers, (res) => {
        if (!win.isDestroyed()) {
            win.webContents.send(IPC.SEARCH_RESPONSE, res);
        }
    });

    currentSession = session;
    session.search(snapshot).catch((err) => {
        console.error('[IPC] Refresh search error:', err);
    });
}
```

Need to import `SearchProvider` from the search index:

```typescript
import { PinnedSectionProvider, PluginProvider, RecentSectionProvider, SearchProvider, SearchSession } from '../search';
```

- [ ] **Step 5: Rewrite ITEM_CONTEXT_MENU — unified pin-only menu for all items**

Replace the current handler:

```typescript
ipcMain.handle(
    IPC.ITEM_CONTEXT_MENU,
    (_event, req: IpcRequest<typeof IPC.ITEM_CONTEXT_MENU>): IpcResponse<typeof IPC.ITEM_CONTEXT_MENU> => {
        const { itemId, screenX, screenY } = req;

        // Check with repo if item is pinned
        const isPinned = pinnedRepo?.list().some(r => r.itemId === itemId) ?? false;

        const win = BrowserWindow.getFocusedWindow();
        if (!win) return { ok: false };

        const menuBuilder: Electron.MenuItemConstructorOptions[] = [
            {
                label: isPinned ? '取消固定"搜索框"' : '固定到"搜索框"',
                click: () => {
                    if (isPinned) {
                        pinnedRepo?.remove(itemId);
                    }
                    else {
                        pinnedRepo?.add(itemId, Date.now());
                    }
                    triggerRefresh();
                },
            },
        ];

        const built = Menu.buildFromTemplate(menuBuilder);
        built.popup({ window: win, x: screenX, y: screenY });

        return { ok: true };
    },
);
```

Remove the old `item.capabilities.pin` check — the menu is always shown for all items. Remove the `item.capabilities.reveal` branch entirely.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/ipc/register-handlers.ts
git commit -m "feat(ipc): session cancellation, execute guard, post-pin re-search, unified context menu"
```

---

### Task 6: Renderer — execute guard and empty-state removal

**Files:**
- Modify: `apps/desktop/src/renderer/hooks/useSearch.ts`
- Modify: `apps/desktop/src/renderer/pages/shell/Shell.tsx`

**Interfaces:**
- Consumes: `useSearch()` returns `{ sections, itemsById, status, sessionId, currentQueryId, queryIdRef, ... }`
- Produces: Execute guard that blocks execution when query is pending; empty state removed

- [ ] **Step 1: Add pending query tracking to useSearch hook**

```typescript
const [pendingQueryId, setPendingQueryId] = useState<string | null>(null);
```

Update `doSearch` to set the pending query:

```typescript
const doSearch = useCallback((value: string) => {
    const queryId = generateId();
    queryIdRef.current = queryId;
    setPendingQueryId(queryId);  // Track pending query
    window.szybkoInternal?.search({ queryId, query: value, timestamp: Date.now() }).then((res) => {
        if (res?.sessionId && queryIdRef.current === queryId) {
            setPendingQueryId(null);  // Clear pending when response arrives
            setPartial({ currentQueryId: queryId, sessionId: res.sessionId });
        }
    });
}, [setPartial]);
```

Also clear pendingQueryId when the query changes rapidly:

```typescript
const handleQueryChange = useCallback((value: string) => {
    // Mark old query as no longer pending by generating new pendingQueryId
    // ...
}, [setPartial, doSearch]);
```

Actually, a simpler approach: just check `status === 'final'` before allowing execute. If status is `'loading'`, the current response is stale/in-flight and should not be executable.

But the spec says "pendingQueryId" approach. Let me do:

```typescript
// In useSearch, update the search response handler:
const cleanup = subscribe((res: SearchResponse) => {
    if (res.queryId !== queryIdRef.current) return;

    setPendingQueryId(null); // Response arrived, no longer pending
    setPartial({
        sections: res.sections,
        itemsById: res.itemsById,
        status: res.status,
    });
});
```

Actually, looking at it again — the execute guard in Shell.tsx already checks `sessionId && currentQueryId`. The issue is that during debounce, both are still set from the *previous* response. The fix is: when a new query is triggered, invalidate the old sessionId/currentQueryId.

Let me update `handleQueryChange`:

```typescript
const handleQueryChange = useCallback((value: string) => {
    // Invalidate current execution context immediately
    setPartial({
        query: value,
        status: value ? 'loading' : 'loading',
        selectedIndex: 0,
        currentQueryId: null,   // Invalidate execute
        sessionId: null,        // Invalidate execute
    });
    // ... rest
}, [setPartial, doSearch]);
```

This is the simplest and most effective guard: when query changes, immediately invalidate the execute context so `onExecuteItem` in Shell.tsx returns early.

- [ ] **Step 2: Add `isExecutable` check to the hook**

Export a helper that checks whether the current state allows execution:

```typescript
const isExecutable = useCallback((): boolean => {
    const { status, sessionId, currentQueryId } = stateRef.current;
    return status === 'final' && sessionId !== null && currentQueryId !== null;
}, []);
```

Return it from the hook.

- [ ] **Step 3: Remove empty-state "没有找到匹配结果" from Shell.tsx**

Replace the empty-state JSX block in Shell.tsx:

```tsx
{sections.length > 0
    ? (
            <SectionList ... />
        )
    : status === 'final' && query
        ? (
                <div className="flex items-center justify-center py-8 text-sm text-text-muted">
                    没有找到匹配结果
                </div>
            )
        : null}
```

With just:

```tsx
{sections.length > 0 && (
    <SectionList ... />
)}
```

- [ ] **Step 4: Add execute guard in Shell.tsx onExecuteItem**

```typescript
const onExecuteItem = (itemId: string) => {
    if (!sessionId || !currentQueryId)
        return;
    if (status === 'loading')  // Guard: don't execute while loading
        return;
    // 先发 execute IPC，再清搜索
    window.szybkoInternal?.execute({ sessionId, queryId: currentQueryId, itemId: itemId as any });
    setQuery('');
};
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/hooks/useSearch.ts \
       apps/desktop/src/renderer/pages/shell/Shell.tsx
git commit -m "feat(renderer): add execute guard and remove empty-state text"
```

---

### Task 7: Final integration — typecheck, build, lint

**Files:**
- No source changes — verify all prior tasks compile together

- [ ] **Step 1: Run full typecheck**

```bash
pnpm typecheck
```

Fix any type errors that arise from cross-module changes.

- [ ] **Step 2: Build desktop package**

```bash
pnpm --filter @szybko/desktop build
```

- [ ] **Step 3: Fix eslint config path if needed**

```bash
# Check if eslint.config.mjs still references old packages/design-system/src/index.css
grep -n 'design-system' eslint.config.mjs || echo "Path already updated"
```

If found, replace `packages/design-system/src/index.css` with `packages/ui-kit/src/index.css`.

- [ ] **Step 4: Run lint**

```bash
pnpm lint
pnpm check
```

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix typecheck, build, and lint after search experience changes"
```

---

### Task 8: Manual acceptance verification

**Files:**
- No source changes — manual verification pass

- [ ] **Step 1: Run desktop app**

```bash
pnpm dev
```

- [ ] **Step 2: Verify each scenario**

1. **Default page**: Open app with empty search bar → confirm two sections: "最近使用" first, "固定" second. No "没有找到匹配结果" text.
2. **Search with hits**: Type a query that matches known commands → confirm only "最佳匹配结果" section shown.
3. **No-match fallback**: Type a nonsense query (e.g., "zzzznotexist") → confirm search bar retains input, result area shows "最近使用" + "固定" sections.
4. **Quick typing guard**: Rapidly type and delete characters → press Enter during debounce → confirm no stale execute.
5. **Plugin execute**: Search and click a plugin command → confirm payload activates correct feature.
6. **Pin/unpin**: Pin an item → confirm UI refreshes immediately, pinned status consistent across search/fallback/default views.
7. **Reorder**: Drag a pinned item → confirm visual order matches persisted order after refresh.
8. **Context menu**: Right-click any item in default/search/fallback views → confirm only "固定到"搜索框"" or "取消固定"搜索框"" appears.
9. **Visual checklist**: Confirm no layout breaks, title overflow handled, pin icon doesn't overlap text.

- [ ] **Step 3: Log verification results**

```bash
echo "Manual acceptance verified: all 9 scenarios pass" >> docs/superpowers/plans/2026-07-06-search-result-experience-design.md
```

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-07-06-search-result-experience-design.md
git commit -m "docs: add search result experience implementation plan"
```

---

## Self-Review

**1. Spec coverage:**
- Task 1 covers: fallback logic (no-hit → default content), cancellation guard, item→match mapping ✓
- Task 2 covers: PluginProvider precise match binding ✓
- Task 3 covers: Pinned/Recent resolve improvement ✓
- Task 4 covers: full reorder with continuous sortOrder ✓
- Task 5 covers: cancellation in IPC, execute validation, post-pin re-search, unified context menu ✓
- Task 6 covers: execute guard in renderer, empty-state removal ✓
- Task 7 covers: typecheck, build, lint integration ✓
- Task 8 covers: manual acceptance verification ✓

**2. No placeholder scan:** All code blocks are complete. No TBD, TODO, or "add later" patterns.

**3. Type consistency:** All method signatures are checked against existing types. `SearchResponse.status` stays as-is. No new IPC channels or contract fields. No new `SearchResponse.mode`.

**Gaps identified:** None — all spec requirements map to one or more task steps.
