# Architecture Foundation Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 known architectural issues across quality gates, plugin catalog, runtime layer, protocol/SDK, and infrastructure.

**Architecture:** 9 tasks ordered to resolve layer dependencies before the layer that depends on them. Floating HostMeta (adds `pluginId` to HostMeta) runs before RuntimeManager split (which uses `pluginId` in HostMeta).

**Tech Stack:** Electron, node:sqlite, electron-vite, Zustand, React

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-architecture-foundation-overhaul.md`
- Each task must pass `pnpm typecheck` before commit
- All `git add` commands list exact files — never `git add -A`
- No backward compatibility; no half-baked compat layers

---

### Task 1: Quality Gate — Fix typecheck + lint, add check script

**Files:**
- Modify: `packages/shell/src/pages/shell/Shell.tsx`
- Modify: `package.json`

- [ ] **Step 1: Fix Shell.tsx function updater errors**

Zustand action `setSelectedIndex` has type `(index: number) => void` but is called with function updaters. Replace with direct value:

```typescript
// packages/shell/src/pages/shell/Shell.tsx lines 28-29
onSelectUp: () => setSelectedIndex(Math.max(0, selectedIndex - 1)),
onSelectDown: () => setSelectedIndex(Math.min(results.length - 1, selectedIndex + 1)),
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @szybko/shell exec -- tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Run lint fix**

```bash
pnpm lint:fix
```
Expected: 0 errors, warnings acceptable.

- [ ] **Step 4: Add `check` script to root `package.json`**

After `"lint:fix"`:
```json
"check": "pnpm typecheck && pnpm lint"
```

- [ ] **Step 5: Full tree check**

```bash
pnpm typecheck && pnpm lint && echo "PASS"
```

- [ ] **Step 6: Commit**

```bash
git add package.json packages/shell/src/pages/shell/Shell.tsx
git commit -m "chore: fix typecheck/lint, add pnpm check script"
```

---

### Task 2: Protocol Drift Fix + SDK Narrow

**Files:**
- Modify: `plugins/built-in/launcher/index.html`
- Modify: `packages/shared/src/api/plugin.ts`
- Modify: `packages/plugin-sdk/src/types/api.d.ts`
- Modify: `packages/plugin-sdk/src/index.ts`

- [ ] **Step 1: Fix launcher plugin — read `code` not `featureCode`**

```javascript
// plugins/built-in/launcher/index.html line 10
// Before:
const feature = payload?.featureCode;
// After:
const feature = payload?.code;
```

- [ ] **Step 2: Fix `onPluginEnter` callback type**

```typescript
// packages/shared/src/api/plugin.ts
import type { PluginEnterPayload } from '../ipc/contract';

export interface SzybkoPluginApi {
    // … keep existing fields
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
}
```

- [ ] **Step 3: Write replacement `api.d.ts`**

Replace `packages/plugin-sdk/src/types/api.d.ts` entirely. Remove `UtoolsAPI` and all uTools compat — this SDK exports only stable Szybko contracts. No `compat` namespace, no half-removed interfaces.

```typescript
import type { PluginEnterPayload, PluginOutPayload, RuntimeStatePayload, PluginFeature, ActionDescriptor } from '@szybko/shared';

export interface SzybkoPluginSDK {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    switchHost: (runtimeId: string, targetHost: 'launcher' | 'floating') => Promise<{ ok: boolean; hostId?: string; error?: string }>;
    setFeature: (feature: PluginFeature) => Promise<{ ok: boolean; error?: string }>;
    getFeatures: (codes?: string[]) => Promise<PluginFeature[]>;
    removeFeature: (code: string) => Promise<{ ok: boolean; error?: string }>;
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
    onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;
}
```

- [ ] **Step 4: Update SDK barrel export**

```typescript
// packages/plugin-sdk/src/index.ts
export type { SzybkoPluginSDK } from './types/api';
export type { PluginFeature, PluginManifest } from '@szybko/shared';
```

Remove any remaining references to `UtoolsAPI` from the package.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @szybko/plugin-sdk exec -- tsc --noEmit
pnpm typecheck
```
All packages pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/built-in/launcher/index.html packages/shared/src/api/plugin.ts packages/plugin-sdk/src/types/api.d.ts packages/plugin-sdk/src/index.ts
git commit -m "fix: align PluginEnterPayload field (code), narrow SDK to stable contracts, remove uTools compat"
```

---

### Task 3: API Boundary — Shell uses internal API only

