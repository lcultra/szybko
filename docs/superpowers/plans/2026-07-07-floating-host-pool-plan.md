# Floating Host Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate floating window creation latency by pooling and reusing FloatingRuntimeHost instances.

**Architecture:** Add a pool of 2 idle FloatingRuntimeHosts to RuntimeHostRegistry. Pre-created hosts receive real slot info via a new IPC channel `floating:slot-update` when reused. A `dispose()` method using `window.destroy()` (no beforeunload) separates pool eviction from user-triggered close.

**Tech Stack:** Electron IPC (`@szybko/shared` channels/contract), Electron `BrowserWindow`, React (zustand), Vite

## Global Constraints

- Pool size = 2 (idle hosts), no target/max split
- New IPC channel: `floating:slot-update` (main → floating renderer push)
- New method `dispose()` uses `window.destroy()` — does NOT trigger `beforeunload`
- Existing `close()` uses `window.close()` — unchanged, still triggers `beforeunload`
- `createWindow()` BrowserWindow options must include `show: false`
- Host ID format: `floating-pool-${counter++}` (incrementing counter, not Date.now())
- Renderer-side API: `window.szybkoInternal.onFloatingSlotUpdate(cb) => () => void`
- `pendingSlot` cached on FloatingRuntimeHost; re-sent on `did-finish-load`

---

## File Structure

| File | Responsibility | Change |
|------|---------------|--------|
| `packages/shared/src/ipc/channels.ts` | IPC channel name constants | Add `FLOATING_SLOT_UPDATE` |
| `packages/shared/src/ipc/contract.ts` | IPC request/response/event type contracts | Add to `IpcMainToRendererEventContract` |
| `packages/shared/src/api/internal.ts` | `SzybkoInternalApi` interface | Add `onFloatingSlotUpdate` method |
| `packages/host/src/window/hosts/floating-runtime-host.ts` | Floating window host | Add `preloadWindow()`, `dispose()`, `pushSlotUpdate()`, `pendingSlot`; modify `createWindow(show:false)`, `detach(reset)` |
| `packages/host/src/window/runtime-host-registry.ts` | Registry + pool | Add `acquireFloatingHost()`, `releaseFloatingHost()`, `scheduleReplenish()`; counter ID |
| `packages/host/src/runtime/runtime-coordinator.ts` | Business flow entry | `moveToHost()`: `createFloatingHost`→`acquireFloatingHost`, add release |
| `apps/desktop/src/preload/host.ts` | Host preload bridge | Expose `onFloatingSlotUpdate` |
| `apps/desktop/src/renderer/pages/floating/FloatingApp.tsx` | Floating window React root | Listen for IPC slot updates |
| `apps/desktop/src/renderer/components/plugin/PluginHeader.tsx` | Plugin header UI | Reset `pinned` on `runtimeId` change |

---

### Task 1: New IPC Channel + Types

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/contract.ts`
- Modify: `packages/shared/src/api/internal.ts`

**Interfaces:**
- Consumes: `RuntimeSlot` from `@szybko/shared/runtime/types` (already exported)
- Produces: `IPC.FLOATING_SLOT_UPDATE` channel; `IpcMainToRendererEventContract[IPC.FLOATING_SLOT_UPDATE]: RuntimeSlot`; `SzybkoInternalApi.onFloatingSlotUpdate`

- [ ] **Step 1: Add channel constant**

In `packages/shared/src/ipc/channels.ts`, add after `PLUGIN_OUT`:
```ts
// ── 浮动窗口池（main → floating renderer） ──
FLOATING_SLOT_UPDATE: 'floating:slot-update',
```

- [ ] **Step 2: Add to event contract**

In `packages/shared/src/ipc/contract.ts`, add to `IpcMainToRendererEventContract` (after `[IPC.PLUGIN_OUT]`):
```ts
[IPC.FLOATING_SLOT_UPDATE]: RuntimeSlot;
```

The `RuntimeSlot` import already exists at `@szybko/shared` — verify it's imported in `contract.ts`. If not:
```ts
import type { RuntimeSlot } from '../runtime/types';
```

- [ ] **Step 3: Add to SzybkoInternalApi interface**

In `packages/shared/src/api/internal.ts`, add an import for `RuntimeSlot` at the top (with other type imports):
```ts
import type { RuntimeSlot } from '../runtime/types';
```

Then add to `SzybkoInternalApi` interface (after `onRuntimeStateChanged`):
```ts
/**
 * 浮动窗口 slot 更新推送（pool 复用窗口时切换插件信息）
 */
