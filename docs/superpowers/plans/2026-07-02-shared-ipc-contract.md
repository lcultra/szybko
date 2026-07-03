# Shared IPC Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Internally modularize `@szybko/shared` and make IPC payload types derive from a single shared contract across preload and main process code.

**Architecture:** `packages/shared/src` will be grouped by domain while preserving root imports from `@szybko/shared`. IPC payloads will live in `shared/src/ipc/contract.ts`; preload helpers and main handlers will consume that contract while facade APIs remain in `shared/src/api`.

**Tech Stack:** TypeScript 6, Electron 43, electron-vite 6 beta, pnpm workspace.

## Global Constraints

- Keep preload as the security boundary. Renderer and plugin pages must not access `ipcRenderer` directly.
- Keep facade APIs separate from IPC contracts.
- Keep public imports stable: callers continue importing from `@szybko/shared`.
- Do not add runtime schema validation in this phase.
- Do not change IPC channel strings.
- Do not change frontend/plugin API method names or argument shapes.
- Do not add `@szybko/shared/*` subpath exports.
- Do not change business behavior in search, window control, plugin runtime, or action execution.

---

## File Structure

- Create `packages/shared/src/api/internal.ts`: `SzybkoInternalApi`.
- Create `packages/shared/src/api/plugin.ts`: `SzybkoPluginApi`.
- Create `packages/shared/src/api/index.ts`: re-export API facade types.
- Create `packages/shared/src/ipc/channels.ts`: existing `IPC`.
- Create `packages/shared/src/ipc/contract.ts`: invoke and event payload contracts.
- Create `packages/shared/src/ipc/index.ts`: re-export IPC modules.
- Create `packages/shared/src/search/types.ts`: search/action types.
- Create `packages/shared/src/search/index.ts`: re-export search types.
- Create `packages/shared/src/plugin/types.ts`: plugin manifest types.
- Create `packages/shared/src/plugin/index.ts`: re-export plugin types.
- Create `packages/shared/src/runtime/types.ts`: runtime/host types.
- Create `packages/shared/src/runtime/index.ts`: re-export runtime types.
- Create `packages/shared/src/constants/window.ts`, `search.ts`, `plugin.ts`, `index.ts`: split constants by domain.
- Modify `packages/shared/src/index.ts`: root re-export only from grouped modules.
- Delete old flat shared files after imports are moved: `api-types.ts`, `ipc-channels.ts`, `search-types.ts`, `plugin-types.ts`, `runtime-types.ts`, `constants.ts`.
- Modify `apps/desktop/src/preload/api/ipc.ts`: derive helpers from shared IPC contract.
- Modify `apps/desktop/src/preload/api/plugin-lifecycle.ts`: use typed `send()` for plugin search results.
- Modify `packages/host/src/ipc-handlers.ts`: derive request/response/event types from shared IPC contract.
- Modify `packages/host/src/runtime-manager.ts`: use `SearchRequest` and `PluginSearchContext`.

### Task 1: Modularize Shared Package Without Behavior Changes

**Files:**
- Create: `packages/shared/src/api/internal.ts`
- Create: `packages/shared/src/api/plugin.ts`
- Create: `packages/shared/src/api/index.ts`
- Create: `packages/shared/src/search/types.ts`
- Create: `packages/shared/src/search/index.ts`
- Create: `packages/shared/src/plugin/types.ts`
- Create: `packages/shared/src/plugin/index.ts`
- Create: `packages/shared/src/runtime/types.ts`
- Create: `packages/shared/src/runtime/index.ts`
- Create: `packages/shared/src/ipc/channels.ts`
- Create: `packages/shared/src/ipc/index.ts`
- Create: `packages/shared/src/constants/window.ts`
- Create: `packages/shared/src/constants/search.ts`
- Create: `packages/shared/src/constants/plugin.ts`
- Create: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/src/index.ts`
- Delete: `packages/shared/src/api-types.ts`
- Delete: `packages/shared/src/search-types.ts`
- Delete: `packages/shared/src/plugin-types.ts`
- Delete: `packages/shared/src/runtime-types.ts`
- Delete: `packages/shared/src/ipc-channels.ts`
- Delete: `packages/shared/src/constants.ts`

**Interfaces:**
- Consumes existing root exports from `@szybko/shared`.
- Produces the same root exports from grouped modules.

- [ ] **Step 1: Move search types into `search/types.ts`**

Create `packages/shared/src/search/types.ts` with the current contents of `packages/shared/src/search-types.ts`.

- [ ] **Step 2: Add `search/index.ts`**

```ts
export * from './types';
```

- [ ] **Step 3: Move plugin types into `plugin/types.ts`**

Create `packages/shared/src/plugin/types.ts` with the current contents of `packages/shared/src/plugin-types.ts`.

- [ ] **Step 4: Add `plugin/index.ts`**

```ts
export * from './types';
```

- [ ] **Step 5: Move runtime types into `runtime/types.ts`**

Create `packages/shared/src/runtime/types.ts` and update its import to:

```ts
import type { PluginManifest } from '../plugin/types';
```

The rest of the file should match the current `runtime-types.ts`.

- [ ] **Step 6: Add `runtime/index.ts`**

```ts
export * from './types';
```

- [ ] **Step 7: Split API facade types**

Create `packages/shared/src/api/plugin.ts`:

```ts
import type { ActionDescriptor, PluginSearchContext, SearchResult } from '../search/types';

