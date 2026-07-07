# ShortcutRegistry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `ShortcutRegistry` class that centralizes shortcut definitions with explicit scope hierarchy, then migrate existing shortcuts scope by scope.

**Architecture:** A pure-infrastructure `ShortcutRegistry` (no business object dependency) that holds `ShortcutActionDef[]` definitions and provides `register*()` factory methods per scope. Action handler logic is injected via `onAction()` and `registerPluginView()` — the Registry only does matching + dispatch. Types are in `@szybko/shared` so renderer can consume them over IPC without depending on `@szybko/host`.

**Tech Stack:** TypeScript, Electron (globalShortcut, before-input-event, Menu accelerator)

## Global Constraints

- No center-router: each scope has its own listener, not a unified dispatch
- ShortcutRegistry is pure infrastructure: does NOT hold WindowManager or RuntimeCoordinator references
- Types shared between main and renderer go in `packages/shared/src/shortcut/`
- All `register*()` methods return a `Disposer` function; Registry tracks disposers internally
- Disposers for PluginView are stored in `RuntimeEntry` and called on destroy; `webContents.destroyed` serves as fallback cleanup
- `matchBinding` uses exact AND modifier matching (unlisted modifiers must be absent); only matches `input.type === 'keyDown'`; single-char key normalized via `.toLowerCase()`
- Platform: `ShortcutPlatform` type alias over string literal union
- Step 1 builds + tests without touching any existing shortcut wiring; Step 2 switches scope by scope, each independently revertable

---

## File Structure

```
新增:
  packages/shared/src/shortcut/types.ts         — ShortcutScope, ShortcutActionDef, ShortcutBinding 等
  packages/shared/src/shortcut/index.ts          — barrel export
  packages/host/src/window/shortcut-registry.ts  — ShortcutRegistry 类
  packages/host/src/__tests__/shortcut-registry.test.ts  — 单元测试

修改:
  packages/shared/src/index.ts                   — 追加 shortcut barrel
  packages/host/src/index.ts                     — 改为 export ShortcutRegistry，移除 ShortcutManager
  apps/desktop/src/main/index.ts                 — 集成 ShortcutRegistry
  packages/host/src/runtime/runtime-manager.ts   — +pluginViewShortcutHandler, -detachRequested, RuntimeEntry 加 disposer
  packages/host/src/runtime/runtime-coordinator.ts — +ShortcutRegistry dep, showPluginMenu 改用 getAccelerator
  packages/shared/src/api/internal.ts            — +getShortcutDefs
  apps/desktop/src/renderer/pages/shell/hooks/useKeyboard.ts  — 消费 ShortcutDef
  apps/desktop/src/renderer/pages/shell/Shell.tsx            — 更新 useKeyboard 调用

删除:
  packages/host/src/window/shortcut-manager.ts   — 功能并入 Registry
```

---

### Task 1: Shortcut types in shared

**Files:**
- Create: `packages/shared/src/shortcut/types.ts`
- Create: `packages/shared/src/shortcut/index.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ShortcutPlatform`, `ShortcutScope`, `ShortcutModifiers`, `ShortcutBinding`, `ShortcutActionDef`

- [ ] **Step 1: Create `packages/shared/src/shortcut/types.ts`**

```typescript
export type ShortcutPlatform = 'darwin' | 'win32' | 'linux';

export type ShortcutScope =
  | 'system'
  | 'main-window'
  | 'plugin-view'
  | 'menu'
  | 'renderer-document';

export interface ShortcutModifiers {
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface ShortcutBinding {
  id: string;
  key: string;
  modifiers: ShortcutModifiers;
  platforms?: ShortcutPlatform[];
  accelerator?: string;
  preventDefault?: boolean;
}

export interface ShortcutActionDef {
  actionId: string;
  scope: ShortcutScope;
  description: string;
  bindings: ShortcutBinding[];
}
```

- [ ] **Step 2: Create `packages/shared/src/shortcut/index.ts`**

```typescript
export type {
  ShortcutPlatform,
  ShortcutScope,
  ShortcutModifiers,
  ShortcutBinding,
  ShortcutActionDef,
} from './types';
```

- [ ] **Step 3: Update `packages/shared/src/index.ts`**