onFloatingSlotUpdate: (cb: (slot: RuntimeSlot) => void) => () => void;
```

- [ ] **Step 4: TypeScript check**

```bash
pnpm --filter @szybko/shared typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/contract.ts packages/shared/src/api/internal.ts
git commit -m "feat(shared): add FLOATING_SLOT_UPDATE IPC channel for floating host pool"
```

---

### Task 2: FloatingRuntimeHost — pool-ready host

**Files:**
- Modify: `packages/host/src/window/hosts/floating-runtime-host.ts`

**Interfaces:**
- Consumes: `IPC.FLOATING_SLOT_UPDATE` from `@szybko/shared`
- Produces: `preloadWindow()`, `dispose()`, `pushSlotUpdate()`, `pendingSlot`; modified `createWindow(show:false)`, `detach(reset)`

- [ ] **Step 1: Add import for IPC + RuntimeSlot**

In `packages/host/src/window/hosts/floating-runtime-host.ts`, update imports:
```ts
import { BORDER_WIDTH, DEFAULT_WINDOW_WIDTH, FLOATING_WINDOW_DEFAULT_HEIGHT, HEADER_HEIGHT, IPC } from '@szybko/shared';
import type { RuntimeSlot } from '@szybko/shared';
```

`RuntimeSlot` is already imported as a type. Add `IPC` to the destructured import from `@szybko/shared`.

- [ ] **Step 2: Add `pendingSlot` field**

In the class body, after `private currentMeta: HostMeta | null = null;`:
```ts
private pendingSlot: RuntimeSlot | null = null;
```

- [ ] **Step 3: Modify `createWindow()` — add `show: false` + pending handler**

In the `BrowserWindow` constructor options, add `show: false`:
```ts
this.window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: FLOATING_WINDOW_DEFAULT_HEIGHT,
    frame: false,
    hasShadow: false,
    transparent: true,
    show: false,           // ← add: hidden until attach()
    titleBarStyle: 'hidden',
    // ... rest unchanged ...
});
```

After the resize event registrations (`this.window.on('unmaximize', this.relayout);`), add the `did-finish-load` handler:
```ts
// 页面加载完成时补发 pending slot（pool 复用场景）
this.window.webContents.on('did-finish-load', () => {
    if (this.pendingSlot) {
        this.window!.webContents.send(IPC.FLOATING_SLOT_UPDATE, this.pendingSlot);
    }
});
```

- [ ] **Step 4: Modify `attach()` — pool-aware**

Replace the existing `attach()` method:
```ts
attach(view: WebContentsView, meta: HostMeta): void {
    this.currentMeta = meta;

    if (!this.window) {
        this.createWindow(meta);       // 首次创建
    } else {
        this.pushSlotUpdate(meta);     // 池复用 → IPC 更新 slot
    }

    if (view) {
        this.view = view;
        this.window!.contentView.addChildView(view);
        this.relayout();
    }

    this.window!.show();              // show:false 的窗口在此显示
}
```

- [ ] **Step 5: Modify `detach()` — add reset**

Replace the existing `detach()` method:
```ts
detach(): void {
    if (this.view && this.window && !this.window.isDestroyed()) {
        this.window.contentView.removeChildView(this.view);
    }
    this.view = null;
    this.setAlwaysOnTop(false);       // 重置置顶
    this.pendingSlot = null;          // 清除 pending slot
    this.window?.hide();
}
```

- [ ] **Step 6: Add `preloadWindow()`**

Add after `detach()`:
```ts
/** 预创建窗口（pool 补充用）：BrowserWindow 先建好，保持隐藏 */
preloadWindow(): void {
    const placeholderMeta: HostMeta = {
        runtimeId: '', pluginId: '', featureExplain: '', cmdLabel: '',
    };
    this.createWindow(placeholderMeta);
}
```

- [ ] **Step 7: Add `pushSlotUpdate()`**

Add after `preloadWindow()`:
```ts
/** 向浮动渲染器推送当前 slot（窗口已存在时更新标题栏信息） */
private pushSlotUpdate(meta: HostMeta): void {
    const slot: RuntimeSlot = {
        runtimeId: meta.runtimeId,
        pluginId: meta.pluginId,
        featureExplain: meta.featureExplain,
        cmdLabel: meta.cmdLabel ?? '',
        loadState: 'loaded',
        mountState: 'attached',
    };
    this.pendingSlot = slot;
    if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IPC.FLOATING_SLOT_UPDATE, slot);
    }
}
```

- [ ] **Step 8: Add `dispose()`**

Add after `pushSlotUpdate()`:
```ts
/** 池 eviction 用：强制销毁，不触发 beforeunload */
dispose(): void {
    if (this.window) {
        this.window.removeAllListeners();
        this.window.destroy();         // ← 不触发 beforeunload/close 事件
    }
    this.window = null;
    this.view = null;
    this.currentMeta = null;
    this.pendingSlot = null;
}
```

Note: the existing `close()` method remains unchanged — it still calls `window.close()` which triggers `beforeunload`.

- [ ] **Step 9: Build check**

```bash
pnpm --filter @szybko/host build
```

- [ ] **Step 10: Commit**

```bash
git add packages/host/src/window/hosts/floating-runtime-host.ts
git commit -m "feat(host): pool-ready FloatingRuntimeHost — preloadWindow, dispose, pushSlotUpdate, pendingSlot, show:false, detach reset"
```

---

### Task 3: RuntimeHostRegistry Pool

**Files:**
- Modify: `packages/host/src/window/runtime-host-registry.ts`

**Interfaces:**
- Consumes: `FloatingRuntimeHost.preloadWindow()`, `FloatingRuntimeHost.dispose()` from Task 2; `FloatingRuntimeHost` class
- Produces: `acquireFloatingHost(): FloatingRuntimeHost`, `releaseFloatingHost(host: void)`, `scheduleReplenish()`

- [ ] **Step 1: Add pool fields**

In `RuntimeHostRegistry` class, add before the constructor:
```ts
private floatingPool: FloatingRuntimeHost[] = [];
private static nextId = 0;
private replenishing = false;
```

- [ ] **Step 2: Modify `createFloatingHost()` — change ID generation**

Replace the existing `createFloatingHost()`:
```ts
createFloatingHost(): FloatingRuntimeHost {
    const id = `floating-pool-${RuntimeHostRegistry.nextId++}`;
    const host = new FloatingRuntimeHost(id, this.hostPreloadPath);
    this.hosts.set(host.id, host);
    return host;
}
```

- [ ] **Step 3: Add `acquireFloatingHost()`**

Add after `createFloatingHost()`:
```ts
/** 从池中获取或新建一个浮动 host */
acquireFloatingHost(): FloatingRuntimeHost {
    const host = this.floatingPool.pop() ?? this.createFloatingHost();
    this.scheduleReplenish();
    return host;
}
```

- [ ] **Step 4: Add `releaseFloatingHost()`**

Add after `acquireFloatingHost()`:
```ts
/** 归还浮动 host 到池（或池满时静默销毁） */
releaseFloatingHost(host: FloatingRuntimeHost): void {
    if (this.floatingPool.length >= 2) {
        host.dispose();
        this.hosts.delete(host.id);
    } else {
        host.detach();
        this.floatingPool.push(host);
    }
}
```

- [ ] **Step 5: Add `scheduleReplenish()`**

Add after `releaseFloatingHost()`:
```ts
/** 异步补充池到目标大小 2 */
private scheduleReplenish(): void {
    if (this.replenishing) return;
    this.replenishing = true;
    setImmediate(() => {
        this.replenishing = false;
        while (this.floatingPool.length < 2) {
            const host = this.createFloatingHost();
            host.preloadWindow();
            this.floatingPool.push(host);
        }
    });
}
```

- [ ] **Step 6: Build check**

```bash
pnpm --filter @szybko/host build
```

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/window/runtime-host-registry.ts
git commit -m "feat(host): FloatingHostPool — acquire/release/scheduleReplenish, counter ID"
```

