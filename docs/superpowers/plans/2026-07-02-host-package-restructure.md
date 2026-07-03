# @szybko/host Package Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `packages/host/src/` from flat layout to domain-grouped directories, and split the monolithic `ipc-handlers.ts` into 3 focused files.

**Architecture:** Flat → domain groups: `plugins/`, `runtime/`, `window/`, `ipc/`, `services/`. Internal cross-references are via relative imports; barrel `index.ts` is the public API. No runtime behavior changes.

**Tech Stack:** TypeScript, Electron, pnpm monorepo. Verification: `tsc --noEmit` and `pnpm dev`.

## Global Constraints

- Zero logic changes — pure file reorganization + one file split
- All external consumers import via barrel (`index.ts`)
- TypeScript `rootDir: ./src` stays unchanged, `include: ["src"]` covers new structure
- git `--follow` preserves history for moved files

---

## File Structure

### Final layout

```
packages/host/src/
├── index.ts                               # barrel — updated paths
│
├── plugins/
│   ├── plugin-loader.ts                   # ← from src/plugin-loader.ts
│   ├── plugin-registry.ts                 # ← from src/plugin-registry.ts
│   ├── plugin-manager.ts                  # ← from src/plugin-manager.ts
│   └── store.ts                           # ← from src/store.ts
│
├── runtime/
│   └── runtime-manager.ts                 # ← from src/runtime-manager.ts
│
├── window/
│   ├── window-manager.ts                  # ← from src/window-manager.ts
│   ├── shortcut-manager.ts               # ← from src/shortcut-manager.ts
│   ├── theme.ts                           # ← from src/theme.ts
│   └── hosts/
│       ├── launcher-host.ts               # ← from src/hosts/launcher-host.ts
│       └── floating-host.ts               # ← from src/hosts/floating-host.ts
│
├── ipc/                                   # ← NEW, from src/ipc-handlers.ts split
│   ├── register-handlers.ts
│   ├── builtin-search.ts
│   └── execute-action.ts
│
└── services/
    ├── adapter-bridge.ts                  # ← from src/adapter-bridge.ts
    └── config-manager.ts                  # ← from src/config-manager.ts
```

### Import dependency map (after move)

```
src/index.ts
  ├── ./plugins/plugin-loader.js
  ├── ./plugins/plugin-registry.js
  ├── ./plugins/plugin-manager.js
  ├── ./plugins/store.js
  ├── ./runtime/runtime-manager.js
  ├── ./window/window-manager.js
  ├── ./window/shortcut-manager.js
  ├── ./window/theme.js
  ├── ./window/hosts/launcher-host.js
  ├── ./window/hosts/floating-host.js
  ├── ./ipc/register-handlers.js
  ├── ./services/adapter-bridge.js
  └── ./services/config-manager.js

runtime/runtime-manager.ts
  ├── ../plugins/plugin-manager.js        ← CHANGED (was ./plugin-manager.js)
  └── ../window/window-manager.js          ← CHANGED (was ./window-manager.js)

window/window-manager.ts
  └── ./hosts/floating-host.js             ← SAME (was ./hosts/floating-host.js)
  └── ./hosts/launcher-host.js             ← SAME (was ./hosts/launcher-host.js)

plugins/plugin-manager.ts
  ├── ./plugin-registry.js                 ← SAME (was ./plugin-registry.js)
  └── ./plugin-loader.js                   ← SAME (was ./plugin-loader.js)

plugins/plugin-registry.ts
  └── ./store.js                           ← SAME (was ./store.js)

window/shortcut-manager.ts
  └── ./window-manager.js                  ← SAME (was ./window-manager.js)

ipc/register-handlers.ts                   ← NEW
  ├── ../runtime/runtime-manager.js        ← CHANGED (was ./runtime-manager.js)
  ├── ../window/window-manager.js          ← CHANGED (was ./window-manager.js)
  ├── ./builtin-search.js                  ← NEW (extracted from ipc-handlers.ts)
  └── ./execute-action.js                  ← NEW (extracted from ipc-handlers.ts)
```

### ipc/ split: what goes where

| File | Contains | Key dependencies |
|---|---|---|
| `ipc/builtin-search.ts` | `runBuiltinSearch()`, `calculate()`, `STATIC_APPS`, `SOURCES`, `SearchSource` interface | `@szybko/shared` types only |
| `ipc/execute-action.ts` | `executeAction()` | `@szybko/shared` types, electron `shell`/`clipboard`/`exec` |
| `ipc/register-handlers.ts` | `registerIpcHandlers()`, `notifyShowMainWindow()`, `IpcRequest`/`IpcResponse`/`RendererEvent` type aliases | `@szybko/shared` IPC contracts, imports from both sibling files |