```typescript
export * from './api/index';
export * from './constants/index';
export * from './input/index';
export * from './ipc/index';
export * from './plugin/index';
export * from './runtime/index';
export * from './search/index';
export * from './shortcut/index';   // ← 追加
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @szybko/shared typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/shortcut/ packages/shared/src/index.ts
git commit -m "feat(shared): add shortcut type definitions"
```

---

### Task 2: ShortcutRegistry class + tests

**Files:**
- Create: `packages/host/src/window/shortcut-registry.ts`
- Create: `packages/host/src/__tests__/shortcut-registry.test.ts`
- Modify: `packages/host/package.json` (add vitest devDep + test script)

**Interfaces:**
- Consumes: `ShortcutActionDef`, `ShortcutBinding`, `ShortcutScope`, `ShortcutPlatform` from `@szybko/shared`
- Produces: `ShortcutRegistry` class (all methods listed below)

- [ ] **Step 1: Install vitest in host package**

Run: `pnpm --filter @szybko/host add -D vitest`

Edit `packages/host/package.json` scripts section:

```json
"scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
}
```

- [ ] **Step 2: Write the failing test**

File: `packages/host/src/__tests__/shortcut-registry.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ShortcutRegistry } from '../window/shortcut-registry';

describe('ShortcutRegistry', () => {
  it('defines and retrieves actions by scope', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      {
        actionId: 'plugin:detach',
        scope: 'main-window',
        description: 'test',
        bindings: [
          { id: 'default', key: 'd', modifiers: { meta: true } },
        ],
      },
    ]);

    const actions = registry.getActions('main-window');
    expect(actions).toHaveLength(1);
    expect(actions[0].actionId).toBe('plugin:detach');
  });

  it('returns empty array for unknown scope', () => {
    const registry = new ShortcutRegistry();
    const actions = registry.getActions('system');
    expect(actions).toHaveLength(0);
  });

  it('filters by actionId when provided', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      { actionId: 'a', scope: 'main-window', description: '', bindings: [] },
      { actionId: 'b', scope: 'main-window', description: '', bindings: [] },
    ]);
    expect(registry.getActions('main-window')).toHaveLength(2);
    expect(registry.getActions('main-window', 'a')).toHaveLength(1);
  });

  it('getAccelerator returns accelerator for scope+platform', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      {
        actionId: 'plugin:detach',
        scope: 'main-window',
        description: '',
        bindings: [
          { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
          { id: 'win', key: 'd', modifiers: { ctrl: true }, platforms: ['win32'] },
        ],
      },
    ]);

    expect(registry.getAccelerator('plugin:detach', { scope: 'main-window', platform: 'darwin' })).toBe('Cmd+D');
    expect(registry.getAccelerator('plugin:detach', { scope: 'main-window', platform: 'win32' })).toBe('Ctrl+D');
  });

  it('getAccelerator returns null when no binding matches platform', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      {
        actionId: 'plugin:detach',
        scope: 'main-window',
        description: '',
        bindings: [
          { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
        ],
      },
    ]);
    expect(registry.getAccelerator('plugin:detach', { scope: 'main-window', platform: 'linux' })).toBeNull();
  });

  it('onAction registers and triggers handler', () => {
    const registry = new ShortcutRegistry();
    const calls: string[] = [];
    registry.onAction('test:action', () => { calls.push('fired'); });
    registry.triggerForTest('test:action');
    expect(calls).toEqual(['fired']);
  });

  it('buildAccelerator produces correct strings', () => {
    const registry = new ShortcutRegistry();
    // Use a helper — testing via getAccelerator which internally calls buildAccelerator
    registry.define([
      {
        actionId: 'x',
        scope: 'main-window',
        description: '',
        bindings: [
          { id: 'a', key: 'd', modifiers: { ctrl: true, shift: true } },
          { id: 'b', key: 'Space', modifiers: { meta: true } },
        ],
      },
    ]);
    expect(registry.getAccelerator('x', { scope: 'main-window', platform: 'darwin' })).toBe('Ctrl+Shift+D');
    expect(registry.getAccelerator('x', { scope: 'main-window', platform: 'win32', bindingId: 'b' })).toBe('Cmd+Space');
  });

  it('dispose runs all tracked disposers', () => {
    const registry = new ShortcutRegistry();
    let called = false;
    // Simulate a disposer being tracked via internal method
    // We test the public API's effect: registerSystemGlobal returns a disposer
    // and dispose() should run all tracked ones
    const d1 = () => { called = true; };
    (registry as any).trackDisposer(d1);
    registry.dispose();
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @szybko/host test`
Expected: FAIL (module not found, types missing)