---

### Task 4: RuntimeCoordinator — moveToHost integration

**Files:**
- Modify: `packages/host/src/runtime/runtime-coordinator.ts`

**Interfaces:**
- Consumes: `RuntimeHostRegistry.acquireFloatingHost()`, `RuntimeHostRegistry.releaseFloatingHost()`
- Produces: Updated `moveToHost()` that uses pool

- [ ] **Step 1: Import FloatingRuntimeHost**

Add to the import block at the top of `packages/host/src/runtime/runtime-coordinator.ts`:
```ts
import { FloatingRuntimeHost } from '../window/hosts/floating-runtime-host';
```

(If `FloatingRuntimeHost` is already imported, skip. Check existing imports first.)

- [ ] **Step 2: Rewrite `moveToHost()`**

Replace the existing `moveToHost()` method:
```ts
moveToHost(runtimeId: string, targetType: 'launcher' | 'floating'): void {
    const runtime = this.runtimeManager.get(runtimeId);
    if (!runtime)
        return;

    const currentHost = this.runtimeManager.getHostFor(runtimeId);
    if (currentHost) {
        this.runtimeManager.detachFromHost(runtimeId);

        // 从浮动移走 → 归还到池（不销毁）
        if (currentHost.type === 'floating') {
            this.hostRegistry.releaseFloatingHost(currentHost as FloatingRuntimeHost);
        }
    }

    const host = targetType === 'launcher'
        ? this.hostRegistry.getOrCreateLauncherHost()
        : this.hostRegistry.acquireFloatingHost();

    this.runtimeManager.attachToHost(runtimeId, host);
}
```

