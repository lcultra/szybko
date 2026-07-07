# 插件生命周期 API 重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `onRuntimeStateChanged`，新增插件侧 `onPluginDetach` 和宿主侧 `onPluginSlotChanged`。

**Architecture:** 自底向上——先改 shared 的 IPC 通道和合约类型，再改 API 类型定义，然后改 preload 和 hook 的消费方，最后改 RuntimeManager 的发送方并清理废弃模块。

**Tech Stack:** TypeScript, Electron IPC, Zustand

**Global Constraints:**
- 所有 IPC 通道常量定义在 `packages/shared/src/ipc/channels.ts` 的 `IPC` 对象中
- 所有 IPC 合约类型定义在 `packages/shared/src/ipc/contract.ts` 中
- 插件 API 类型定义在 `packages/shared/src/api/plugin.ts`（SzybkoPluginApi）和 `packages/sdk/src/types/api.d.ts`（SzybkoPluginSDK）
- 宿主 API 类型定义在 `packages/shared/src/api/internal.ts`（SzybkoInternalApi）
- `RuntimeSlot` 定义在 `packages/shared/src/runtime/types.ts`，通过 `@szybko/shared` re-export
- 删除的文件必须同步更新 `packages/host/src/index.ts` 的导出

---

## 任务拆分

### Task 1: @szybko/shared — IPC 通道和合约类型

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts` — 删除 P 及新增两常量
- Modify: `packages/shared/src/ipc/contract.ts` — 删除 RuntimeStatePayload、新增 PluginDetachPayload、更新 IpcMainToRendererEventContract

**Interfaces:**
- Consumes: 无
- Produces: `IPC.PLUGIN_SLOT_CHANGED`, `IPC.PLUGIN_DETACH`, `PluginDetachPayload`；删除 `IPC.PLUGIN_RUNTIME_STATE`, `RuntimeStatePayload`

- [ ] **Step 1: 修改 channels.ts**

当前 `PLUGIN_RUNTIME_STATE` 在第 15 行。删除它，在合适位置新增两个常量：

```typescript
// packages/shared/src/ipc/channels.ts
export const IPC = {
    // ... 现有代码 ...

    // ── 插件运行时 ──
    PLUGIN_EXEC: 'plugin:exec',
    // 删除此行: PLUGIN_RUNTIME_STATE: 'plugin:runtime-state',
    PLUGIN_DETACH: 'plugin:detach',         // 新增
    PLUGIN_SLOT_CHANGED: 'plugin:slot-changed', // 新增
    HOST_SWITCH: 'host:switch',
    // ... 其余不变 ...
};
```

把 `PLUGIN_DETACH` 和 `PLUGIN_SLOT_CHANGED` 放在 `PLUGIN_EXEC` 之后、`HOST_SWITCH` 之前。

- [ ] **Step 2: 修改 contract.ts — 新增 PluginDetachPayload + 删除 RuntimeStatePayload**

```typescript
// 删除 RuntimeStatePayload 整个 interface（第 106-115 行）
// export interface RuntimeStatePayload { ... }  ← 删除

// 新增 PluginDetachPayload（放在 PluginOutPayload 之后）
export interface PluginDetachPayload {
  runtimeId: string;
  pluginId: string;
  reason: 'move' | 'hide' | 'destroy';
}
```

- [ ] **Step 3: 更新 IpcMainToRendererEventContract**

```typescript
// 当前（第 147-156 行）：
export interface IpcMainToRendererEventContract {
    [IPC.SEARCH_RESPONSE]: SearchResponse;
    [IPC.WINDOW_SHOW]: void;
    [IPC.THEME_CHANGED]: { isDark: boolean };
    [IPC.PLUGIN_RUNTIME_STATE]: RuntimeStatePayload;  // ← 删除此行
    [IPC.PLUGIN_ENTER]: PluginEnterPayload;
    [IPC.PLUGIN_OUT]: PluginOutPayload;
    [IPC.FLOATING_SLOT_UPDATE]: RuntimeSlot;
}