export interface SzybkoPluginApi {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') => Promise<{ ok: boolean; hostId: string }>;
    onRuntimeStateChanged: (cb: (state: unknown) => void) => () => void;
    onSearch: (cb: (ctx: PluginSearchContext) => SearchResult[]) => () => void;
    onPluginEnter: (cb: (payload: unknown) => void) => () => void;
}
```

Create `packages/shared/src/api/internal.ts`:

```ts
import type { SearchBatch, SearchRequest } from '../search/types';

export interface SzybkoInternalApi {
    search: (req: SearchRequest) => Promise<{ ok: boolean }>;
    searchCancel: (queryId: string) => Promise<{ ok: boolean }>;
    resizeWindow: (height: number) => Promise<{ ok: boolean }>;
    hideWindow: () => Promise<{ ok: boolean }>;
    onSearchBatch: (cb: (batch: SearchBatch) => void) => () => void;
    onShowMainWindow: (cb: () => void) => () => void;
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => () => void;
}
```

- [ ] **Step 8: Add `api/index.ts`**

```ts
export * from './internal';
export * from './plugin';
```

- [ ] **Step 9: Move IPC channels**

Create `packages/shared/src/ipc/channels.ts` with the current contents of `packages/shared/src/ipc-channels.ts`.

- [ ] **Step 10: Add `ipc/index.ts`**

```ts
export * from './channels';
```

- [ ] **Step 11: Split constants**

Create `packages/shared/src/constants/window.ts`:

```ts
export const DEFAULT_WINDOW_WIDTH = 820;
export const MIN_WINDOW_HEIGHT = 96;
export const MAX_WINDOW_HEIGHT = 520;
export const WINDOW_TOP_OFFSET_RATIO = 1 / 3;
```

Create `packages/shared/src/constants/search.ts`:

```ts
export const SEARCH_DEBOUNCE_MS = 80;
```

Create `packages/shared/src/constants/plugin.ts`:

```ts
export const PLUGIN_SEARCH_TIMEOUT_MS = 5000;
```

Create `packages/shared/src/constants/index.ts`:

```ts
export * from './plugin';
export * from './search';
export * from './window';
```

- [ ] **Step 12: Update root `index.ts`**

Replace `packages/shared/src/index.ts` with:

```ts
export * from './api/index';
export * from './constants/index';
export * from './ipc/index';
export * from './plugin/index';
export * from './runtime/index';
export * from './search/index';
```

- [ ] **Step 13: Delete old flat files**

Delete:

```text
packages/shared/src/api-types.ts
packages/shared/src/constants.ts
packages/shared/src/ipc-channels.ts
packages/shared/src/plugin-types.ts
packages/shared/src/runtime-types.ts
packages/shared/src/search-types.ts
```

- [ ] **Step 14: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If imports fail, fix only relative imports inside `packages/shared/src`; external callers should still import from `@szybko/shared`.

- [ ] **Step 15: Commit**

```bash
git add packages/shared/src
git commit -m "refactor(shared): group shared contracts by domain"
```

### Task 2: Add Shared IPC Contract

**Files:**
- Create: `packages/shared/src/ipc/contract.ts`
- Modify: `packages/shared/src/ipc/index.ts`

**Interfaces:**
- Consumes: `IPC`, `SearchRequest`, `SearchBatch`, `PluginSearchContext`, `ActionDescriptor`.
- Produces: `IpcInvokeContract`, `IpcMainToRendererEventContract`, `IpcRendererToMainEventContract`.

- [ ] **Step 1: Create IPC contract**

Create `packages/shared/src/ipc/contract.ts`:

```ts
import type { ActionDescriptor, PluginSearchContext, SearchBatch, SearchRequest } from '../search/types';
import { IPC } from './channels';