- [ ] **Step 3: Build check**

```bash
pnpm --filter @szybko/host build
```

- [ ] **Step 4: Commit**

```bash
git add packages/host/src/runtime/runtime-coordinator.ts
git commit -m "feat(host): moveToHost uses pool acquire/release"
```

---

### Task 5: Preload — expose onFloatingSlotUpdate

**Files:**
- Modify: `apps/desktop/src/preload/host.ts`

**Interfaces:**
- Consumes: `IPC.FLOATING_SLOT_UPDATE` from `@szybko/shared`; `on()` helper from `./api/ipc`
- Produces: `window.szybkoInternal.onFloatingSlotUpdate` available in floating renderer

- [ ] **Step 1: Add listener to internalApi**

In `packages/desktop/src/preload/host.ts`, in the `internalApi` object literal, add after `onRuntimeStateChanged`:
```ts
onFloatingSlotUpdate: on(IPC.FLOATING_SLOT_UPDATE),
```

- [ ] **Step 2: Verify `IPC` is imported**

Check that `IPC` is imported from `@szybko/shared` at the top of `host.ts`. The existing import should be:
```ts
import { contextBridge } from 'electron';
// ... other imports
```

If `IPC` is not imported, add:
```ts
import { IPC } from '@szybko/shared';
```

- [ ] **Step 3: Build check**

```bash
pnpm --filter @szybko/desktop build
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/preload/host.ts
git commit -m "feat(desktop): expose onFloatingSlotUpdate in host preload"
```

---

### Task 6: FloatingApp.tsx — slot update listener

**Files:**
- Modify: `apps/desktop/src/renderer/pages/floating/FloatingApp.tsx`