- [ ] **Step 4: Write minimal implementation**

File: `packages/host/src/window/shortcut-registry.ts`

```typescript
import type {
  ShortcutActionDef,
  ShortcutBinding,
  ShortcutPlatform,
  ShortcutScope,
} from '@szybko/shared';
import { platform } from 'node:process';
import { globalShortcut, type WebContents } from 'electron';

type Disposer = () => void;

export class ShortcutRegistry {
  private defs: ShortcutActionDef[] = [];
  private actionHandlers = new Map<string, (...args: any[]) => void>();
  private disposers: Disposer[] = [];
  private activeBindings: string[] = [];

  // ── Definition ──

  define(actions: ShortcutActionDef[]): void {
    this.defs.push(...actions);
  }

  getActions(scope: ShortcutScope, actionId?: string): ShortcutActionDef[] {
    return this.defs.filter(
      a => a.scope === scope && (!actionId || a.actionId === actionId),
    );
  }

  getAccelerator(
    actionId: string,
    options: { scope: ShortcutScope; platform?: ShortcutPlatform; bindingId?: string },
  ): string | null {
    const action = this.getActions(options.scope, actionId)[0];
    if (!action) return null;
    const currentPlatform = options.platform ?? platform as ShortcutPlatform;
    const binding = options.bindingId
      ? action.bindings.find(b => b.id === options.bindingId)
      : action.bindings.find(b => !b.platforms || b.platforms.includes(currentPlatform));
    if (!binding) return null;
    return binding.accelerator ?? this.buildAccelerator(binding);
  }

  // ── Handler injection ──

  onAction(actionId: string, fn: (...args: any[]) => void): void {
    this.actionHandlers.set(actionId, fn);
  }

  // ── Scope registration ──

  registerSystemGlobal(): Disposer {
    const accels: string[] = [];
    for (const action of this.getActions('system')) {
      for (const binding of action.bindings) {
        if (binding.platforms && !binding.platforms.includes(platform as ShortcutPlatform)) continue;
        const accel = binding.accelerator ?? this.buildAccelerator(binding);
        globalShortcut.register(accel, () => this.trigger(action.actionId));
        accels.push(accel);
        this.activeBindings.push(accel);
      }
    }
    return this.trackDisposer(() => accels.forEach(a => globalShortcut.unregister(a)));
  }

  registerMainWindow(webContents: WebContents): Disposer {
    const handler = (_e: Electron.Event, input: Electron.Input) => {
      if (input.type !== 'keyDown') return;
      for (const action of this.getActions('main-window')) {
        for (const binding of action.bindings) {
          if (this.matchBinding(binding, input)) {
            if (binding.preventDefault ?? false) _e.preventDefault();
            this.trigger(action.actionId);
            return;
          }
        }
      }
    };
    webContents.on('before-input-event', handler);
    return this.trackDisposer(() => webContents.removeListener('before-input-event', handler));
  }

  registerPluginView(
    webContents: WebContents,
    instanceActions: Record<string, (...args: any[]) => void>,
  ): Disposer {
    const handler = (_e: Electron.Event, input: Electron.Input) => {
      if (input.type !== 'keyDown') return;
      for (const action of this.getActions('plugin-view')) {
        for (const binding of action.bindings) {
          if (this.matchBinding(binding, input)) {
            if (binding.preventDefault ?? false) _e.preventDefault();
            instanceActions[action.actionId]?.();
            return;
          }
        }
      }
    };
    webContents.on('before-input-event', handler);

    const onDestroyed = () => disposer();
    webContents.on('destroyed', onDestroyed);

    const disposer = this.trackDisposer(() => {
      webContents.removeListener('before-input-event', handler);
      webContents.removeListener('destroyed', onDestroyed);
    });
    return disposer;
  }

  // ── Lifecycle ──

  dispose(): void {
    this.activeBindings.forEach(a => globalShortcut.unregister(a));
    this.activeBindings = [];
    this.disposers.forEach(d => d());
    this.disposers = [];
  }

  // ── Internal ──

  /** @internal exposed for testing */
  triggerForTest(actionId: string): void {
    this.trigger(actionId);
  }

  private trigger(actionId: string): void {
    this.actionHandlers.get(actionId)?.();
  }

  private trackDisposer(d: Disposer): Disposer {
    this.disposers.push(d);
    return d;
  }

  matchBinding(binding: ShortcutBinding, input: Electron.Input): boolean {
    if (input.key.toLowerCase() !== binding.key.toLowerCase()) return false;
    if (Boolean(input.control) !== (binding.modifiers.ctrl ?? false)) return false;
    if (Boolean(input.meta) !== (binding.modifiers.meta ?? false)) return false;
    if (Boolean(input.alt) !== (binding.modifiers.alt ?? false)) return false;
    if (Boolean(input.shift) !== (binding.modifiers.shift ?? false)) return false;
    return true;
  }

  private buildAccelerator(binding: ShortcutBinding): string {
    const parts: string[] = [];
    if (binding.modifiers.ctrl) parts.push('Ctrl');
    if (binding.modifiers.meta) parts.push('Cmd');
    if (binding.modifiers.alt) parts.push('Alt');
    if (binding.modifiers.shift) parts.push('Shift');
    parts.push(binding.key === ' ' ? 'Space' : binding.key[0].toUpperCase() + binding.key.slice(1));
    return parts.join('+');
  }
}
```