**Files:**
- Modify: `packages/shared/src/api/internal.ts`
- Modify: `apps/desktop/src/preload/host.ts`
- Modify: `apps/desktop/src/preload/api/execute.ts`
- Modify: `packages/shell/src/pages/shell/Shell.tsx`
- Modify: `packages/shell/src/services/plugin-runtime.ts`
- Modify: `packages/shell/src/global.d.ts`

- [ ] **Step 1: Add `execute` to `SzybkoInternalApi`**

```typescript
// packages/shared/src/api/internal.ts
import type { ActionDescriptor } from '../search/types';
import type { SearchBatch, SearchRequest } from '../search/types';

export interface SzybkoInternalApi {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    search: (req: SearchRequest) => Promise<{ ok: boolean }>;
    searchCancel: (queryId: string) => Promise<{ ok: boolean }>;
    resizeWindow: (height: number) => Promise<{ ok: boolean }>;
    hideWindow: () => Promise<{ ok: boolean }>;
    hidePlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    destroyPlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    showPluginMenu: (runtimeId: string, hostType?: 'launcher' | 'floating') => Promise<{ ok: boolean }>;
    pinPlugin: (runtimeId: string, pin: boolean) => Promise<{ ok: boolean }>;
    onSearchBatch: (cb: (batch: SearchBatch) => void) => () => void;
    onShowMainWindow: (cb: () => void) => () => void;
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => () => void;
}
```

- [ ] **Step 2: Rewrite host.ts preload**

Remove all plugin API imports and `window.szybko` exposure. Shell window no longer exposes plugin API.

```typescript
// apps/desktop/src/preload/host.ts
import type { SzybkoInternalApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute';
import { createSearchApi } from './api/search';
import { createThemeApi } from './api/theme';
import { createWindowApi } from './api/window';

const internalApi = {
    ...createSearchApi(),
    ...createWindowApi(),
    ...createThemeApi(),
    ...createExecuteApi(),
} satisfies SzybkoInternalApi;

contextBridge.exposeInMainWorld('szybkoInternal', internalApi);
```

- [ ] **Step 3: Update Shell.tsx — use internal API for execute**

Two occurrences (line ~35 and ~75):
```typescript
// Before:
window.szybko?.execute(action);
// After:
window.szybkoInternal?.execute(action);
```

- [ ] **Step 4: Fix PluginRuntimeService — remove window.szybko dependency**

`packages/shell/src/services/plugin-runtime.ts` contains `switchHost()` that calls `getPluginApi()?.switchHost()`. This was never called from any component (dead code). Remove the `switchHost` method and the `getPluginApi` import entirely.

```typescript
// packages/shell/src/services/plugin-runtime.ts
import type { HostType } from '../types';

function getApi() {
    return window.szybkoInternal ?? null;
}

export const PluginRuntimeService = {
    hide(runtimeId: string): Promise<{ ok: boolean }> {
        return getApi()?.hidePlugin(runtimeId) ?? Promise.resolve({ ok: false });
    },
    destroy(runtimeId: string): Promise<{ ok: boolean }> {
        return getApi()?.destroyPlugin(runtimeId) ?? Promise.resolve({ ok: false });
    },
    pin(runtimeId: string, pin: boolean): Promise<{ ok: boolean }> {
        return getApi()?.pinPlugin(runtimeId, pin) ?? Promise.resolve({ ok: false });
    },
    showMenu(runtimeId: string, hostType: HostType): Promise<{ ok: boolean }> {
        return getApi()?.showPluginMenu(runtimeId, hostType) ?? Promise.resolve({ ok: false });
    },
};
```

- [ ] **Step 5: Update global.d.ts**

```typescript
// packages/shell/src/global.d.ts
declare global {
    interface Window {
        szybkoInternal?: import('@szybko/shared').SzybkoInternalApi;
    }
}
export {};
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @szybko/shared exec -- tsc --noEmit
pnpm --filter @szybko/shell exec -- tsc --noEmit
pnpm --filter @szybko/host exec -- tsc --noEmit
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/api/internal.ts apps/desktop/src/preload/host.ts apps/desktop/src/preload/api/execute.ts packages/shell/src/pages/shell/Shell.tsx packages/shell/src/services/plugin-runtime.ts packages/shell/src/global.d.ts
git commit -m "refactor: shell uses internal API only, remove window.szybko from host preload"
```

---

### Task 4: PluginCatalog — Stop Overriding User State

**Files:**
- Create: `packages/host/src/plugins/installation-synchronizer.ts`
- Modify: `packages/host/src/plugins/plugin-catalog.ts`
- Modify: `packages/host/src/index.ts`

- [ ] **Step 1: Create InstallationSynchronizer**