export interface IpcInvokeContract {
    [IPC.SEARCH_QUERY]: {
        request: SearchRequest;
        response: { ok: boolean };
    };
    [IPC.SEARCH_CANCEL]: {
        request: string;
        response: { ok: boolean };
    };
    [IPC.WINDOW_RESIZE]: {
        request: { height: number };
        response: { ok: boolean };
    };
    [IPC.WINDOW_HIDE]: {
        request: void;
        response: { ok: boolean };
    };
    [IPC.PLUGIN_EXEC]: {
        request: { action: ActionDescriptor };
        response: { ok: boolean; result?: unknown; error?: string };
    };
    [IPC.HOST_SWITCH]: {
        request: { pluginId: string; targetHost: 'launcher' | 'floating' };
        response: { ok: boolean; hostId?: string; error?: string };
    };
}

export interface IpcMainToRendererEventContract {
    [IPC.SEARCH_BATCH]: SearchBatch;
    [IPC.WINDOW_SHOW]: void;
    [IPC.THEME_CHANGED]: { isDark: boolean };
    [IPC.PLUGIN_RUNTIME_STATE]: unknown;
    [IPC.PLUGIN_SEARCH]: PluginSearchContext;
    [IPC.PLUGIN_ENTER]: unknown;
}

export interface IpcRendererToMainEventContract {
    [IPC.PLUGIN_SEARCH_RESULT]: SearchBatch;
}
```

- [ ] **Step 2: Export contract**

Update `packages/shared/src/ipc/index.ts`:

```ts
export * from './channels';
export * from './contract';
```

- [ ] **Step 3: Run shared typecheck**

Run:

```bash
pnpm --filter @szybko/shared typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ipc
git commit -m "feat(shared): add typed ipc contract"
```

### Task 3: Migrate Preload IPC Helpers to Contract Types

**Files:**
- Modify: `apps/desktop/src/preload/api/ipc.ts`
- Modify: `apps/desktop/src/preload/api/execute.ts`
- Modify: `apps/desktop/src/preload/api/search.ts`
- Modify: `apps/desktop/src/preload/api/window.ts`
- Modify: `apps/desktop/src/preload/api/plugin-lifecycle.ts`

**Interfaces:**
- Consumes: `IpcInvokeContract`, `IpcMainToRendererEventContract`, `IpcRendererToMainEventContract`.
- Produces: typed `invoke`, `on`, and `send` helpers with no local `IPC_API` mapping.

- [ ] **Step 1: Replace preload IPC helper types**

Replace `apps/desktop/src/preload/api/ipc.ts` with:

```ts
import type {
    IpcInvokeContract,
    IpcMainToRendererEventContract,
    IpcRendererToMainEventContract,
} from '@szybko/shared';
import { ipcRenderer } from 'electron';

type InvokePayload<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type InvokeResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];
type MainEventPayload<C extends keyof IpcMainToRendererEventContract> = IpcMainToRendererEventContract[C];
type RendererEventPayload<C extends keyof IpcRendererToMainEventContract> = IpcRendererToMainEventContract[C];

export function invoke<C extends keyof IpcInvokeContract>(
    channel: C,
): (payload: InvokePayload<C>) => Promise<InvokeResponse<C>> {
    return async (payload: InvokePayload<C>) =>
        ipcRenderer.invoke(channel, payload) as Promise<InvokeResponse<C>>;
}

export function on<C extends keyof IpcMainToRendererEventContract>(
    channel: C,
): (cb: (data: MainEventPayload<C>) => void) => () => void {
    return (cb: (data: MainEventPayload<C>) => void) => {
        const handler = (_: unknown, data: MainEventPayload<C>) => cb(data);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    };
}