// 改为：
export interface IpcMainToRendererEventContract {
    [IPC.SEARCH_RESPONSE]: SearchResponse;
    [IPC.WINDOW_SHOW]: void;
    [IPC.THEME_CHANGED]: { isDark: boolean };
    [IPC.PLUGIN_DETACH]: PluginDetachPayload;       // 新增
    [IPC.PLUGIN_SLOT_CHANGED]: RuntimeSlot;          // 新增
    [IPC.PLUGIN_ENTER]: PluginEnterPayload;
    [IPC.PLUGIN_OUT]: PluginOutPayload;
    [IPC.FLOATING_SLOT_UPDATE]: RuntimeSlot;
}
```

- [ ] **Step 4: 清理不再需要的 import**

`RuntimeStatePayload` 不再需要 import。检查 `contract.ts` 顶部的 import 行，删除对 `RuntimeStatePayload` 的 import（如果有的话——当前文件没有显式 import，它是本地定义的，所以直接删除整个 interface 即可）。

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/contract.ts
git commit -m "refactor(shared): add PLUGIN_DETACH + PLUGIN_SLOT_CHANGED, remove PLUGIN_RUNTIME_STATE"
```

---

### Task 2: @szybko/shared + @szybko/sdk — API 类型定义

**Files:**
- Modify: `packages/shared/src/api/internal.ts`
- Modify: `packages/shared/src/api/plugin.ts`
- Modify: `packages/sdk/src/types/api.d.ts`

**Interfaces:**
- Consumes: `PluginDetachPayload`, `RuntimeSlot`（来自 Task 1）
- Produces: `SzybkoInternalApi.onPluginSlotChanged`, `SzybkoPluginApi.onPluginDetach`, `SzybkoPluginSDK.onPluginDetach`

- [ ] **Step 1: 修改 internal.ts**

```typescript
// packages/shared/src/api/internal.ts
import type { RuntimeSlot } from '../runtime/types';
// 删除: import type { RuntimeStatePayload } from '../ipc/contract';

// 在 SzybkoInternalApi 中：
    // ── 插件运行时 ──
    hidePlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    destroyPlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    showPluginMenu: (runtimeId: string, hostType?: 'launcher' | 'floating') => Promise<{ ok: boolean }>;
    pinPlugin: (runtimeId: string, pin: boolean) => Promise<{ ok: boolean }>;
    // 删除: onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;
    onPluginSlotChanged: (cb: (slot: RuntimeSlot) => void) => () => void;  // 新增
```

- [ ] **Step 2: 修改 plugin.ts**

```typescript
// packages/shared/src/api/plugin.ts
import type { PluginEnterPayload, PluginOutPayload, PluginDetachPayload } from '../ipc/contract';
// 删除: import type { RuntimeStatePayload } from '../ipc/contract';

export interface SzybkoPluginApi {
    execute: (action: ActionDescriptor) => Promise<...>;
    switchHost: (runtimeId: string, targetHost: 'launcher' | 'floating') => Promise<...>;
    setFeature: (feature: PluginFeature) => Promise<...>;
    getFeatures: (codes?: string[]) => Promise<...>;
    removeFeature: (code: string) => Promise<...>;
    // 删除: onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;
    onPluginDetach: (cb: (payload: PluginDetachPayload) => void) => () => void;  // 新增
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
}
```

- [ ] **Step 3: 修改 SDK api.d.ts**

```typescript
// packages/sdk/src/types/api.d.ts
// 删除: import type { RuntimeStatePayload } from '@szybko/shared';
// 新增: import type { PluginDetachPayload } from '@szybko/shared';
// import type { ActionDescriptor, PluginEnterPayload, PluginFeature, PluginOutPayload, PluginDetachPayload } from '@szybko/shared';

export interface SzybkoPluginSDK {
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    switchHost: (runtimeId: string, targetHost: 'launcher' | 'floating') => Promise<{ ok: boolean; hostId?: string; error?: string }>;
    setFeature: (feature: PluginFeature) => Promise<{ ok: boolean; error?: string }>;
    getFeatures: (codes?: string[]) => Promise<PluginFeature[]>;
    removeFeature: (code: string) => Promise<{ ok: boolean; error?: string }>;
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
    // 删除: onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;
    onPluginDetach: (cb: (payload: PluginDetachPayload) => void) => () => void;  // 新增
}
```

- [ ] **Step 4: 类型检查**

```bash
pnpm build --filter @szybko/shared && pnpm build --filter @szybko/sdk
```
Expected: 编译通过，无类型错误。

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/api/internal.ts packages/shared/src/api/plugin.ts packages/sdk/src/types/api.d.ts
git commit -m "refactor(shared,sdk): update API types — add onPluginSlotChanged, onPluginDetach"
```

---

### Task 3: apps/desktop — Preload API 更新

**Files:**
- Modify: `apps/desktop/src/preload/api/plugin-lifecycle.ts`
- Modify: `apps/desktop/src/preload/host.ts`

**Interfaces:**
- Consumes: `SzybkoInternalApi`, `SzybkoPluginApi` 类型（来自 Task 2）
- Produces: 更新后的 `createPluginLifecycleApi()` 和 `szybkoInternal` 对象

- [ ] **Step 1: 修改 plugin-lifecycle.ts**

```typescript
// apps/desktop/src/preload/api/plugin-lifecycle.ts
import { IPC } from '@szybko/shared';
import { on } from './ipc';