`packages/host/src/plugins/installation-synchronizer.ts`:
```typescript
import type { PluginInfo } from './plugin-catalog';
import { PluginInstallationRepository } from '../persistence/sqlite/repositories/plugin-installation-repository';

/**
 * InstallationSynchronizer — 同步磁盘发现的插件与 DB 安装记录。
 * 遵循用户偏好：不自动启用已禁用插件，不因磁盘缺失自动禁用。
 */
export class InstallationSynchronizer {
    constructor(private repos: PluginInstallationRepository) {}

    /**
     * 同步磁盘发现结果到 DB。
     * - 新插件（DB 无记录）→ register
     * - 已有（不论 enabled/disabled）→ 不动，尊重用户状态
     */
    sync(discovered: PluginInfo[]): void {
        const now = Date.now();
        for (const plugin of discovered) {
            if (!this.repos.has(plugin.id)) {
                this.repos.register(plugin.id, 'built-in', plugin.path, now);
            }
        }
    }
}
```

- [ ] **Step 2: Simplify PluginCatalog.init()**

Remove `repos.setEnabled(plugin.id, true)` and `repos.setEnabled(id, false)` calls. Only sync new registrations.

```typescript
// packages/host/src/plugins/plugin-catalog.ts (init method only)
async init(): Promise<void> {
    const repos = new PluginInstallationRepository(this.platformDb.drizzle());
    const discovered = this.discovery.scan(this.pluginsBaseDir);
    new InstallationSynchronizer(repos).sync(discovered);
    for (const plugin of discovered) {
        this.plugins.set(plugin.id, plugin);
    }
}
```

Keep all other methods (`get`, `getAll`, `getEnabled`) unchanged — `getEnabled()` already filters by disk presence via `listEnabled()` + `filter(Boolean)`.

- [ ] **Step 3: Export InstallationSynchronizer**

In `packages/host/src/index.ts`:
```
export { InstallationSynchronizer } from './plugins/installation-synchronizer';
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @szybko/host exec -- tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/plugins/installation-synchronizer.ts packages/host/src/plugins/plugin-catalog.ts packages/host/src/index.ts
git commit -m "refactor: InstallationSynchronizer — scan does not override user enabled preference"
```

---

### Task 5: Floating Host Meta + RuntimeSlot

**Files:**
- Modify: `packages/shared/src/ipc/types.ts` (or a new types file — add `RuntimeSlot` to shared)
- Modify: `packages/host/src/window/hosts/runtime-host.ts`
- Modify: `packages/host/src/window/hosts/floating-runtime-host.ts`
- Modify: `packages/host/src/runtime/runtime-manager.ts`
- Modify: `packages/shell/src/types/index.ts` (re-export or remove local copy)
- Modify: `packages/shell/src/pages/floating/FloatingApp.tsx`

**Important:** `RuntimeSlot` goes into `@szybko/shared` so host and shell share the same type. The shell package's local `RuntimeSlot` type either re-exports or is removed in favor of the shared one.

- [ ] **Step 1: Move RuntimeSlot to shared**

Add to `packages/shared/src/runtime/types.ts` (alongside `RuntimeInfo`):
```typescript
import type { LoadState, MountState } from './types';

export interface RuntimeSlot {
    runtimeId: string | null;
    pluginId: string | null;
    pluginName: string;
    featureExplain: string;
    loadState: LoadState;
    mountState: MountState;
}
```

Export from `packages/shared/src/index.ts` if not already re-exported through the barrel.

- [ ] **Step 2: Extend HostMeta with pluginId**

```typescript
// packages/host/src/window/hosts/runtime-host.ts
export interface HostMeta {
    runtimeId: string;
    pluginId: string;
    pluginName: string;
    featureExplain?: string;
}
```

- [ ] **Step 3: Update FloatingRuntimeHost — serialize RuntimeSlot**

Replace the fragmented URL query params with a single `slot` parameter. Use `URLSearchParams` for encoding — do NOT manually call `encodeURIComponent`, because `loadFile({ query })` already encodes.