export function send<C extends keyof IpcRendererToMainEventContract>(
    channel: C,
): (payload: RendererEventPayload<C>) => void {
    return (payload: RendererEventPayload<C>) => ipcRenderer.send(channel, payload);
}
```

- [ ] **Step 2: Adapt void invoke calls**

Update `apps/desktop/src/preload/api/window.ts` so `hideWindow` accepts no page argument but calls typed invoke with `undefined`:

```ts
hideWindow: () => invoke(IPC.WINDOW_HIDE)(undefined),
```

Leave `resizeWindow` as:

```ts
resizeWindow: invoke(IPC.WINDOW_RESIZE),
```

- [ ] **Step 3: Keep facade adapters ergonomic**

Confirm `apps/desktop/src/preload/api/execute.ts` still adapts facade arguments to IPC payloads:

```ts
execute: action => invoke(IPC.PLUGIN_EXEC)({ action }),
switchHost: (pluginId, targetHost) => invoke(IPC.HOST_SWITCH)({ pluginId, targetHost }),
```

If `execute` currently passes the action directly, change it to the code above.

- [ ] **Step 4: Keep search facade shape**

Confirm `apps/desktop/src/preload/api/search.ts` keeps:

```ts
search: invoke(IPC.SEARCH_QUERY),
searchCancel: invoke(IPC.SEARCH_CANCEL),
onSearchBatch: on(IPC.SEARCH_BATCH),
```

- [ ] **Step 5: Use typed `send()` in plugin lifecycle**

Update `apps/desktop/src/preload/api/plugin-lifecycle.ts` to import `send`:

```ts
import { on, send } from './ipc';
```

Inside `onSearch`, create a typed sender:

```ts
const sendSearchResult = send(IPC.PLUGIN_SEARCH_RESULT);
```

Use it in the handler:

```ts
sendSearchResult({
    queryId: ctx.queryId,
    batchSeq: 0,
    source: 'plugin',
    results,
    isFinal: true,
});
```

Remove direct `ipcRenderer` import and all direct `ipcRenderer.send/on/removeListener` calls from this file except where still needed. `IPC.PLUGIN_SEARCH` should be received through `on(IPC.PLUGIN_SEARCH)`.

- [ ] **Step 6: Run desktop typecheck**

Run:

```bash
pnpm --filter @szybko/desktop typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/preload
git commit -m "refactor(preload): derive ipc helpers from shared contract"
```

### Task 4: Migrate Host IPC Handlers and Runtime Manager

**Files:**
- Modify: `packages/host/src/ipc-handlers.ts`
- Modify: `packages/host/src/runtime-manager.ts`

**Interfaces:**
- Consumes: `IpcInvokeContract`, `IpcRendererToMainEventContract`, `SearchRequest`, `PluginSearchContext`.
- Produces: main IPC handlers typed from shared contract with no inline request payload types.

- [ ] **Step 1: Import contract types in `ipc-handlers.ts`**

Add type imports:

```ts
import type {
    IpcInvokeContract,
    IpcRendererToMainEventContract,
} from '@szybko/shared';
```

Add local helper types below imports:

```ts
type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];
type RendererEvent<C extends keyof IpcRendererToMainEventContract> = IpcRendererToMainEventContract[C];
```

- [ ] **Step 2: Type search handler from contract**

Change:

```ts
ipcMain.handle(IPC.SEARCH_QUERY, (_event, req: { queryId: string; query: string; timestamp: number }) => {
```

to:

```ts
ipcMain.handle(
    IPC.SEARCH_QUERY,
    (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): IpcResponse<typeof IPC.SEARCH_QUERY> => {
```

Close the handler with `});` preserving existing body.

- [ ] **Step 3: Type search cancel handler from contract**

Change the handler to include a typed return:

```ts
ipcMain.handle(
    IPC.SEARCH_CANCEL,
    (): IpcResponse<typeof IPC.SEARCH_CANCEL> => {
        return { ok: true };
    },
);
```

- [ ] **Step 4: Type plugin search result event**

Change:

```ts
ipcMain.on(IPC.PLUGIN_SEARCH_RESULT, (event, batch: { queryId: string; results: any[] }) => {
```

to:

```ts
ipcMain.on(IPC.PLUGIN_SEARCH_RESULT, (_event, batch: RendererEvent<typeof IPC.PLUGIN_SEARCH_RESULT>) => {
```

Keep the forwarding behavior unchanged.

- [ ] **Step 5: Type window handlers**

Use contract types:

```ts
ipcMain.handle(
    IPC.WINDOW_RESIZE,
    (_event, { height }: IpcRequest<typeof IPC.WINDOW_RESIZE>): IpcResponse<typeof IPC.WINDOW_RESIZE> => {
        windowManager.resize(height);
        return { ok: true };
    },
);

ipcMain.handle(
    IPC.WINDOW_HIDE,
    (): IpcResponse<typeof IPC.WINDOW_HIDE> => {
        windowManager.hide();
        return { ok: true };
    },
);
```

- [ ] **Step 6: Type execute and host switch handlers**

Use contract types:

```ts
ipcMain.handle(
    IPC.PLUGIN_EXEC,
    (_event, { action }: IpcRequest<typeof IPC.PLUGIN_EXEC>): IpcResponse<typeof IPC.PLUGIN_EXEC> => {
        return executeAction(action);
    },
);

ipcMain.handle(
    IPC.HOST_SWITCH,
    (_event, { pluginId: _pluginId, targetHost }: IpcRequest<typeof IPC.HOST_SWITCH>): IpcResponse<typeof IPC.HOST_SWITCH> => {
        try {
            const host = windowManager.createHost(targetHost);
            windowManager.registerHost(host.id, host);
            return { ok: true, hostId: host.id };
        }
        catch (err) {
            return { ok: false, error: String(err) };
        }
    },
);
```

- [ ] **Step 7: Type runtime plugin search**

In `packages/host/src/runtime-manager.ts`, import:

```ts
import type { PluginRuntime, PluginSearchContext, SearchRequest } from '@szybko/shared';
```

Change:

```ts
sendPluginSearch(req: { queryId: string; query: string; timestamp: number }): void {
```

to:

```ts
sendPluginSearch(req: SearchRequest): void {
```

Inside the loop, assign the sent payload:

```ts
const ctx: PluginSearchContext = {
    queryId: req.queryId,
    keyword: req.query.split(/\s+/)[0] || '',
    query: req.query,
    fullQuery: req.query,
};
entry.view.webContents.send(IPC.PLUGIN_SEARCH, ctx);
```

- [ ] **Step 8: Run host typecheck**

Run:

```bash
pnpm --filter @szybko/host typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/host/src/ipc-handlers.ts packages/host/src/runtime-manager.ts
git commit -m "refactor(host): type ipc handlers from shared contract"
```

### Task 5: Final Verification and Cleanup

**Files:**
- Modify if needed: any imports broken by module moves.
- Verify: workspace typecheck and desktop build.

**Interfaces:**
- Consumes all previous task outputs.
- Produces a fully verified migration with stable root imports.

- [ ] **Step 1: Search for deleted shared paths**

Run:

```bash
rg "api-types|search-types|plugin-types|runtime-types|ipc-channels|constants\\.js" packages apps plugins
```

Expected: no references to deleted flat shared files outside generated output. If matches exist in source, update them to root imports from `@szybko/shared` or relative grouped imports inside `packages/shared/src`.

- [ ] **Step 2: Search for direct untyped plugin search result payloads**

Run:

```bash
rg "any\\[\\]|PLUGIN_SEARCH_RESULT|ipcRenderer\\.send|ipcMain\\.on" apps/desktop/src packages/host/src
```

Expected:

- no `any[]` for plugin search results
- `PLUGIN_SEARCH_RESULT` goes through typed `send()` in preload
- main receives `PLUGIN_SEARCH_RESULT` as `RendererEvent<typeof IPC.PLUGIN_SEARCH_RESULT>`

- [ ] **Step 3: Run full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run desktop build**

Run:

```bash
pnpm --filter @szybko/desktop build
```

Expected: PASS and output includes:

```text
out/preload/host.js
out/preload/plugin.js
```

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git diff --stat
git status --short
```

Expected: only shared modularization and IPC contract migration changes are present, plus any unrelated pre-existing dirty files clearly identified and not reverted.

- [ ] **Step 6: Commit final cleanup**

```bash
git add packages/shared/src apps/desktop/src/preload packages/host/src
git commit -m "chore: verify shared ipc contract migration"
```

Skip this commit if all changed files were already committed in earlier tasks.

## Self-Review

- Spec coverage: The plan covers shared internal modules, root export compatibility, IPC contract creation, preload helper migration, main handler migration, and final verification.
- Placeholder scan: No placeholder tasks remain; every task names exact files and commands.
- Type consistency: `IpcInvokeContract`, `IpcMainToRendererEventContract`, and `IpcRendererToMainEventContract` are introduced in Task 2 and consumed by Tasks 3 and 4 with matching names.