export function createPluginLifecycleApi() {
    return {
        /** 用户选中插件 feature，插件进入自身 UI 模式 */
        onPluginEnter: on(IPC.PLUGIN_ENTER),

        /** 插件从宿主分离（移动/隐藏/销毁） */
        onPluginDetach: on(IPC.PLUGIN_DETACH),

        /** 宿主通知插件被隐藏或销毁 */
        onPluginOut: on(IPC.PLUGIN_OUT),
    };
}
```

删除了 `onRuntimeStateChanged` 和相关的注释。

- [ ] **Step 2: 修改 host.ts**

```typescript
// apps/desktop/src/preload/host.ts
import type { SzybkoInternalApi } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { contextBridge } from 'electron';
import { on } from './api/ipc';
import { createItemApi } from './api/item';
import { createLayoutApi } from './api/layout';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';
import { createPluginManagementApi } from './api/plugin-management';
import { createSearchApi } from './api/search';
import { createThemeApi } from './api/theme';
import { createWindowApi } from './api/window';

const internalApi = {
    ...createSearchApi(),
    ...createItemApi(),
    ...createWindowApi(),
    ...createThemeApi(),
    ...createLayoutApi(),
    ...createPluginManagementApi(),
    onPluginSlotChanged: on(IPC.PLUGIN_SLOT_CHANGED),  // 新增（替换 onRuntimeStateChanged）
    onFloatingSlotUpdate: on(IPC.FLOATING_SLOT_UPDATE),
} satisfies SzybkoInternalApi;