```typescript
// Inside FloatingRuntimeHost.createWindow():
private createWindow(meta: HostMeta): void {
    // … BrowserWindow creation (unchanged) …

    const slot: RuntimeSlot = {
        runtimeId: meta.runtimeId,
        pluginId: meta.pluginId,
        pluginName: meta.pluginName,
        featureExplain: meta.featureExplain ?? '',
        loadState: 'loaded',
        mountState: 'attached',
    };

    const query = { slot: JSON.stringify(slot) };

    if (process.env.ELECTRON_RENDERER_URL) {
        const qs = new URLSearchParams(query).toString();
        void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')}/floating.html?${qs}`);
    }
    else {
        void this.window.loadFile(join(__dirname, '../renderer/floating.html'), { query });
    }
}
```

Update `attach()` signature to use the expanded `HostMeta`:
```typescript
attach(view: WebContentsView, meta: HostMeta): void {
    this.currentMeta = meta;
    if (!this.window) {
        this.createWindow(meta);
    }
    // … rest unchanged …
}
```

- [ ] **Step 4: Update RuntimeManager.attachToHost — pass pluginId**

When constructing `HostMeta` for `hostAttacher.attach()`, include `pluginId`:
```typescript
this.hostAttacher.attach(runtimeId, host, runtime.webContentsView, {
    runtimeId: runtime.info.id,
    pluginId: runtime.info.pluginId,
    pluginName: displayName,
    featureExplain: plugin?.manifest.features[0]?.explain,
});
```

- [ ] **Step 5: Update FloatingApp — deserialize slot**

```typescript
// packages/shell/src/pages/floating/FloatingApp.tsx
import type { RuntimeSlot } from '@szybko/shared';

const params = new URLSearchParams(window.location.search);
const slotParam = params.get('slot');
let initialSlot: RuntimeSlot;
try {
    initialSlot = slotParam ? JSON.parse(slotParam) : fallbackSlot;
}
catch {
    initialSlot = fallbackSlot;
}
```

Remove the old per-field `params.get('name')`, `params.get('runtimeId')`, etc. — all come from the single `slot` parameter now.

- [ ] **Step 6: Update shell RuntimeSlot type**

In `packages/shell/src/types/index.ts`, either re-export the shared type or remove the local definition and import from `@szybko/shared`.

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @szybko/shared exec -- tsc --noEmit
pnpm --filter @szybko/host exec -- tsc --noEmit
pnpm --filter @szybko/shell exec -- tsc --noEmit
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/runtime/types.ts packages/host/src/window/hosts/runtime-host.ts packages/host/src/window/hosts/floating-runtime-host.ts packages/host/src/runtime/runtime-manager.ts packages/shell/src/types/index.ts packages/shell/src/pages/floating/FloatingApp.tsx
git commit -m "refactor: HostMeta gains pluginId, floating host uses serialized RuntimeSlot"
```

---

### Task 6: Capability Type Guards

**Files:**
- Modify: `packages/host/src/window/hosts/capabilities.ts`
- Modify: `packages/host/src/runtime/runtime-coordinator.ts`
- Modify: `packages/host/src/runtime/runtime-manager.ts`

- [ ] **Step 1: Add type guards to capabilities.ts**

```typescript
// packages/host/src/window/hosts/capabilities.ts
import type { RuntimeHost } from './runtime-host';

export interface Focusable { focus: () => void }
export interface Pinnable { setAlwaysOnTop: (pin: boolean) => void }
export interface Closable { close: () => void }
export interface Resizable { resize: (width: number, height: number) => void }
export interface Positionable { setPosition: (x: number, y: number) => void }

export function isFocusable(host: RuntimeHost): host is RuntimeHost & Focusable {
    return 'focus' in host;
}
export function isPinnable(host: RuntimeHost): host is RuntimeHost & Pinnable {
    return 'setAlwaysOnTop' in host;
}
export function isClosable(host: RuntimeHost): host is RuntimeHost & Closable {
    return 'close' in host;
}
```

- [ ] **Step 2: Update RuntimeCoordinator**

Replace all `'close' in host` / `'setAlwaysOnTop' in host` checks:

```typescript
// runtime-coordinator.ts
import { isClosable, isPinnable } from '../window/hosts/capabilities';

// In destroyRuntime():
if (isClosable(host)) {
    host.close();
}

// In pinRuntime():
if (isPinnable(host)) {
    host.setAlwaysOnTop(pin);
}
```

- [ ] **Step 3: Update RuntimeManager**

Replace the `(existing as any).focus?.()` cast:

```typescript
// runtime-manager.ts — attachToHost method
import { isFocusable } from '../window/hosts/capabilities';

if (existingHost?.type === 'floating' && isFocusable(existingHost)) {
    existingHost.focus();
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @szybko/host exec -- tsc --noEmit
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/window/hosts/capabilities.ts packages/host/src/runtime/runtime-coordinator.ts packages/host/src/runtime/runtime-manager.ts
git commit -m "refactor: add capability type guards, remove runtime property detection"
```

---

### Task 7: RuntimeManager Decomposition