### Consumer impact

Only one file outside `packages/host/` imports from `@szybko/host`:

- `apps/desktop/src/main/index.ts` — imports via barrel, **zero changes needed**

---

## Task 1: Create directories and migrate all pure-move files

**Files:**
- Create: (6 directories) `src/plugins/`, `src/runtime/`, `src/window/hosts/`, `src/ipc/`, `src/services/`
- Move: 10 files + 1 directory (see table below)
- Modify: `src/runtime/runtime-manager.ts` (2 import paths)
- Modify: `src/index.ts` (12 re-export paths)

**Interfaces:**
- Consumes: current file layout (pre-move)
- Produces: new directory tree with 11 files in new locations, barrel updated for pure-move files

### Migration table

| Move (create git mv) | Destination | Import change needed? |
|---|---|---|
| `src/plugin-loader.ts` | `src/plugins/plugin-loader.ts` | No (leaf, no intra-host imports) |
| `src/plugin-registry.ts` | `src/plugins/plugin-registry.ts` | No (`./store.js` → same dir) |
| `src/plugin-manager.ts` | `src/plugins/plugin-manager.ts` | No (imports stay `./`) |
| `src/store.ts` | `src/plugins/store.ts` | No (leaf, no intra-host imports) |
| `src/runtime-manager.ts` | `src/runtime/runtime-manager.ts` | **Yes** — 2 imports need `../` |
| `src/window-manager.ts` | `src/window/window-manager.ts` | No (hosts import same dir) |
| `src/shortcut-manager.ts` | `src/window/shortcut-manager.ts` | No (`./window-manager.js` same dir) |
| `src/theme.ts` | `src/window/theme.ts` | No (leaf, no intra-host imports) |
| `src/adapter-bridge.ts` | `src/services/adapter-bridge.ts` | No (leaf) |
| `src/config-manager.ts` | `src/services/config-manager.ts` | No (leaf) |
| `src/hosts/launcher-host.ts` | `src/window/hosts/launcher-host.ts` | No (leaf) |
| `src/hosts/floating-host.ts` | `src/window/hosts/floating-host.ts` | No (leaf) |

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/host/src/plugins
mkdir -p packages/host/src/runtime
mkdir -p packages/host/src/window/hosts
mkdir -p packages/host/src/ipc
mkdir -p packages/host/src/services
```

Verify:
```bash
ls -d packages/host/src/*/
# Expected: plugins/  runtime/  window/  ipc/  services/  (plus existing)
```

- [ ] **Step 2: Move all 12 files + hosts directory via git mv**

```bash
# Plugin domain
git mv packages/host/src/plugin-loader.ts packages/host/src/plugins/plugin-loader.ts
git mv packages/host/src/plugin-registry.ts packages/host/src/plugins/plugin-registry.ts
git mv packages/host/src/plugin-manager.ts packages/host/src/plugins/plugin-manager.ts
git mv packages/host/src/store.ts packages/host/src/plugins/store.ts

# Runtime domain
git mv packages/host/src/runtime-manager.ts packages/host/src/runtime/runtime-manager.ts

# Window domain
git mv packages/host/src/window-manager.ts packages/host/src/window/window-manager.ts
git mv packages/host/src/shortcut-manager.ts packages/host/src/window/shortcut-manager.ts
git mv packages/host/src/theme.ts packages/host/src/window/theme.ts
git mv packages/host/src/hosts/launcher-host.ts packages/host/src/window/hosts/launcher-host.ts
git mv packages/host/src/hosts/floating-host.ts packages/host/src/window/hosts/floating-host.ts

# Services
git mv packages/host/src/adapter-bridge.ts packages/host/src/services/adapter-bridge.ts
git mv packages/host/src/config-manager.ts packages/host/src/services/config-manager.ts
```

Verify moved files:
```bash
find packages/host/src -name '*.ts' | sort
# Expected: no .ts files directly under src/ (except index.ts and the future ipc/)
```

- [ ] **Step 3: Delete empty `src/hosts/` directory**

```bash
rmdir packages/host/src/hosts
```

- [ ] **Step 4: Update `src/runtime/runtime-manager.ts` imports**

Change the two intra-host imports from `./` to `../`:

```typescript
// BEFORE:
import type { PluginManager } from './plugin-manager';
import type { WindowManager } from './window-manager';

// AFTER:
import type { PluginManager } from '../plugins/plugin-manager';
import type { WindowManager } from '../window/window-manager';
```

- [ ] **Step 5: Update `src/index.ts` barrel for all moved files**

Replace the entire file content:

```typescript
export { ConfigManager } from './services/config-manager';
export { FloatingHost } from './window/hosts/floating-host';
export { LauncherHost } from './window/hosts/launcher-host';
export { PluginLoader } from './plugins/plugin-loader';
export { PluginManager } from './plugins/plugin-manager';
export { PluginRegistry } from './plugins/plugin-registry';
export { RuntimeManager } from './runtime/runtime-manager';
export { ShortcutManager } from './window/shortcut-manager';
export { Store } from './plugins/store';
export { ThemeManager } from './window/theme';
export { WindowManager } from './window/window-manager';
```

Note: `registerIpcHandlers` and `notifyShowMainWindow` exports are removed here — they will be re-added in Task 2 from the new `ipc/register-handlers.js` path.

- [ ] **Step 6: TypeScript type check**

```bash
cd packages/host && npx tsc --noEmit
```

Expected: errors only from the missing `ipc/register-handlers.js` module (since `ipc-handlers.ts` is still at the old location and not yet split). We expect errors like: `Cannot find module './ipc/register-handlers.js' or its corresponding type declarations.` — any OTHER errors indicate a broken import from Task 1.

If there are errors other than the expected ipc-handlers one, fix the broken imports before proceeding.

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/
git commit -m "refactor(host): organize src into domain directories

Move flat src/ files into domain groups:
- plugins/ — plugin-loader, plugin-registry, plugin-manager, store
- runtime/ — runtime-manager
- window/  — window-manager, shortcut-manager, theme
- services/ — adapter-bridge, config-manager
- hosts/ moved under window/

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Split ipc-handlers.ts into ipc/ sub-modules

**Files:**
- Create: `src/ipc/builtin-search.ts`, `src/ipc/execute-action.ts`, `src/ipc/register-handlers.ts`
- Delete: `src/ipc-handlers.ts` (after extraction)
- Modify: `src/index.ts` (add two new export lines)

**Interfaces:**
- Consumes: `WindowManager` (from `../window/window-manager.js`), `RuntimeManager` (from `../runtime/runtime-manager.js`), `@szybko/shared` types
- Produces: `register-handlers.ts` exports `registerIpcHandlers()` and `notifyShowMainWindow()` — same public API as the original `ipc-handlers.ts`

### Extraction map

```
ipc-handlers.ts (273 lines)
├── Lines 1-12:   imports         → register-handlers.ts
├── Lines 14-16:  type aliases    → register-handlers.ts
├── Lines 18-121: search logic    → builtin-search.ts
│   ├── SearchSource interface
│   ├── calculate()
│   ├── STATIC_APPS
│   ├── SOURCES
│   └── runBuiltinSearch()
├── Lines 123-153: executeAction  → execute-action.ts
├── Lines 155-264: registerIpcHandlers → register-handlers.ts
├── Lines 266-272: notifyShowMainWindow → register-handlers.ts
```

- [ ] **Step 1: Create `src/ipc/builtin-search.ts`**

```typescript
import type { SearchResult } from '@szybko/shared';

// ── Built-in search sources ──────────────────────────────────────

interface SearchSource {
    name: string;
    search: (query: string) => SearchResult[];
}

function calculate(query: string): SearchResult[] {
    if (!/^[\d+\-*/.()%\s]+$/.test(query.trim()))
        return [];

    try {
        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${query})`)();
        if (typeof result !== 'number' || !Number.isFinite(result))
            return [];

        return [{
            id: `calc-${Date.now()}`,
            title: String(result),
            subtitle: `${query} =`,
            icon: '🧮',
            group: '计算器',
            score: 100,
            action: { type: 'clipboard.writeText', payload: { text: String(result) } },
        }];
    }
    catch {
        return [];
    }
}

const STATIC_APPS: SearchResult[] = [
    {
        id: 'app-vscode',
        title: 'Visual Studio Code',
        subtitle: '代码编辑器',
        icon: '💻',
        group: '应用',
        score: 90,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.microsoft.VSCode' } },
    },
    {
        id: 'app-terminal',
        title: '终端',
        subtitle: 'Terminal.app',
        icon: '🖥️',
        group: '应用',
        score: 80,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.Terminal' } },
    },
    {
        id: 'app-finder',
        title: '访达',
        subtitle: 'Finder',
        icon: '📁',
        group: '应用',
        score: 70,
        action: { type: 'shell.openPath', payload: { path: '/' } },
    },
    {
        id: 'app-safari',
        title: 'Safari',
        subtitle: '浏览器',
        icon: '🌐',
        group: '应用',
        score: 65,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.Safari' } },
    },
    {
        id: 'app-calendar',
        title: '日历',
        subtitle: 'Calendar',
        icon: '📅',
        group: '应用',
        score: 60,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.iCal' } },
    },
];

const SOURCES: SearchSource[] = [
    { name: 'calculator', search: calculate },
    {
        name: 'apps',
        search: (query: string) => {
            const lower = query.toLowerCase();
            return STATIC_APPS.filter(
                app => app.title.toLowerCase().includes(lower) || app.subtitle?.toLowerCase().includes(lower),
            ).map((app, i) => ({ ...app, score: app.score - i * 5 }));
        },
    },
];

export function runBuiltinSearch(query: string): SearchResult[] {
    if (!query.trim())
        return [];

    const results: SearchResult[] = [];
    for (const source of SOURCES) {
        results.push(...source.search(query));
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
}
```