contextBridge.exposeInMainWorld('szybkoInternal', internalApi);
```

关键变更：
- 移除了 `createPluginLifecycleApi()` 的调用（不再需要从那里取 `onRuntimeStateChanged`）
- 新增 `onPluginSlotChanged: on(IPC.PLUGIN_SLOT_CHANGED)` 直接注册 IPC

- [ ] **Step 3: 类型检查**

```bash
pnpm build --filter @szybko/shared && pnpm --filter apps/desktop build
```
Expected: 编译通过。

- [ ] **Step 4: 提交**

```bash
git add apps/desktop/src/preload/api/plugin-lifecycle.ts apps/desktop/src/preload/host.ts
git commit -m "refactor(desktop): update preload APIs — swap to onPluginSlotChanged + onPluginDetach"
```

---

### Task 4: apps/desktop — Host renderer hook 重写

**Files:**
- Modify: `apps/desktop/src/renderer/hooks/usePluginRuntime.ts`

**Interfaces:**
- Consumes: `window.szybkoInternal.onPluginSlotChanged`（来自 Task 2/3）
- Produces: 无（内部 hook）

- [ ] **Step 1: 重写 usePluginRuntime.ts**

```typescript
import { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { useRuntimeStore } from '../stores/runtime-store';

/**
 * 插件运行时生命周期 hook。
 * 订阅 onPluginSlotChanged → launcher slot 占据/腾空时同步更新 RuntimeStore + AppStore。
 */
export function usePluginRuntime() {
    const setSlot = useRuntimeStore(s => s.setSlot);
    const clearSlot = useRuntimeStore(s => s.clearSlot);
    const setAppState = useAppStore(s => s.setState);

    useEffect(() => {
        const cleanup = window.szybkoInternal?.onPluginSlotChanged?.((slot) => {
            if (slot.mountState === 'attached') {
                setSlot({
                    runtimeId: slot.runtimeId ?? '',
                    pluginId: slot.pluginId ?? '',
                    featureExplain: slot.featureExplain,
                    cmdLabel: slot.cmdLabel,
                    loadState: slot.loadState,
                    mountState: slot.mountState,
                    iconUrl: slot.iconUrl ?? '',
                });
                setAppState('plugin');
            } else {
                clearSlot();
                setAppState('idle');
            }
        });
        return () => cleanup?.();
    }, [setSlot, clearSlot, setAppState]);
}
```

- [ ] **Step 2: 检查运行时 store 中 RuntimeSlot import**

确认 `apps/desktop/src/renderer/stores/runtime-store.ts` 中 `INITIAL_SLOT` 的 `loadState` 是 `'loading'`，这个不会变化——`usePluginRuntime` 中 attached 时发来的 `loadState` 才是从主进程同步的 `'loaded'`。没问题。

- [ ] **Step 3: 提交**

```bash
git add apps/desktop/src/renderer/hooks/usePluginRuntime.ts
git commit -m "refactor(desktop): rewrite usePluginRuntime to use onPluginSlotChanged"
```

---

### Task 5: @szybko/host — RuntimeManager 改造 + 清理

**Files:**
- Modify: `packages/host/src/runtime/runtime-manager.ts`
- Delete: `packages/host/src/runtime/runtime-state-publisher.ts`
- Modify: `packages/host/src/index.ts`

**Interfaces:**
- Consumes: `IPC.PLUGIN_SLOT_CHANGED`, `IPC.PLUGIN_DETACH`, `PluginDetachPayload`, `RuntimeSlot`, `WindowManager`
- Produces: 无（内部逻辑改动）

- [ ] **Step 1: 修改 RuntimeManager — 删除旧依赖，新增常量**

删除 `RuntimeStatePublisher` 相关的内容，新增 `EMPTY_SLOT` 常量和 `RuntimeSlot` import：

```typescript
// packages/host/src/runtime/runtime-manager.ts
import type { LoadState, MountState, PluginEnterPayload, RuntimeSlot } from '@szybko/shared';
// 删除: import type { PluginCatalog } from '../plugins/plugin-catalog';
// 删除: import type { RuntimeHost } from '../window/hosts/runtime-host';
// 删除: import type { WindowManager } from '../window/window-manager';
// 删除: import type { PluginRuntime } from './types';
// 删除: import { IPC } from '@szybko/shared';
// 删除: import { isFocusable } from '../window/hosts/capabilities';
// 删除: import { RuntimeHostAttacher } from './runtime-host-attacher';
// 删除: import { RuntimeStatePublisher } from './runtime-state-publisher';
// 删除: import { RuntimeViewFactory } from './runtime-view-factory';

// 修改 import 部分：
import type { LoadState, MountState, PluginEnterPayload, RuntimeSlot } from '@szybko/shared';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { RuntimeHost } from '../window/hosts/runtime-host';
import type { WindowManager } from '../window/window-manager';
import type { PluginRuntime } from './types';
import { IPC } from '@szybko/shared';
import { isFocusable } from '../window/hosts/capabilities';
import { RuntimeHostAttacher } from './runtime-host-attacher';
// 删除: import { RuntimeStatePublisher } from './runtime-state-publisher';
import { RuntimeViewFactory } from './runtime-view-factory';
```

新增 `EMPTY_SLOT` 私有常量：

```typescript
public class RuntimeManager {
    private entries: Map<string, RuntimeEntry> = new Map();
    private viewFactory: RuntimeViewFactory;
    private hostAttacher: RuntimeHostAttacher;
    // 删除: private statePublisher: RuntimeStatePublisher;

    private readonly EMPTY_SLOT: RuntimeSlot = {
        runtimeId: null,
        pluginId: null,
        featureExplain: '',
        cmdLabel: '',
        loadState: 'loaded',
        mountState: 'detached',
    };
    // ... 其余不变 ...
```

删除 constructor 中的 `RuntimeStatePublisher` 创建：

```typescript
constructor(
    private pluginManager: PluginCatalog,
    private windowManager: WindowManager,
    private pluginPreloadPath: string,
) {
    this.viewFactory = new RuntimeViewFactory(this.pluginPreloadPath);
    this.hostAttacher = new RuntimeHostAttacher();
    // 删除: this.statePublisher = new RuntimeStatePublisher(this.windowManager, this.pluginManager);
}
```

- [ ] **Step 2: 修改 attachToHost() — 添加 launcher-only slot 通知**

在 `attachToHost()` 方法结尾，发完 `PLUGIN_ENTER` 后（现有第 155 行附近），新增 launcher slot 通知：

```typescript
// 通知插件进入（已有代码，保留不变）
entry.runtime.webContents.send(IPC.PLUGIN_ENTER, enterPayload ?? {
    pluginId: entry.runtime.info.pluginId,
    code: featureCode ?? entry.runtime.info.pluginId,
    type: 'text',
    payload: null,
    from: 'main',
});

// ── 新增：仅当挂载到 launcher 时通知主窗口 ──
if (host.type === 'launcher') {
    const win = this.windowManager.getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IPC.PLUGIN_SLOT_CHANGED, {
        runtimeId: entry.runtime.info.id,
        pluginId: entry.runtime.info.pluginId,
        featureExplain,
        cmdLabel,
        loadState: entry.runtime.info.loadState,
        mountState: 'attached',
        iconUrl,
    });
}
```

- [ ] **Step 3: 修改 detachFromHost() — 添加 launcher-only slot 通知 + 总是发送 PLUGIN_DETACH**

```typescript
/** 从 Host 分离插件 */
detachFromHost(runtimeId: string, reason?: 'hide' | 'destroy'): void {
    const entry = this.entries.get(runtimeId);
    if (!entry)
        return;

    // 获取当前的 host（用于后续判断是否要发 slot 通知）
    const currentHost = this.hostAttacher.getHostFor(runtimeId);

    this.hostAttacher.detach(runtimeId);

    entry.runtime.info.mountState = 'detached';
    entry.runtime.info.hostInfo = null;

    // 删除: this.publishState(runtimeId, 'detached', entry.runtime.info.loadState);

    // ── 新增：总是发送 PLUGIN_DETACH ──
    entry.runtime.webContents.send(IPC.PLUGIN_DETACH, {
        runtimeId: entry.runtime.info.id,
        pluginId: entry.runtime.info.pluginId,
        reason: reason ?? 'move',
    });

    // detach 带原因时，通知插件（保留向后兼容）
    if (reason) {
        entry.runtime.webContents.send(IPC.PLUGIN_OUT, {
            runtimeId: entry.runtime.info.id,
            pluginId: entry.runtime.info.pluginId,
            reason,
        });
    }

    // ── 新增：仅当从 launcher detach 时通知主窗口 slot 清空 ──
    if (currentHost?.type === 'launcher') {
        const win = this.windowManager.getWindow();
        if (!win || win.isDestroyed()) return;
        win.webContents.send(IPC.PLUGIN_SLOT_CHANGED, this.EMPTY_SLOT);
    }
}
```

- [ ] **Step 4: 删除 publishState() 方法**

删除 `RuntimeManager` 中的 `publishState()` 私有方法（原第 247-252 行）：

```typescript
// private publishState(...) { ... }  ← 整个删除
```

- [ ] **Step 5: 修改 index.ts — 删除 RuntimeStatePublisher 导出**

```typescript
// packages/host/src/index.ts
// 删除此行:
// export { RuntimeStatePublisher } from './runtime/runtime-state-publisher';
```

- [ ] **Step 6: 删除 RuntimeStatePublisher 文件**

```bash
rm packages/host/src/runtime/runtime-state-publisher.ts
```

- [ ] **Step 7: 编译检查**

```bash
pnpm build
```
Expected: 全部包编译通过，无类型错误。

- [ ] **Step 8: 提交**

```bash
git add packages/host/src/runtime/runtime-manager.ts \
       packages/host/src/index.ts
git rm packages/host/src/runtime/runtime-state-publisher.ts
git commit -m "refactor(host): remove RuntimeStatePublisher, add launcher slot + always-detach"
```

---

## 自检清单

| 需求 | 覆盖任务 |
|---|---|
| 删除 `PLUGIN_RUNTIME_STATE` 通道常量 | Task 1 |
| 删除 `RuntimeStatePayload` interface | Task 1 |
| 更新 `IpcMainToRendererEventContract` | Task 1 |
| 新增 `PLUGIN_DETACH` 通道 + `PluginDetachPayload` | Task 1 |
| 新增 `PLUGIN_SLOT_CHANGED` 通道（复用 `RuntimeSlot`） | Task 1 |
| 更新 `SzybkoInternalApi` | Task 2 |
| 更新 `SzybkoPluginApi` | Task 2 |
| 更新 `SzybkoPluginSDK` | Task 2 |
| 更新 `createPluginLifecycleApi()` | Task 3 |
| 更新 `host.ts` preload | Task 3 |
| 重写 `usePluginRuntime` hook | Task 4 |
| `RuntimeManager` 删除 `RuntimeStatePublisher` | Task 5 |
| `attachToHost()` 发 launcher-only slot | Task 5 |
| `detachFromHost()` 总是发 `PLUGIN_DETACH` | Task 5 |
| `detachFromHost()` 发 launcher-only slot 清空 | Task 5 |
| 删除 `RuntimeStatePublisher.ts` | Task 5 |
| 更新 `index.ts` 导出 | Task 5 |