**Files:**
- Create: `packages/host/src/runtime/runtime-view-factory.ts`
- Create: `packages/host/src/runtime/runtime-host-attacher.ts`
- Create: `packages/host/src/runtime/runtime-state-publisher.ts`
- Modify: `packages/host/src/runtime/runtime-manager.ts`
- Modify: `packages/host/src/index.ts`

**Constraint:** Preserve all public methods and their signatures (`startAll()`, `create(pluginId)`, `getOrCreate(pluginId)`, `get(runtimeId)`, `getAll()`, `getHostFor(runtimeId)`, `attachToHost(...)`, `detachFromHost(...)`, `destroy(runtimeId)`, `pluginIdForWebContents(webContentsId)`, etc.). The constructor signature also stays unchanged (`(pluginManager, windowManager, pluginPreloadPath)`).

Only extract internal dependencies; do NOT change the public API.

- [ ] **Step 1: Create RuntimeViewFactory**

```typescript
// packages/host/src/runtime/runtime-view-factory.ts
import type { PluginInfo } from '../plugins/plugin-catalog';
import { join } from 'node:path';
import { app, WebContentsView } from 'electron';

/**
 * RuntimeViewFactory — 创建 WebContentsView 并加载插件 URL。
 * 不关心 host 或状态发布。
 */
export class RuntimeViewFactory {
    private nextInstanceId = 1;

    constructor(private pluginPreloadPath: string) {}

    create(plugin: PluginInfo): { view: WebContentsView; runtimeId: string } {
        const view = new WebContentsView({
            webPreferences: {
                preload: this.pluginPreloadPath,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        const runtimeId = `${plugin.id}-${this.nextInstanceId++}`;

        const devUrl = !app.isPackaged && plugin.manifest.development?.main;
        if (devUrl) {
            view.webContents.loadURL(devUrl);
        }
        else {
            const indexPath = join(plugin.path, plugin.manifest.main);
            view.webContents.loadFile(indexPath);
        }

        return { view, runtimeId };
    }
}
```

- [ ] **Step 2: Create RuntimeHostAttacher**

```typescript
// packages/host/src/runtime/runtime-host-attacher.ts
import type { HostMeta, RuntimeHost } from '../window/hosts/runtime-host';
import type { WebContentsView } from 'electron';

/**
 * RuntimeHostAttacher — 管理 runtime → host 映射。
 * 纯映射逻辑，不涉及 View 创建或状态发布。
 */
export class RuntimeHostAttacher {
    private hostMap = new Map<string, RuntimeHost>();

    attach(runtimeId: string, host: RuntimeHost, view: WebContentsView, meta: HostMeta): void {
        const old = this.hostMap.get(runtimeId);
        if (old && old !== host) {
            old.detach();
        }
        host.attach(view, meta);
        this.hostMap.set(runtimeId, host);
    }

    detach(runtimeId: string): RuntimeHost | null {
        const host = this.hostMap.get(runtimeId);
        if (host) {
            host.detach();
            this.hostMap.delete(runtimeId);
        }
        return host ?? null;
    }

    getHostFor(runtimeId: string): RuntimeHost | null {
        return this.hostMap.get(runtimeId) ?? null;
    }

    hasHost(runtimeId: string): boolean {
        return this.hostMap.has(runtimeId);
    }
}
```

- [ ] **Step 3: Create RuntimeStatePublisher**

```typescript
// packages/host/src/runtime/runtime-state-publisher.ts
import type { LoadState, MountState } from '@szybko/shared';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { WindowManager } from '../window/window-manager';
import { IPC } from '@szybko/shared';

/**
 * RuntimeStatePublisher — 向渲染进程发布插件 runtime 状态变更。
 */
export class RuntimeStatePublisher {
    constructor(
        private windowManager: WindowManager,
        private pluginManager: PluginCatalog,
    ) {}

    publish(runtimeId: string, pluginId: string, mountState: MountState, loadState: LoadState): void {
        const win = this.windowManager.getWindow();
        if (!win || win.isDestroyed()) return;

        const plugin = this.pluginManager.get(pluginId);
        const feature = plugin?.manifest.features[0];
        const pluginName = feature?.explain || pluginId;
        const featureExplain = feature?.explain || '';

        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId, pluginId, pluginName, featureExplain,
            state: mountState, mountState, loadState,
        });
    }
}
```

- [ ] **Step 4: Refactor RuntimeManager — extract internals, keep public API**

The changes to `runtime-manager.ts`:

1. Add three private fields:
   - `viewFactory = new RuntimeViewFactory(pluginPreloadPath)`
   - `hostAttacher = new RuntimeHostAttacher()`
   - `statePublisher = new RuntimeStatePublisher(windowManager, pluginManager)`