- [ ] **Step 2: Create `src/ipc/execute-action.ts`**

```typescript
import type { ActionDescriptor } from '@szybko/shared';
import { exec } from 'node:child_process';
import { clipboard, shell } from 'electron';

export function executeAction(action: ActionDescriptor): { ok: boolean; error?: string } {
    switch (action.type) {
        case 'shell.openPath': {
            shell.openPath(action.payload.path);
            return { ok: true };
        }
        case 'shell.openUrl': {
            shell.openExternal(action.payload.url);
            return { ok: true };
        }
        case 'clipboard.writeText': {
            clipboard.writeText(action.payload.text);
            return { ok: true };
        }
        case 'process.launchApp': {
            exec(`open -b "${action.payload.bundleId}"`);
            return { ok: true };
        }
        case 'plugin.open':
        case 'plugin.runCommand': {
            // Plugin actions are handled by the plugin's WebContentsView directly.
            // The main process just acknowledges the action.
            console.warn(`[execute] plugin action: ${action.type}`, action.payload);
            return { ok: true };
        }
        default:
            return { ok: false, error: `Unknown action type: ${(action as any).type}` };
    }
}
```

- [ ] **Step 3: Create `src/ipc/register-handlers.ts`**

```typescript
import type {
    IpcInvokeContract,
    IpcRendererToMainEventContract,
} from '@szybko/shared';
import type { BrowserWindow } from 'electron';
import type { RuntimeManager } from '../runtime/runtime-manager';
import type { WindowManager } from '../window/window-manager';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import { runBuiltinSearch } from './builtin-search';
import { executeAction } from './execute-action';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];
type RendererEvent<C extends keyof IpcRendererToMainEventContract> = IpcRendererToMainEventContract[C];

// ── Register all IPC handlers ─────────────────────────────────────

export function registerIpcHandlers(
    windowManager: WindowManager,
    runtimeManager?: RuntimeManager,
) {
    // ── Search ─────────────────────────────────────────────────────

    ipcMain.handle(
        IPC.SEARCH_QUERY,
        (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): IpcResponse<typeof IPC.SEARCH_QUERY> => {
            // Built-in search
            const results = runBuiltinSearch(req.query);
            const win = windowManager.getWindow();

            if (results.length > 0 && win && !win.isDestroyed()) {
                win.webContents.send(IPC.SEARCH_BATCH, {
                    queryId: req.queryId,
                    batchSeq: 0,
                    source: 'builtin',
                    results,
                    isFinal: false,
                });
            }

            // Plugin search (async — results come back via plugin:search-result)
            if (runtimeManager) {
                runtimeManager.sendPluginSearch(req);
            }

            // Final batch (empty, signals end of built-in results)
            if (win && !win.isDestroyed()) {
                win.webContents.send(IPC.SEARCH_BATCH, {
                    queryId: req.queryId,
                    batchSeq: 1,
                    source: 'builtin',
                    results: [],
                    isFinal: true,
                });
            }

            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.SEARCH_CANCEL,
        (): IpcResponse<typeof IPC.SEARCH_CANCEL> => {
            return { ok: true };
        },
    );

    // ── Plugin search results ──────────────────────────────────────

    ipcMain.on(IPC.PLUGIN_SEARCH_RESULT, (_event, batch: RendererEvent<typeof IPC.PLUGIN_SEARCH_RESULT>) => {
        const win = windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.SEARCH_BATCH, {
                queryId: batch.queryId,
                batchSeq: 0,
                source: 'plugin',
                results: batch.results,
                isFinal: true,
            });
        }
    });

    // ── Window control ─────────────────────────────────────────────

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

    // ── Execute ────────────────────────────────────────────────────

    ipcMain.handle(
        IPC.PLUGIN_EXEC,
        (_event, { action }: IpcRequest<typeof IPC.PLUGIN_EXEC>): IpcResponse<typeof IPC.PLUGIN_EXEC> => {
            return executeAction(action);
        },
    );

    // ── Host switch ────────────────────────────────────────────────

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
}

// ── Push notifications ────────────────────────────────────────────

export function notifyShowMainWindow(win: BrowserWindow) {
    if (!win.isDestroyed()) {
        win.webContents.send(IPC.WINDOW_SHOW);
    }
}
```