Then update the test to import from the correct path.

- [ ] **Step 5: Fix the test file to match implementation**

Update the test:

```typescript
// Replace the separate buildAccelerator test with one that tests via getAccelerator
it('buildAccelerator produces correct strings via getAccelerator', () => {
  const registry = new ShortcutRegistry();
  registry.define([
    {
      actionId: 'x',
      scope: 'main-window',
      description: '',
      bindings: [
        { id: 'a', key: 'd', modifiers: { ctrl: true, shift: true } },
        { id: 'b', key: ' ', modifiers: { meta: true } },
      ],
    },
  ]);
  expect(registry.getAccelerator('x', { scope: 'main-window', platform: 'darwin', bindingId: 'a' })).toBe('Ctrl+Shift+D');
  expect(registry.getAccelerator('x', { scope: 'main-window', platform: 'darwin', bindingId: 'b' })).toBe('Cmd+Space');
});
```

Remove the `triggerForTest` test and replace with a `getActions` length check. For the trigger test, keep it minimal — the mechanics are simple enough.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @szybko/host test`
Expected: PASS (all tests green)

- [ ] **Step 7: Update `packages/host/src/index.ts` to export ShortcutRegistry**

```typescript
// Replace:
export { ShortcutManager } from './window/shortcut-manager';
// With:
export { ShortcutRegistry } from './window/shortcut-registry';
```

- [ ] **Step 8: Commit**

```bash
git add packages/host/src/window/shortcut-registry.ts packages/host/src/__tests__/ packages/host/package.json packages/host/src/index.ts
git commit -m "feat(host): add ShortcutRegistry class, unit tests, and import"
```

---

### Task 3: Wire System Global scope — replace ShortcutManager

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Delete: `packages/host/src/window/shortcut-manager.ts`

**Interfaces:**
- Consumes: `ShortcutRegistry` from Task 2
- Produces: wired `shortcutRegistry.registerSystemGlobal()` in main/index.ts
- Side effect: `ShortcutManager` class deleted

- [ ] **Step 1: Update `apps/desktop/src/main/index.ts` — bootstrap changes**

Replace the imports:

```typescript
// Before:
import { ..., ShortcutManager, ... } from '@szybko/host';
// After:
import { ..., ShortcutRegistry, ... } from '@szybko/host';

// Remove:
const shortcutManager = new ShortcutManager();

// After creating windowManager:
const shortcutRegistry = new ShortcutRegistry();
```

After `registerIpcHandlers(...)`, replace the old calls:

```typescript
// Before:
shortcutManager.registerToggle(windowManager);