2. `create(pluginId)` — delegate view creation to `viewFactory.create(plugin)`, keep the existing return type and signature. After getting `{ view, runtimeId }` from the factory, construct the `PluginRuntime` object (same as current code), set up event listeners, store in `entries`.

3. `attachToHost(...)` — delegate host map management to `hostAttacher.attach()` / `hostAttacher.getHostFor()`. Construct `HostMeta` with `pluginId` (added in Task 5).

4. `detachFromHost(...)` — delegate to `hostAttacher.detach()`.

5. `publishState(...)` — delegate to `statePublisher.publish()`.

6. `getHostFor(...)` — delegate to `hostAttacher.getHostFor()`.

7. All other public methods (`get`, `getAll`, `getOrCreate`, `getByPluginId`, `pluginIdForWebContents`, `destroy`, `runtimeCount`): keep exactly as they are today.

- [ ] **Step 5: Update index.ts exports**

```typescript
// packages/host/src/index.ts
export { RuntimeViewFactory } from './runtime/runtime-view-factory';
export { RuntimeHostAttacher } from './runtime/runtime-host-attacher';
export { RuntimeStatePublisher } from './runtime/runtime-state-publisher';
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @szybko/host exec -- tsc --noEmit
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/runtime/runtime-view-factory.ts packages/host/src/runtime/runtime-host-attacher.ts packages/host/src/runtime/runtime-state-publisher.ts packages/host/src/runtime/runtime-manager.ts packages/host/src/index.ts
git commit -m "refactor: split RuntimeManager into ViewFactory + HostAttacher + StatePublisher"
```

---

### Task 8: DB Migration Framework

**Files:**
- Create: `packages/host/src/persistence/migrations/migration-001.ts`
- Create: `packages/host/src/persistence/migrations/migrator.ts`
- Modify: `packages/host/src/persistence/sqlite/platform-database.ts`

**Design decision:** Migration SQL is embedded as a TypeScript string export instead of `.sql` files on disk. This avoids the packaging problem (electron-vite won't copy `.sql` files to `out/`). The migrator reads from an ordered array of migration modules, not from the filesystem.

- [ ] **Step 1: Create initial migration as TS module**

```typescript
// packages/host/src/persistence/migrations/migration-001.ts
export const name = '001_create_initial_tables';

export const sql = `
CREATE TABLE plugin_installation (
  plugin_id TEXT PRIMARY KEY CHECK (length(trim(plugin_id)) > 0),
  source TEXT NOT NULL CHECK (source IN ('built-in', 'local-dev', 'user-installed')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  install_path TEXT NOT NULL CHECK (length(trim(install_path)) > 0),
  version TEXT,
  manifest_hash TEXT NOT NULL DEFAULT '',
  manifest_indexed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plugin_installation_enabled ON plugin_installation(enabled, source);

CREATE TABLE manifest_feature_snapshot (
  plugin_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  feature_order INTEGER NOT NULL CHECK (feature_order >= 0),
  feature_json TEXT NOT NULL CHECK (json_valid(feature_json)),
  feature_hash TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, code),
  UNIQUE (plugin_id, feature_order),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);

CREATE TABLE feature_override (
  plugin_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
  feature_json TEXT,
  feature_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, code),
  CHECK ((state = 'active' AND feature_json IS NOT NULL AND json_valid(feature_json) AND feature_hash IS NOT NULL) OR (state = 'removed' AND feature_json IS NULL AND feature_hash IS NULL)),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_feature_override_plugin_state ON feature_override(plugin_id, state);

CREATE TABLE effective_feature (
  plugin_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  source TEXT NOT NULL CHECK (source IN ('manifest', 'dynamic')),
  feature_order INTEGER NOT NULL CHECK (feature_order >= 0),
  feature_json TEXT NOT NULL CHECK (json_valid(feature_json)),
  feature_hash TEXT NOT NULL,
  rebuilt_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, code),
  UNIQUE (plugin_id, feature_order),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_effective_feature_plugin_source ON effective_feature(plugin_id, source);

CREATE TABLE command_trigger (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  trigger_index   INTEGER NOT NULL CHECK (trigger_index >= 0),
  type            TEXT NOT NULL CHECK (type IN ('text','regex','over','img','files','window')),
  label           TEXT,
  matcher_json    TEXT NOT NULL CHECK (json_valid(matcher_json)),
  score_base      INTEGER NOT NULL DEFAULT 90,
  rebuilt_at      INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, feature_code, cmd_key)
);
CREATE INDEX IF NOT EXISTS idx_ct_type ON command_trigger(type);

CREATE TABLE command_trigger_search (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  search_text     TEXT NOT NULL CHECK (length(trim(search_text)) > 0),
  source          TEXT NOT NULL CHECK (source IN ('cmd', 'alias')),
  match_level     INTEGER NOT NULL CHECK (match_level IN (1, 2, 3)),
  alias_id        INTEGER,
  PRIMARY KEY (plugin_id, feature_code, cmd_key, search_text)
);
CREATE INDEX IF NOT EXISTS idx_cts_lookup ON command_trigger_search(search_text);

CREATE TABLE command_alias (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id         TEXT NOT NULL,
  feature_code      TEXT NOT NULL,
  alias_key         TEXT NOT NULL,
  alias_normalized  TEXT NOT NULL,
  target_cmd_key    TEXT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'removed')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_active_unique ON command_alias(plugin_id, feature_code, alias_normalized) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS idx_ca_lookup ON command_alias(plugin_id, feature_code);

CREATE TABLE pinned_trigger (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  pinned_at       INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, feature_code, cmd_key),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);