- [ ] **Step 4: Delete the original `ipc-handlers.ts`**

```bash
git rm packages/host/src/ipc-handlers.ts
```

- [ ] **Step 5: Update barrel to add new ipc exports**

Edit `src/index.ts` — add the two IPC function exports:

```typescript
export { ConfigManager } from './services/config-manager';
export { FloatingHost } from './window/hosts/floating-host';
export { LauncherHost } from './window/hosts/launcher-host';
export { notifyShowMainWindow, registerIpcHandlers } from './ipc/register-handlers';
export { PluginLoader } from './plugins/plugin-loader';
export { PluginManager } from './plugins/plugin-manager';
export { PluginRegistry } from './plugins/plugin-registry';
export { RuntimeManager } from './runtime/runtime-manager';
export { ShortcutManager } from './window/shortcut-manager';
export { Store } from './plugins/store';
export { ThemeManager } from './window/theme';
export { WindowManager } from './window/window-manager';
```

The key change vs Task 1: `'./ipc/register-handlers.js'` replaces the previous `'./ipc-handlers.js'` for the `registerIpcHandlers` / `notifyShowMainWindow` exports.

- [ ] **Step 6: TypeScript type check**

```bash
cd packages/host && npx tsc --noEmit
```

Expected: zero errors. If there are errors, fix them (most likely import path issues in the new ipc/ files).

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/
git commit -m "refactor(host): split ipc-handlers.ts into domain modules