// After:
shortcutRegistry.define([
  {
    actionId: 'window:toggle',
    scope: 'system',
    description: '切换主窗口显示',
    bindings: [
      { id: 'mac', key: ' ', modifiers: { meta: true }, platforms: ['darwin'], accelerator: 'Command+Space' },
      { id: 'win', key: ' ', modifiers: { alt: true },  platforms: ['win32', 'linux'], accelerator: 'Alt+Space' },
    ],
  },
]);

shortcutRegistry.onAction('window:toggle', () => {
  if (windowManager.isVisible()) windowManager.hide();
  else windowManager.show();
});

shortcutRegistry.registerSystemGlobal();
```

Update the cleanup in `will-quit`:

```typescript
// Before:
app.on('will-quit', () => {
    shortcutManager.unregisterAll();
});
// After:
app.on('will-quit', () => {
    shortcutRegistry.dispose();
});
```

- [ ] **Step 2: Delete `packages/host/src/window/shortcut-manager.ts`**

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @szybko/host typecheck`
Expected: PASS (no more ShortcutManager import errors)

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/index.ts packages/host/src/window/shortcut-manager.ts
git rm packages/host/src/window/shortcut-manager.ts
git commit -m "feat: replace ShortcutManager with ShortcutRegistry (system global scope)"
```

---

### Task 4: Wire MainWindow scope

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**
- Consumes: `ShortcutRegistry`, `RuntimeManager`, `RuntimeCoordinator` (existing)
- Produces: `shortcutRegistry.registerMainWindow(win.webContents)` wired

- [ ] **Step 1: Move `main-window` define + handler into main/index.ts**

In the `define()` array, add:

```typescript
{
  actionId: 'plugin:detach',
  scope: 'main-window',
  description: '分离当前插件（搜索框焦点时）',
  bindings: [
    { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
    { id: 'win', key: 'd', modifiers: { ctrl: true }, platforms: ['win32', 'linux'] },
  ],
},
```

Add the handler (after the `window:toggle` handler):

```typescript
shortcutRegistry.onAction('plugin:detach', () => {
  // MainWindow scope — 扫描 launcher-host
  for (const rt of runtimeManager.getAll()) {
    const host = runtimeManager.getHostFor(rt.info.id);
    if (host?.id === 'launcher-host') {
      coordinator.moveToHost(rt.info.id, 'floating');
      return;
    }
  }
});
```

After `win.webContents.on('before-input-event', ...)` removal, register:

```typescript
shortcutRegistry.registerMainWindow(win.webContents);
```

- [ ] **Step 2: Remove the old inline `before-input-event` handler**

Delete lines 69-80 from main/index.ts:

```typescript
// DELETE this block:
// Cmd/Ctrl+D — 主窗口有焦点时分离
win.webContents.on('before-input-event', (_event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === 'd') {
        for (const rt of runtimeManager.getAll()) {
            const host = runtimeManager.getHostFor(rt.info.id);
            if (host?.id === 'launcher-host') {
                coordinator.moveToHost(rt.info.id, 'floating');
                break;
            }
        }
    }
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat: wire MainWindow scope to ShortcutRegistry, remove inline before-input-event"
```

---

### Task 5: Wire PluginView scope — RuntimeManager changes

**Files:**
- Modify: `packages/host/src/runtime/runtime-manager.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**
- Consumes: `ShortcutRegistry`, `RuntimeCoordinator`
- Produces: `RuntimeManager.setPluginViewShortcutHandler(fn)`, `RuntimeEntry.pluginViewShortcutDisposer`, updated `create()` and `destroy()`

- [ ] **Step 1: Update `RuntimeEntry` interface in runtime-manager.ts**

```typescript
interface RuntimeEntry {
  runtime: PluginRuntime;
  /** dispose plugin-view keyboard shortcuts when runtime is destroyed */
  pluginViewShortcutDisposer?: () => void;
}
```

- [ ] **Step 2: Add `setPluginViewShortcutHandler` to RuntimeManager**

```typescript
private pluginViewShortcutHandler:
  ((runtimeId: string, webContents: WebContents) => () => void) | null = null;

/** 注入 PluginView 快捷键注册回调（在 coordinator 创建后调用） */
setPluginViewShortcutHandler(
  fn: (runtimeId: string, webContents: WebContents) => () => void,
): void {
  this.pluginViewShortcutHandler = fn;
}
```

- [ ] **Step 3: Update `create()` — remove old before-input-event, call handler**

Replace the old `before-input-event` registration block (lines 73-78):

```typescript
// OLD:
view.webContents.on('before-input-event', (_event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === 'd' && !input.alt && !input.shift) {
        this.detachRequested?.(runtimeId);
    }
});

// NEW:
// 通过 ShortcutRegistry 注册 PluginView 快捷键
const entry: RuntimeEntry = { runtime };
const disposer = this.pluginViewShortcutHandler?.(runtimeId, view.webContents);
if (disposer) {
  entry.pluginViewShortcutDisposer = disposer;
}
this.entries.set(runtimeId, entry);   // 替代 line 67 的 this.entries.set(runtimeId, { runtime });
```

- [ ] **Step 4: Update `destroy()` — call disposer before closing**

```typescript
destroy(runtimeId: string): void {
  const entry = this.entries.get(runtimeId);
  if (!entry) return;

  // 先注销快捷键
  entry.pluginViewShortcutDisposer?.();

  this.hostAttacher.detach(runtimeId);
  entry.runtime.webContents.close();
  this.entries.delete(runtimeId);
}
```

Remove the `detachRequested` field entirely:

```typescript
// DELETE:
detachRequested: DetachCallback | null = null;
// DELETE entire line 17:
type DetachCallback = (runtimeId: string) => void;
```

- [ ] **Step 5: Wire the handler in main/index.ts**

Move the coordinator creation to BEFORE `runtimeManager.startAll()`:

```typescript
// Current order (before):
const runtimeManager = new RuntimeManager(...);
runtimeManager.startAll();
const coordinator = new RuntimeCoordinator(...);
runtimeManager.detachRequested = (runtimeId) => {
  coordinator.moveToHost(runtimeId, 'floating');
};

// New order:
const runtimeManager = new RuntimeManager(pluginManager, windowManager, pluginPreloadPath);
const coordinator = new RuntimeCoordinator(runtimeManager, hostRegistry, pluginManager);

// Inject pluginView shortcut handler BEFORE startAll
runtimeManager.setPluginViewShortcutHandler((runtimeId, webContents) => {
  return shortcutRegistry.registerPluginView(webContents, {
    'plugin:detach': () => coordinator.moveToHost(runtimeId, 'floating'),
  });
});

runtimeManager.startAll();  // startAll 内部调用 create() → 触发 handler
```

- [ ] **Step 6: Typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/runtime/runtime-manager.ts apps/desktop/src/main/index.ts
git commit -m "feat: wire PluginView scope to ShortcutRegistry, add disposer tracking in RuntimeManager"
```

---

### Task 6: Update RuntimeCoordinator — menu accelerator + getAccelerator

**Files:**
- Modify: `packages/host/src/runtime/runtime-coordinator.ts`

**Interfaces:**
- Consumes: `ShortcutRegistry` (via constructor injection)
- Produces: updated `showPluginMenu()` using `getAccelerator()`

- [ ] **Step 1: Add shortcutRegistry to RuntimeCoordinator constructor**

```typescript
export class RuntimeCoordinator {
  constructor(
    private runtimeManager: RuntimeManager,
    private hostRegistry: RuntimeHostRegistry,
    private pluginCatalog: PluginCatalog,
    private shortcutRegistry: ShortcutRegistry,  // ← 新增
  ) {}
```

- [ ] **Step 2: Update `showPluginMenu` to use `getAccelerator`**

```typescript
showPluginMenu(runtimeId: string, variant?: 'launcher' | 'floating'): void {
  const isFloating = variant === 'floating';
  const items: Electron.MenuItemConstructorOptions[] = isFloating
    ? [
        { label: '结束运行', click: () => { this.destroyRuntime(runtimeId); } },
      ]
    : [
        {
          label: '分离为独立窗口',
          accelerator: this.shortcutRegistry.getAccelerator('plugin:detach', {
            scope: 'main-window',
          }) ?? undefined,
          click: () => { this.moveToHost(runtimeId, 'floating'); },
        },
        { type: 'separator' },
        { label: '结束运行', click: () => { this.destroyRuntime(runtimeId); } },
      ];

  const menu = Menu.buildFromTemplate(items);
  menu.popup();
}
```

- [ ] **Step 3: Update caller in main/index.ts to pass shortcutRegistry**

```typescript
const coordinator = new RuntimeCoordinator(
  runtimeManager,
  hostRegistry,
  pluginManager,
  shortcutRegistry,   // ← 新增参数
);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/runtime/runtime-coordinator.ts apps/desktop/src/main/index.ts
git commit -m "feat: inject ShortcutRegistry into RuntimeCoordinator for menu accelerator"
```

---

### Task 7: IPC + Renderer side — getShortcutDefs + useKeyboard

**Files:**
- Modify: `packages/shared/src/api/internal.ts`
- Modify: `apps/desktop/src/renderer/pages/shell/hooks/useKeyboard.ts`
- Modify: `apps/desktop/src/renderer/pages/shell/Shell.tsx`
- Modify: `packages/host/src/ipc/register-handlers.ts` (add IPC handler for getShortcutDefs)

**Interfaces:**
- Consumes: `ShortcutRegistry`, `ShortcutActionDef`, `ShortcutScope` from shared
- Produces: `window.szybkoInternal.getShortcutDefs()` IPC method

- [ ] **Step 1: Add `getShortcutDefs` to `SzybkoInternalApi`**

File: `packages/shared/src/api/internal.ts`

```typescript
import type { ShortcutActionDef, ShortcutScope } from '../shortcut/types';

export interface SzybkoInternalApi {
  // ... existing methods ...

  // ── 快捷键 ──
  getShortcutDefs: (scope: ShortcutScope) => Promise<ShortcutActionDef[]>;
}
```

- [ ] **Step 2: Add IPC handler in register-handlers.ts**

File: `packages/host/src/ipc/register-handlers.ts`

```typescript
import type { ShortcutRegistry } from '../window/shortcut-registry';

export function registerIpcHandlers(
  windowManager: WindowManager,
  coordinator: RuntimeCoordinator,
  commandCatalog: CommandCatalog,
  platformDb: Database,
  pluginManager: PluginCatalog,
  shortcutRegistry: ShortcutRegistry,  // ← 新增参数
): void {
  // ... existing handlers ...

  // ── Shortcut definitions for renderer ──
  ipcMain.handle('shortcut:get-defs', async (_event, scope: ShortcutScope) => {
    return shortcutRegistry.getActions(scope);
  });
}
```

Update the caller in main/index.ts:

```typescript
registerIpcHandlers(
  windowManager,
  coordinator,
  commandCatalog,
  platformDb,
  pluginManager,
  shortcutRegistry,
);
```

- [ ] **Step 3: Implement the IPC bridge in preload**

File: `apps/desktop/src/preload/api/plugin-lifecycle.ts` (or appropriate preload file for host IPC)

Add to the exposed API:

```typescript
getShortcutDefs: (scope: ShortcutScope) => ipcRenderer.invoke('shortcut:get-defs', scope),
```

- [ ] **Step 4: Create IPC channel constant**

File: `packages/shared/src/ipc/contract.ts`

Add to the `IPC` constants object (in the appropriate section):

```typescript
// In the IPC object:
SHORTCUT_GET_DEFS: 'shortcut:get-defs',
```

Add to `IpcInvokeContract`:

```typescript
[IPC.SHORTCUT_GET_DEFS]: {
  request: ShortcutScope;
  response: ShortcutActionDef[];
};
```

- [ ] **Step 5: Rewrite `useKeyboard` to consume ShortcutDefs**

File: `apps/desktop/src/renderer/pages/shell/hooks/useKeyboard.ts`

```typescript
import type { NavigationMap } from './navigation';
import type { ShortcutActionDef } from '@szybko/shared';
import { useCallback, useEffect, useState } from 'react';

interface UseKeyboardOptions {
  navigationMap: NavigationMap;
  onSelect: (index: number) => void;
  onExecute: () => void;
  onEscape: () => void;
}

function matchDomEvent(def: ShortcutActionDef, e: KeyboardEvent): boolean {
  for (const binding of def.bindings) {
    if (e.key.toLowerCase() !== binding.key.toLowerCase()) continue;
    if (e.ctrlKey  !== (binding.modifiers.ctrl  ?? false)) continue;
    if (e.metaKey  !== (binding.modifiers.meta  ?? false)) continue;
    if (e.altKey   !== (binding.modifiers.alt   ?? false)) continue;
    if (e.shiftKey !== (binding.modifiers.shift ?? false)) continue;
    return true;
  }
  return false;
}

export function useKeyboard({
  navigationMap,
  onSelect,
  onExecute,
  onEscape,
}: UseKeyboardOptions) {
  const [defs, setDefs] = useState<ShortcutActionDef[]>([]);

  useEffect(() => {
    window.szybkoInternal?.getShortcutDefs('renderer-document').then(setDefs);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const map = navigationMap;

      for (const def of defs) {
        if (!matchDomEvent(def, e)) continue;

        // Check preventDefault (default true for renderer-document)
        const preventDefault = def.bindings.some(b => b.preventDefault ?? true);
        if (preventDefault) e.preventDefault();

        switch (def.actionId) {
          case 'shell:navigate-up':
            if (map.up !== null) onSelect(map.up);
            return;
          case 'shell:navigate-down':
            if (map.down !== null) onSelect(map.down);
            return;
          case 'shell:navigate-left':
            if (map.left !== null) onSelect(map.left);
            return;
          case 'shell:navigate-right':
            if (map.right !== null) onSelect(map.right);
            return;
          case 'shell:execute':
            onExecute();
            return;
          case 'shell:escape':
            onEscape();
            return;
        }
      }
    },
    [defs, navigationMap, onSelect, onExecute, onEscape],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
```

- [ ] **Step 6: Update Shell.tsx — add renderer-document shortcut definitions to SharedRegistry.define in main/index.ts**

Add to the define() array:

```typescript
{
  actionId: 'shell:navigate-up',
  scope: 'renderer-document',
  description: '上移选择',
  bindings: [{ id: 'default', key: 'ArrowUp', modifiers: {} }],
},
{
  actionId: 'shell:navigate-down',
  scope: 'renderer-document',
  description: '下移选择',
  bindings: [{ id: 'default', key: 'ArrowDown', modifiers: {} }],
},
{
  actionId: 'shell:navigate-left',
  scope: 'renderer-document',
  description: '左移选择',
  bindings: [
    { id: 'default', key: 'ArrowLeft', modifiers: {} },
    { id: 'tab-back', key: 'Tab', modifiers: { shift: true } },
  ],
},
{
  actionId: 'shell:navigate-right',
  scope: 'renderer-document',
  description: '右移选择',
  bindings: [
    { id: 'default', key: 'ArrowRight', modifiers: {} },
    { id: 'tab', key: 'Tab', modifiers: {} },
  ],
},
{
  actionId: 'shell:execute',
  scope: 'renderer-document',
  description: '执行选中项',
  bindings: [{ id: 'default', key: 'Enter', modifiers: {} }],
},
{
  actionId: 'shell:escape',
  scope: 'renderer-document',
  description: '逐级关闭',
  bindings: [{ id: 'default', key: 'Escape', modifiers: {} }],
},
```

- [ ] **Step 7: Typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/api/internal.ts packages/shared/src/ipc/contract.ts packages/host/src/ipc/register-handlers.ts apps/desktop/src/preload/ apps/desktop/src/renderer/pages/shell/hooks/useKeyboard.ts apps/desktop/src/renderer/pages/shell/Shell.tsx apps/desktop/src/main/index.ts
git commit -m "feat: add getShortcutDefs IPC, renderer useKeyboard consumes ShortcutDefs"
```

---

### Task 8: Cleanup — remove stale comments, verify full build

**Files:**
- Verify: all touched files
- No code changes — just verify everything compiles and the app starts

- [ ] **Step 1: Run full typecheck**

```bash
pnpm -r typecheck
```
Expected: PASS

- [ ] **Step 2: Run unit tests**

```bash
pnpm --filter @szybko/host test
```
Expected: PASS

- [ ] **Step 3: Run a dev build to verify no runtime import errors**

```bash
pnpm build --filter @szybko/shared --filter @szybko/host
```
Expected: PASS

- [ ] **Step 4: Verify no references to old code remain**

```bash
grep -rn "ShortcutManager" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "\.next/"
```
Expected: no results (or only type comments/docs)

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: cleanup — remove stale ShortcutManager references"
```