CREATE TABLE usage_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  query           TEXT,
  match_level     INTEGER,
  selected_at     INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_uh_lookup ON usage_history(plugin_id, feature_code, cmd_key, selected_at DESC);

CREATE TABLE command_projection_meta (
  plugin_id TEXT PRIMARY KEY,
  manifest_hash TEXT NOT NULL,
  override_fingerprint TEXT NOT NULL,
  index_version INTEGER NOT NULL,
  rebuilt_at INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
`;
```

(Direct copy of current DDL from `platform-database.ts:25-155` — quoted verbatim here; no `IF NOT EXISTS` on real tables.)

- [ ] **Step 2: Create Migrator**

```typescript
// packages/host/src/persistence/migrations/migrator.ts
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

interface Migration {
    name: string;
    sql: string;
}

export class Migrator {
    constructor(private sqlite: DatabaseSync) {
        sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            applied_at  INTEGER NOT NULL,
            checksum    TEXT NOT NULL
        )`);
    }

    migrate(migrations: Migration[]): void {
        const applied = new Set(
            (this.sqlite.prepare('SELECT name FROM _migrations').all() as any[])
                .map(r => r.name as string)
        );

        for (const m of migrations) {
            if (applied.has(m.name)) continue;

            const checksum = createHash('sha256').update(m.sql).digest('hex').slice(0, 16);

            this.sqlite.exec('BEGIN');
            try {
                this.sqlite.exec(m.sql);
                this.sqlite.prepare(
                    'INSERT INTO _migrations (name, applied_at, checksum) VALUES (?, ?, ?)'
                ).run(m.name, Date.now(), checksum);
                this.sqlite.exec('COMMIT');
            }
            catch (err) {
                this.sqlite.exec('ROLLBACK');
                throw err;
            }
        }
    }
}
```

- [ ] **Step 3: Update platform-database.ts**

Replace `createSchema(sqlite)` call with Migrator:

```typescript
// Inside createPlatformDatabase, replace:
// createSchema(sqlite);  → remove this line

// With:
const { Migrator } = await import('../migrations/migrator');
const { sql, name } = await import('../migrations/migration-001');
new Migrator(sqlite).migrate([{ name, sql }]);
```

Remove the `createSchema` function and the unused table/import references.

**Old DB handling:** If an existing database has tables but no `_migrations` table (v1/v2 schema), the migration will fail because existing tables already exist. This is expected — delete the old DB file manually:
```bash
rm -f ~/Library/Application\ Support/szybko/szybko-platform.db
```

This aligns with the "不兼容历史" principle. A future improvement could auto-detect this condition and handle it, but YAGNI for now.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @szybko/host exec -- tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/persistence/migrations/migration-001.ts packages/host/src/persistence/migrations/migrator.ts packages/host/src/persistence/sqlite/platform-database.ts
git commit -m "feat: versioned DB migrations (TS modules, filesystem-free)"
```

---

### Task 9: Native Capability Adapter

**Files:**
- Create: `packages/host/src/native/native-capability-service.ts`
- Create: `packages/host/src/native/electron-native-capability-service.ts`
- Modify: `packages/host/src/ipc/execute-action.ts`
- Modify: `packages/host/src/ipc/register-handlers.ts`
- Modify: `packages/host/src/index.ts`

- [ ] **Step 1: Define async service interface**