Extract builtin-search logic and action execution into separate files:
- ipc/builtin-search.ts — runBuiltinSearch, calculate, static apps
- ipc/execute-action.ts — executeAction dispatch
- ipc/register-handlers.ts — IPC wire-up (thin layer)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Final verification — full build and smoke test

**Files:** No file changes — verification only.

**Interfaces:** N/A

- [ ] **Step 1: Run full type check across the entire monorepo**

```bash
cd /path/to/szybko && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Build the host package**

```bash
cd packages/host && pnpm build
```

Expected: Build succeeds, output in `dist/` mirrors new directory structure.

- [ ] **Step 3: Verify the consumer still compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Dev server smoke test (optional, if environment supports it)**

```bash
cd /path/to/szybko && pnpm dev
```

Expected: App launches without import errors. If the app window appears and the search bar works, verification is complete.

- [ ] **Step 5: Verify final tree matches the design spec**

```bash
find packages/host/src -name '*.ts' | sort
```

Expected output:
```
packages/host/src/index.ts
packages/host/src/ipc/builtin-search.ts
packages/host/src/ipc/execute-action.ts
packages/host/src/ipc/register-handlers.ts
packages/host/src/plugins/plugin-loader.ts
packages/host/src/plugins/plugin-manager.ts
packages/host/src/plugins/plugin-registry.ts
packages/host/src/plugins/store.ts
packages/host/src/runtime/runtime-manager.ts
packages/host/src/services/adapter-bridge.ts
packages/host/src/services/config-manager.ts
packages/host/src/window/hosts/floating-host.ts
packages/host/src/window/hosts/launcher-host.ts
packages/host/src/window/shortcut-manager.ts
packages/host/src/window/theme.ts
packages/host/src/window/window-manager.ts
```

16 files, no `ipc-handlers.ts` remaining at root.

- [ ] **Step 6: Final commit (if verification revealed fixes)**

```bash
git commit -m "chore: post-restructure verification fixes"
```