**Interfaces:**
- Consumes: `window.szybkoInternal.onFloatingSlotUpdate`
- Produces: Slot updates via `useRuntimeStore.setSlot()`

- [ ] **Step 1: Add slot update listener effect**

In `apps/desktop/src/renderer/pages/floating/FloatingApp.tsx`, add a second `useEffect` after the existing mount effect:

```tsx
// 监听 IPC slot 更新（pool 复用窗口时切换插件信息）
useEffect(() => {
    const unsubscribe = window.szybkoInternal?.onFloatingSlotUpdate?.((slot) => {
        setSlot(slot);
        // runtimeId 变化 → PluginHeader 的 pin state 自动重置
    });
    return () => unsubscribe?.();
}, [setSlot]);
```

The file's existing imports (`useEffect`, `setSlot` from `useRuntimeStore`) are already in place.

- [ ] **Step 2: Build check**

```bash
pnpm --filter @szybko/desktop build
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/pages/floating/FloatingApp.tsx
git commit -m "feat(desktop): FloatingApp listens for onFloatingSlotUpdate IPC"
```

---

### Task 7: PluginHeader.tsx — reset pinned state on runtimeId change

**Files:**
- Modify: `apps/desktop/src/renderer/components/plugin/PluginHeader.tsx`

**Interfaces:**
- Consumes: `useRuntimeStore` (already used)
- Produces: `pinned` state reset when pool swaps plugin

- [ ] **Step 1: Add reset effect**

In `apps/desktop/src/renderer/components/plugin/PluginHeader.tsx`, after the existing `const [pinned, setPinned] = useState(false);` line, add:

```tsx
// runtimeId 变化时重置 pin 状态（pool 复用切换插件）
const activeRuntimeId = useRuntimeStore(s => s.slot.runtimeId);
useEffect(() => {
    setPinned(false);
}, [activeRuntimeId]);
```

Note: `activeRuntimeId` is already declared in the component (line 14: `const activeRuntimeId = useRuntimeStore(s => s.slot.runtimeId);`). So this step just adds the `useEffect` — `activeRuntimeId` already exists.

- [ ] **Step 2: Verify imports**

Ensure `useEffect` is imported from `react` at the top of the file. The existing import should be:
```ts
import { useCallback, useState } from 'react';
```
Add `useEffect` to this import:
```ts
import { useCallback, useEffect, useState } from 'react';
```

- [ ] **Step 3: Build check**

```bash
pnpm --filter @szybko/desktop build
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/plugin/PluginHeader.tsx
git commit -m "feat(desktop): PluginHeader resets pinned on runtimeId change"
```

---

## Verification

### Build
```bash
pnpm build
```

### Manual test: basic detach cycle
1. Launch the app: `pnpm dev`
2. Search and activate a plugin → it appears in the launcher
3. Press Cmd+D → plugin detaches to floating window (first time: may have creation latency)
4. Merge back (close or switch to another plugin in launcher) → floating window hides, host returns to pool
5. Press Cmd+D again on the (or another) plugin → floating window should appear instantly (no delay)
6. Repeat steps 4-5 several times → verify no window accumulation (check `windowManager` or OS window list)

### Manual test: pool eviction safety
1. Detach plugin A to floating
2. Merge A back
3. Repeat 3+ times (detach A → merge A) → rapid cycling
4. Verify plugin A still works (not destroyed by beforeunload)

### Manual test: pool replenishment
1. Fresh start → immediately detach plugin A → pool empty, new window created
2. Merge A back → A's host goes to pool
3. Detach plugin B → instant (reuses pooled window)
4. Verify B's header shows correct plugin name/icon (slot update works)

### Manual test: close vs dispose semantics
1. Detach plugin A to floating
2. Close the floating window explicitly (click X or press Cmd+W) → plugin A should be destroyed (current behavior)
3. Verify plugin A is removed from runtime list
4. Detach plugin B → new window created (no stale host for A)