```typescript
// packages/host/src/native/native-capability-service.ts
export interface NativeCapabilityService {
    openPath(path: string): Promise<void>;
    openUrl(url: string): Promise<void>;
    writeClipboard(text: string): Promise<void>;
    launchApp(bundleId: string): Promise<void>;
}
```

All methods return `Promise<void>` — this allows error handling and audit logging wrappers to be added without signature changes.

- [ ] **Step 2: Implement Electron adapter**

```typescript
// packages/host/src/native/electron-native-capability-service.ts
import type { NativeCapabilityService } from './native-capability-service';
import { execFile } from 'node:child_process';
import { clipboard, shell } from 'electron';

export class ElectronNativeCapabilityService implements NativeCapabilityService {
    async openPath(path: string): Promise<void> {
        await shell.openPath(path);
    }

    async openUrl(url: string): Promise<void> {
        await shell.openExternal(url);
    }

    async writeClipboard(text: string): Promise<void> {
        clipboard.writeText(text);
    }

    async launchApp(bundleId: string): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            execFile('open', ['-b', bundleId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}
```

- [ ] **Step 3: Update execute-action.ts**

```typescript
// packages/host/src/ipc/execute-action.ts
import type { ActionDescriptor } from '@szybko/shared';
import type { NativeCapabilityService } from '../native/native-capability-service';

export function createExecutor(native: NativeCapabilityService) {
    return async function executeAction(action: ActionDescriptor): Promise<{ ok: boolean; error?: string }> {
        try {
            switch (action.type) {
                case 'shell.openPath':
                    await native.openPath(action.payload.path);
                    return { ok: true };
                case 'shell.openUrl':
                    await native.openUrl(action.payload.url);
                    return { ok: true };
                case 'clipboard.writeText':
                    await native.writeClipboard(action.payload.text);
                    return { ok: true };
                case 'process.launchApp':
                    await native.launchApp(action.payload.bundleId);
                    return { ok: true };
                case 'plugin.open':
                case 'plugin.runCommand':
                    console.warn(`[execute] plugin action: ${action.type}`, action.payload);
                    return { ok: true };
                default:
                    return { ok: false, error: `Unknown action type: ${(action as any).type}` };
            }
        }
        catch (err) {
            return { ok: false, error: String(err) };
        }
    };
}

export type Executor = ReturnType<typeof createExecutor>;
```

- [ ] **Step 4: Wire executor in register-handlers.ts**

Near the top of `registerIpcHandlers`:
```typescript
import { createExecutor } from './execute-action';
import { ElectronNativeCapabilityService } from '../native/electron-native-capability-service';

// At the start of registerIpcHandlers:
const executor = createExecutor(new ElectronNativeCapabilityService());
```

In the PLUGIN_EXEC handler, replace `return executeAction(action)` with `return executor(action)`.

Since the handler is async now, the IPC handler needs `async`:
```typescript
ipcMain.handle(
    IPC.PLUGIN_EXEC,
    async (_event, { action }): Promise<IpcResponse<typeof IPC.PLUGIN_EXEC>> => {
        if (action.type === 'plugin.open') {
            // … sync parts unchanged …
            return { ok: true };
        }
        return executor(action);
    },
);
```

- [ ] **Step 5: Update index.ts exports**

```typescript
// packages/host/src/index.ts
export { NativeCapabilityService } from './native/native-capability-service';
export { ElectronNativeCapabilityService } from './native/electron-native-capability-service';
export { createExecutor } from './ipc/execute-action';
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @szybko/host exec -- tsc --noEmit
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/native/native-capability-service.ts packages/host/src/native/electron-native-capability-service.ts packages/host/src/ipc/execute-action.ts packages/host/src/ipc/register-handlers.ts packages/host/src/index.ts
git commit -m "feat: NativeCapabilityService abstraction with async interface and execFile"
```

---

## Self-Review

**Spec coverage:** 10 issues → 9 tasks. Every spec concern maps to a task. ✓

**Placeholder scan:** No TBD/TODO, no `/* … old interface … */`, no `compat` namespace. ✓

**Type consistency:** Task 5 adds `pluginId` to `HostMeta`. Task 7 (RuntimeManager split) constructs `HostMeta` with that field. Task 6 type guards reference interfaces from `capabilities.ts`. Task 8 migrator uses `migration-001` module created in the same task. All names match. ✓

**Execution order validation:**
- Task 5 (HostMeta + pluginId) → Task 6 (capability type guards) → Task 7 (RuntimeManager split) — HostMeta.pluginId is available when RuntimeManager needs it
- Task 2 (SDK) + Task 3 (API boundary) are independent, sequenced early for clean baseline
- Tasks 8 and 9 are independent infrastructure, sequenced last
