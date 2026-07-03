# 核心抽象精炼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分 2 阶段重构插件 Runtime 体系的核心抽象，使插件的注册、检索、运行、分离、隐藏、销毁等底层能力原子化且职责清晰，后续多 Host 类型、多实例、插件市场等功能迭代无需大重构。

**Architecture:** PluginCatalog 负责插件发现/查询，RuntimeManager 负责 Runtime 生命周期和状态机，RuntimeHost 接口族负责 view 挂载，RuntimeHostRegistry 负责 Host 实例管理，WindowManager 负责 BrowserWindow 原语，RuntimeCoordinator 作为所有业务流程的强制入口。

**Tech Stack:** Electron 43, pnpm monorepo, TypeScript 5.x

## Global Constraints

- `@szybko/shared` 必须保持零 Electron 依赖（不导入 electron 类型）
- PluginRuntime 的 `webContentsView`/`webContents` 类型只在 `packages/host` 包内
- 每步必须可独立合入，不破坏现有功能
- **每步必须通过 `pnpm -r run typecheck`**（根目录 `npx tsc --noEmit` 是空跑，无效）
- 每步必须可回退

## 前置修复

在开始任何步骤前，修复当前 typecheck 基线失败：

```bash
# 当前基线失败原因：builtins.ts 找不到 @szybko/plugin-launcher 类型
# packages/host/src/plugins/builtins.ts:2
# 修复：添加类型声明或修复 import
```

```bash
# 验证基线通过
pnpm -r run typecheck 2>&1
# 全部 package 通过
```

---

## 文件结构映射

### Phase 1 后（重命名 + 类型分拆 + 补充缺失方法 + 旧 IPC 不变）

| 文件 | 改动 |
|------|------|
| `packages/shared/src/runtime/types.ts` | 新增 `LoadState`, `MountState`, `RuntimeInfo`, `RuntimeHostInfo`（可序列化）；**保留旧 `Host`/`PluginRuntime`/`RuntimeState` 不变** |
| `packages/host/src/runtime/types.ts` | **新建** host 版 `PluginRuntime`（含 `WebContentsView`）+ `ActivationContext`；宿主类型暂不使用，旧 shared 类型继续工作 |
| `packages/host/src/runtime/runtime-manager.ts` | 补充缺少的方法：`get()`, `getAll()`, `destroy()`；重命名 `PluginManager` 引用为 `PluginCatalog`；**attachToWindow/detachFromWindow 行为不变** |
| `packages/host/src/plugins/plugin-catalog.ts` | **改名** 自 plugin-manager.ts，类名 `PluginCatalog` |
| `packages/host/src/plugins/store.ts → persistence/store.ts` | **移动** |
| `packages/host/src/window/hosts/launcher-runtime-host.ts` | **改名** 自 launcher-host.ts（行为不变，attach/detach 只改 state flags） |
| `packages/host/src/window/hosts/floating-runtime-host.ts` | **改名** 自 floating-host.ts（行为不变） |
| `packages/host/src/window/runtime-host-registry.ts` | **新建** 从 WindowManager 抽取 host 注册/工厂逻辑 |
| `packages/host/src/window/window-manager.ts` | 内部持有 `RuntimeHostRegistry` 单例；`createHost/registerHost/getHost` 保留（委托给 Registry） |
| `apps/desktop/src/main/index.ts` | 使用新类名；调用 `windowManager.initHostRegistry()` 初始化 |
| **IPC payload** | **完全不变**——Shell 继续读 `payload.state`、`payload.pluginName`、`payload.featureExplain` |

### Phase 2 后（RuntimeHost 接口 + RuntimeCoordinator + 状态机双轴 + 新 IPC）

| 文件 | 改动 |
|------|------|
| `packages/host/src/window/hosts/runtime-host.ts` | **新建** host 包内 `RuntimeHost` 接口（`attach(runtime, view?)`）+ 能力接口 |
| `packages/host/src/window/hosts/launcher-runtime-host.ts` | 改为实现 `RuntimeHost`（不再实现 shared `Host`）；attach/detach 通过 `WindowManager` 操作 view |
| `packages/host/src/window/hosts/floating-runtime-host.ts` | 改为实现 `RuntimeHost` + `Focusable/Pinnable/Closable`；detach 只移除 view 不关窗口 |
| `packages/host/src/window/runtime-host-registry.ts` | 类型从 `Map<string, Host>` → `Map<string, RuntimeHost>` |
| `packages/host/src/window/window-manager.ts` | 移除 `createHost/registerHost/getHost` 兼容方法；移除 `attachPluginView/detachPluginView/pluginView` |
| `packages/host/src/runtime/runtime-manager.ts` | `attachToWindow` → `attachToHost`（调 `RuntimeHost.attach`）；`detachFromWindow` → `detachFromHost`（调 `RuntimeHost.detach`）；移除 `matchPluginFeatures`（归 `PluginCatalog`）；移除 `detachToFloatingWindow/pinPluginWindow`（归 `RuntimeCoordinator`）；**新增 `loadState/mountState` RuntimeEntry 字段** + `transitionLoadState/transitionMountState` |
| `packages/host/src/runtime/runtime-coordinator.ts` | **新建** 强制业务入口 |
| `packages/host/src/plugins/plugin-catalog.ts` | 移入 `matchFeatures()` |
| `packages/host/src/ipc/register-handlers.ts` | IPC handler 统一调 `RuntimeCoordinator` |
| `packages/host/src/ipc/execute-action.ts` | `plugin.open` 移入 Coordinator |
| `packages/shared/src/ipc/contract.ts` | 补 `PluginOutPayload`, `MoveToHostRequest`；`RuntimeStatePayload`**保留旧字段**(`state`, `pluginName`, `featureExplain`) + 新增 `mountState`/`loadState` |
| `packages/shared/src/ipc/channels.ts` | 补 `PLUGIN_OUT` |
| `packages/shared/src/runtime/types.ts` | 移除旧 `Host`/`PluginRuntime`（已无人使用） |
| `apps/desktop/src/main/index.ts` | 创建 `RuntimeCoordinator`，注入给 `registerIpcHandlers` |
| `apps/desktop/src/preload/api/plugin-lifecycle.ts` | 暴露 `onPluginOut` |

---

## Phase 1：重命名 + 类型分拆 + 补齐方法 + 旧 IPC 不变

### Task P1-1：修复 typecheck 基线

**Files:**
- Modify: TBD（修复 `builtins.ts` 的 `@szybko/plugin-launcher` import）

**Interfaces:** 无

- [ ] **Step 1: 确定基线失败原因**

```bash
pnpm -r run typecheck 2>&1 | tee /tmp/typecheck-baseline.log
# 确认 packages/host 报错：Cannot find module '@szybko/plugin-launcher'
```

- [ ] **Step 2: 修复 builtins.ts 引用**

```typescript
// packages/host/src/plugins/builtins.ts
// 当前：import { search as launcherSearch } from '@szybko/plugin-launcher';
// 修复：使用动态 require 或添加类型声明

// 方案 A（推荐）：如果 plugin-launcher 是 workspace 包，确认它在 pnpm-workspace.yaml 中
// 方案 B：添加 declare module 声明
// packages/host/src/plugins/plugin-launcher.d.ts（或其他类型声明）
declare module '@szybko/plugin-launcher' {
    export function search(query: string): import('@szybko/shared').SearchResult[];
}
```

- [ ] **Step 3: 验证基线通过**

```bash
pnpm -r run typecheck 2>&1
# 全部 package 通过
```

- [ ] **Step 4: Commit**

```bash
git add <修复的文件>
git commit -m "fix: resolve typecheck baseline - add @szybko/plugin-launcher type declaration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task P1-2：扩展 shared 类型 + 创建 host 运行时类型

**Files:**
- Modify: `packages/shared/src/runtime/types.ts`
- Create: `packages/host/src/runtime/types.ts`
- Modify: `packages/host/src/index.ts`

**Interfaces:**
- Produces (shared): `LoadState`, `MountState`, `RuntimeInfo`, `RuntimeHostInfo`
- Produces (host): `PluginRuntime` (with WebContentsView), `ActivationContext`
- 旧 `Host`/`PluginRuntime`/`RuntimeState` 保留不变

- [ ] **Step 1: 扩展 shared/src/runtime/types.ts——新增可序列化类型，保留旧类型**

```typescript
// packages/shared/src/runtime/types.ts

// ── 旧类型（保留，Phase 2 再移除） ──
export interface Host {
    id: string;
    type: 'launcher' | 'floating';
    attach: (runtime: PluginRuntime) => void;
    detach: (runtime: PluginRuntime) => void;
}

export interface PluginRuntime {
    id: string;
    pluginId: string;
    instanceId: string;
    host: Host | null;
    state: RuntimeState;
    cache: Map<string, any>;
}

export type RuntimeState = 'created' | 'activated' | 'attached' | 'detached' | 'suspended' | 'destroyed';

// ── 新类型（可序列化，无 Electron 依赖） ──
export type LoadState = 'loading' | 'loaded' | 'error';
export type MountState = 'attached' | 'detached';

export interface RuntimeInfo {
    id: string;
    pluginId: string;
    instanceId: string;
    loadState: LoadState;
    mountState: MountState;
    hostInfo: RuntimeHostInfo | null;
}

export interface RuntimeHostInfo {
    id: string;
    type: 'launcher' | 'floating';
}
```

- [ ] **Step 2: 新增 host/src/runtime/types.ts**

```typescript
// packages/host/src/runtime/types.ts

import type { RuntimeInfo } from '@szybko/shared';
import type { WebContents, WebContentsView } from 'electron';

/** 插件激活上下文——每次进入时的动态参数 */
export interface ActivationContext {
    featureCode: string;
    featureExplain?: string;
    keyword?: string;
    query?: string;
}

/** 主进程内部的完整 Runtime 表示（Phase 2 全面启用） */
export interface PluginRuntime {
    info: RuntimeInfo;
    webContentsView: WebContentsView;
    webContents: WebContents;
    cache: Map<string, any>;
    pluginName: string;
    currentActivation?: ActivationContext;
}
```

- [ ] **Step 3: 更新 host/src/index.ts 导出**

```typescript
export type { PluginRuntime, ActivationContext } from './runtime/types';
```

- [ ] **Step 4: 验证无编译错误 + shared 无 Electron leak**

```bash
pnpm -r run typecheck 2>&1
grep -r 'electron' packages/shared/src/ --include='*.ts'
# 期望输出空
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/runtime/types.ts packages/host/src/runtime/types.ts packages/host/src/index.ts
git commit -m "refactor: add RuntimeInfo/RuntimeHostInfo types, create host/runtime/types.ts

- shared: add LoadState, MountState, RuntimeInfo, RuntimeHostInfo (serializable)
- host: create PluginRuntime (with WebContentsView), ActivationContext
- Keep old Host/PluginRuntime types for backward compat (removed in Phase 2)
- No behavior changes, IPC payload unchanged

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task P1-3：补充 RuntimeManager 缺失方法（get / getAll / destroy）

**Files:**
- Modify: `packages/host/src/runtime/runtime-manager.ts`

**Interfaces:**
- 新增：`get(runtimeId)` → `PluginRuntime | undefined`
- 新增：`getAll()` → `PluginRuntime[]`
- 新增：`destroy(runtimeId)` → `void`
- 这三个方法在 Phase 2 会被 `RuntimeCoordinator` 和状态机使用，现在先加上

- [ ] **Step 1: 在 RuntimeManager 中添加 get / getAll / destroy**

```typescript
// packages/host/src/runtime/runtime-manager.ts

/** 获取单个 Runtime */
get(runtimeId: string): PluginRuntime | undefined {
    return this.entries.get(runtimeId)?.runtime;
}

/** 获取所有 Runtime */
getAll(): PluginRuntime[] {
    return Array.from(this.entries.values()).map(e => e.runtime);
}

/** 销毁 Runtime（内部逻辑与 destroyFromWindow 一致，但不操作窗口） */
destroy(runtimeId: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;
    entry.view.webContents.close();
    this.entries.delete(runtimeId);
    // Phase 2 Coordinator 会在 destroy 前先 detachFromHost
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm -r run typecheck 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add packages/host/src/runtime/runtime-manager.ts
git commit -m "refactor: add get/getAll/destroy methods to RuntimeManager

- get(runtimeId): lookup single runtime
- getAll(): list all runtimes
- destroy(runtimeId): clean WebContents + remove entry
- These are needed by RuntimeCoordinator in Phase 2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task P1-4：重命名 PluginManager → PluginCatalog

**Files:**
- Create: `packages/host/src/plugins/plugin-catalog.ts`
- Delete: `packages/host/src/plugins/plugin-manager.ts`
- Modify: `packages/host/src/runtime/runtime-manager.ts`
- Modify: `packages/host/src/index.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: 创建 plugin-catalog.ts（复制 + 改名）**
- [ ] **Step 2: 更新所有 import/export**
- [ ] **Step 3: 删除旧文件**
- [ ] **Step 4: 类型检查**

```bash
pnpm -r run typecheck 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add ... && git rm packages/host/src/plugins/plugin-manager.ts
git commit -m "refactor: rename PluginManager → PluginCatalog"
```

---

### Task P1-5：重命名 LauncherHost → LauncherRuntimeHost

- 与 Task P1-4 模式一致，只改名不改行为

---

### Task P1-6：重命名 FloatingHost → FloatingRuntimeHost

- 与 Task P1-4 模式一致，只改名不改行为

---

### Task P1-7：从 WindowManager 抽取 RuntimeHostRegistry（单例）

**Files:**
- Create: `packages/host/src/window/runtime-host-registry.ts`
- Modify: `packages/host/src/window/window-manager.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `packages/host/src/index.ts`

**关键约束：RuntimeHostRegistry 只在一个地方创建，WindowManager 是其唯一持有者。**

- [ ] **Step 1: 新建 RuntimeHostRegistry**

```typescript
// packages/host/src/window/runtime-host-registry.ts

import type { Host } from '@szybko/shared';
import { LauncherRuntimeHost } from './hosts/launcher-runtime-host';
import { FloatingRuntimeHost } from './hosts/floating-runtime-host';

export class RuntimeHostRegistry {
    private hosts: Map<string, Host> = new Map();
    private launcherHost: LauncherRuntimeHost | null = null;

    getOrCreateLauncherHost(): LauncherRuntimeHost {
        if (!this.launcherHost) {
            this.launcherHost = new LauncherRuntimeHost(`launcher-host`);
            this.hosts.set(this.launcherHost.id, this.launcherHost);
        }
        return this.launcherHost;
    }

    createFloatingHost(): FloatingRuntimeHost {
        const host = new FloatingRuntimeHost(`floating-${Date.now()}`);
        this.hosts.set(host.id, host);
        return host;
    }

    registerHost(host: Host): void {
        this.hosts.set(host.id, host);
    }

    unregisterHost(hostId: string): void {
        this.hosts.delete(hostId);
    }

    getHost(hostId: string): Host | undefined {
        return this.hosts.get(hostId);
    }

    getAllHosts(): Host[] {
        return Array.from(this.hosts.values());
    }
}
```

- [ ] **Step 2: WindowManager 内部持有 Registry 单例（initHostRegistry）**

```typescript
// packages/host/src/window/window-manager.ts
// 新增以下内容，保留其他所有现有方法

import { RuntimeHostRegistry } from './runtime-host-registry';

export class WindowManager {
    private window: BrowserWindow | null = null;
    private hostRegistry: RuntimeHostRegistry | null = null;
    // ... 现有其他字段 ...

    /** 初始化 Host 注册表（main/index.ts 启动时调用一次） */
    initHostRegistry(): RuntimeHostRegistry {
        this.hostRegistry = new RuntimeHostRegistry();
        return this.hostRegistry;
    }

    getHostRegistry(): RuntimeHostRegistry | null {
        return this.hostRegistry;
    }

    // ── 兼容方法（委托给 Registry，Phase 2 移除） ──
    createHost(type: 'launcher' | 'floating'): Host {
        if (!this.hostRegistry) {
            // 降级（无 registry 时直接用旧行为）
            if (type === 'launcher') return new LauncherRuntimeHost(`launcher-${Date.now()}`);
            return new FloatingRuntimeHost(`floating-${Date.now()}`);
        }
        if (type === 'launcher') return this.hostRegistry.getOrCreateLauncherHost();
        return this.hostRegistry.createFloatingHost();
    }

    registerHost(id: string, host: Host): void {
        this.hostRegistry?.registerHost(host);
    }

    getHost(id: string): Host | undefined {
        return this.hostRegistry?.getHost(id);
    }
}
```

- [ ] **Step 3: 在 main/index.ts 中初始化 Registry（仅一次）**

```typescript
// apps/desktop/src/main/index.ts

const windowManager = new WindowManager();
const hostRegistry = windowManager.initHostRegistry();  // ← 唯一创建点
// 注意：不要 new RuntimeHostRegistry(windowManager) —— 这是第二个实例
```

- [ ] **Step 4: 类型检查**

```bash
pnpm -r run typecheck 2>&1
```

- [ ] **Step 5: 验证四大回归路径**

手动验证：搜索→打开、隐藏、分离、销毁。

- [ ] **Step 6: Commit**

```bash
git add packages/host/src/window/runtime-host-registry.ts packages/host/src/window/window-manager.ts apps/desktop/src/main/index.ts packages/host/src/index.ts
git commit -m "refactor: extract RuntimeHostRegistry from WindowManager (single instance)

- WindowManager.initHostRegistry() creates registry once
- RuntimeHostRegistry manages host creation/registration/query
- LauncherHost is a singleton (getOrCreateLauncherHost)
- WindowManager.createHost/registerHost/getHost kept as delegates (Phase 2 remove)
- IPC payload completely unchanged — Shell unaffected

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task P1-8：移动 Store 到 persistence/ 目录

**Files:**
- Create: `packages/host/src/persistence/store.ts`
- Delete: `packages/host/src/plugins/store.ts`
- Modify: `packages/host/src/plugins/plugin-registry.ts`
- Modify: `packages/host/src/index.ts`

- [ ] **复制 + 更新 import + 删除旧文件 + 类型检查 + Commit**

```bash
git commit -m "refactor: move Store from plugins/ to persistence/"
```

---

### Phase 1 验证清单

| 检查 | 命令 |
|------|------|
| 类型检查 | `pnpm -r run typecheck` |
| 搜索 → 打开插件 | 手动 |
| 隐藏插件 (Escape) | 手动 |
| 分离到浮动窗口 | 手动 |
| 销毁插件 | 手动 |
| Old IPC payload 不变 | `grep -r 'payload\\.state\\|payload\\.pluginName' packages/shell/` — 正常 |
| Registry 唯一实例 | `grep 'new RuntimeHostRegistry' apps/desktop/src/ packages/host/src/` — 只在 initHostRegistry 中 |

---

## Phase 2：RuntimeHost 接口 + RuntimeCoordinator + 状态机 + 新 IPC

### Task P2-1：创建 host 包内 RuntimeHost 接口

**Files:**
- Create: `packages/host/src/window/hosts/runtime-host.ts`
- Create: `packages/host/src/window/hosts/capabilities.ts`

**Interfaces:**
- `RuntimeHost` (host 包内，含 `attach(runtime, view?)` 过渡参数)
- `Focusable`, `Pinnable`, `Closable`

**为什么不在 shared 包改 `Host` 接口**：shared 的 `Host` 是旧契约，多处 import 它。新 `RuntimeHost` 在 host 包内，可以安全地携带 `view?` 参数而不影响 shared 的零 Electron 依赖。

```typescript
// packages/host/src/window/hosts/runtime-host.ts

import type { PluginRuntime } from '@szybko/shared';  // 旧类型，Phase 2 末迁到 host
import type { WebContentsView } from 'electron';

/**
 * Runtime 的显示挂载点接口。
 * @param view — 过渡参数，Phase 2 末改从 runtime.webContentsView 获取
 */
export interface RuntimeHost {
    readonly id: string;
    readonly type: 'launcher' | 'floating';
    attach(runtime: PluginRuntime, view?: WebContentsView): void;
    detach(runtime: PluginRuntime): void;
}
```

```typescript
// packages/host/src/window/hosts/capabilities.ts

export interface Focusable { focus(): void; }
export interface Pinnable { setAlwaysOnTop(pin: boolean): void; }
export interface Closable { close(): void; }
export interface Resizable { resize(width: number, height: number): void; }
export interface Positionable { setPosition(x: number, y: number): void; }
```

---

### Task P2-2：LauncherRuntimeHost 实现 RuntimeHost + 接管 view 管理

**Files:**
- Modify: `packages/host/src/window/hosts/launcher-runtime-host.ts`
- Modify: `packages/host/src/window/runtime-host-registry.ts`

```typescript
// packages/host/src/window/hosts/launcher-runtime-host.ts

import type { PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import type { WindowManager } from '../window-manager';
import type { RuntimeHost } from './runtime-host';

export class LauncherRuntimeHost implements RuntimeHost {
    readonly id: string;
    readonly type = 'launcher' as const;
    private currentView: WebContentsView | null = null;

    constructor(
        id: string,
        private windowManager: WindowManager,
    ) {}

    attach(runtime: PluginRuntime, view?: WebContentsView): void {
        if (view) {
            this.currentView = view;
            this.windowManager.addChildView(view);
        }
        runtime.state = 'attached';
        runtime.host = this;
    }

    detach(runtime: PluginRuntime): void {
        if (this.currentView) {
            this.windowManager.removeChildView(this.currentView);
            this.currentView = null;
        }
        runtime.state = 'detached';
        runtime.host = null;
    }
}
```

RuntimeHostRegistry 创建时需注入 WindowManager（LauncherRuntimeHost 构造需要）：

```typescript
// packages/host/src/window/runtime-host-registry.ts

export class RuntimeHostRegistry {
    constructor(private windowManager: WindowManager) {}

    getOrCreateLauncherHost(): LauncherRuntimeHost {
        if (!this.launcherHost) {
            this.launcherHost = new LauncherRuntimeHost(`launcher-host`, this.windowManager);
            this.hosts.set(this.launcherHost.id, this.launcherHost);
        }
        return this.launcherHost;
    }
    // ...
}
```

**重要**：`RuntimeHostRegistry` 构造函数新增 `windowManager` 参数。需要同步更新 `WindowManager.initHostRegistry()`：

```typescript
// window-manager.ts
initHostRegistry(): RuntimeHostRegistry {
    this.hostRegistry = new RuntimeHostRegistry(this);  // 传入 this
    return this.hostRegistry;
}
```

---

### Task P2-3：FloatingRuntimeHost 实现 RuntimeHost + 能力接口

**Files:**
- Modify: `packages/host/src/window/hosts/floating-runtime-host.ts`

```typescript
// packages/host/src/window/hosts/floating-runtime-host.ts

import type { PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import { BrowserWindow } from 'electron';
import type { RuntimeHost } from './runtime-host';
import type { Focusable, Pinnable, Closable } from './capabilities';

export class FloatingRuntimeHost implements RuntimeHost, Focusable, Pinnable, Closable {
    readonly id: string;
    readonly type = 'floating' as const;
    private window: BrowserWindow | null = null;
    private view: WebContentsView | null = null;

    constructor(id: string) {}

    attach(runtime: PluginRuntime, view?: WebContentsView): void {
        if (!this.window) this.createWindow(runtime.pluginId);
        if (view) {
            this.view = view;
            this.window!.contentView.addChildView(view);
        }
        runtime.state = 'attached';
        runtime.host = this;
        this.window!.show();
    }

    /** 只移除 view，不关闭窗口。close() 负责销毁窗口。 */
    detach(runtime: PluginRuntime): void {
        if (this.view && this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(this.view);
        }
        runtime.state = 'detached';
        runtime.host = null;
        this.view = null;
    }

    focus(): void { if (this.window && !this.window.isDestroyed()) { this.window.show(); this.window.focus(); } }
    setAlwaysOnTop(pin: boolean): void { if (this.window && !this.window.isDestroyed()) this.window.setAlwaysOnTop(pin); }
    close(): void { this.window?.close(); this.window = null; this.view = null; }

    createWindow(pluginName: string, runtimeId?: string, pluginId?: string, explain?: string) {
        // 与现有 FloatingHost.createWindow 一致
    }
}
```

---

### Task P2-4：RuntimeHostRegistry 更新类型 + WindowManager 收窄

**Files:**
- Modify: `packages/host/src/window/runtime-host-registry.ts`（`Map<string, Host>` → `Map<string, RuntimeHost>`）
- Modify: `packages/host/src/window/window-manager.ts`（移除 `createHost/registerHost/getHost`；移除 `attachPluginView/detachPluginView/pluginView`）

```typescript
// runtime-host-registry.ts
import type { RuntimeHost } from './hosts/runtime-host';
// ... Map<string, RuntimeHost> ...
```

```typescript
// window-manager.ts
export class WindowManager {
    private window: BrowserWindow | null = null;

    // ── 窗口原语 ──
    createMainWindow(preloadPath: string): BrowserWindow { /* ... */ }
    getWindow() { return this.window; }
    resize(height: number) { /* ... */ relayout(); }
    repositionToCursor() { /* ... */ }
    show() { /* ... */ }
    hide() { this.window?.hide(); }
    isVisible(): boolean { /* ... */ }

    // ── View 操作（供 LauncherRuntimeHost 使用） ──
    addChildView(view: WebContentsView): void {
        this.window?.contentView.addChildView(view);
        this.relayout();
    }
    removeChildView(view: WebContentsView): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(view);
        }
        this.relayout();
    }
    relayout(): void { /* 遍历 contentView.children 重新布局 */ }

    // ── HostRegistry（只读 getter） ──
    private hostRegistry: RuntimeHostRegistry | null = null;
    initHostRegistry(): RuntimeHostRegistry {
        this.hostRegistry = new RuntimeHostRegistry(this);
        return this.hostRegistry;
    }
    getHostRegistry(): RuntimeHostRegistry | null { return this.hostRegistry; }

    // 移除了：createHost, registerHost, getHost, attachPluginView, detachPluginView, pluginView, updatePluginBounds
}
```

---

### Task P2-5：RuntimeManager 职责收窄——attachToHost/detachFromHost + 状态机

**Files:**
- Modify: `packages/host/src/runtime/runtime-manager.ts`

**改动内容：**
1. `attachToWindow` → `attachToHost(runtimeId, host: RuntimeHost, featureCode?)`，调 `host.attach(entry.runtime, entry.view)`
2. `detachFromWindow` → `detachFromHost(runtimeId, reason?: 'hide' | 'destroy')`，调 `host.detach(entry.runtime)`，传入 reason
3. 移除 `matchPluginFeatures`（归 PluginCatalog）
4. 移除 `detachToFloatingWindow`、`pinPluginWindow`（归 Coordinator）
5. `destroyFromWindow` 改为调 `host.detach` 和 `destroy`
6. RuntimeEntry 新增 `loadState`/`mountState` 字段
7. 新增 `transitionLoadState/transitionMountState` 方法
8. `did-finish-load` 兼设旧 `state` 和新 `loadState`

关键代码片段：

```typescript
// RuntimeEntry 新增字段
interface RuntimeEntry {
    runtime: PluginRuntime;
    view: WebContentsView;
    loadState: LoadState;       // 新增
    mountState: MountState;     // 新增
}

// create() 中初始化
const entry: RuntimeEntry = {
    runtime,
    view,
    loadState: 'loading',
    mountState: 'detached',
};

// did-finish-load → 同时设置旧 state 和新 loadState
view.webContents.on('did-finish-load', () => {
    runtime.state = 'activated';        // 旧逻辑（兼容）
    this.transitionLoadState(runtime.id, 'loaded');  // 新逻辑
});

// attachToHost — 调 host.attach 而非直接 windowManager
attachToHost(runtimeId: string, host: RuntimeHost, featureCode?: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;
    host.attach(entry.runtime, entry.view);
    entry.runtime.host = host;
    entry.runtime.state = 'attached';
    this.transitionMountState(runtimeId, 'attached');
    // 发送 plugin:enter（兼容旧逻辑）
    entry.view.webContents.send(IPC.PLUGIN_ENTER, {
        pluginId: entry.runtime.pluginId,
        featureCode,
    });
}

// detachFromHost — 调 host.detach，传入 reason
detachFromHost(runtimeId: string, reason?: 'hide' | 'destroy'): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;
    if (entry.runtime.host) {
        entry.runtime.host.detach(entry.runtime);
    }
    entry.runtime.state = 'detached';
    entry.runtime.host = null;
    this.transitionMountState(runtimeId, 'detached', reason);
}

// destroy — 提供给 Coordinator 调用的端点
destroy(runtimeId: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;
    entry.view.webContents.close();
    this.entries.delete(runtimeId);
}

// transitionMountState — 发送旧兼容 + 新字段
transitionMountState(runtimeId: string, target: MountState, reason?: 'hide' | 'destroy'): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;
    entry.mountState = target;

    // 通知宿主 UI（保留旧字段 state, pluginName, featureExplain 保证 Shell 兼容）
    const win = this.windowManager.getWindow();
    if (win && !win.isDestroyed()) {
        const plugin = this.pluginManager.get(entry.runtime.pluginId);
        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId: entry.runtime.id,
            pluginId: entry.runtime.pluginId,
            state: target,                        // ← 旧字段（Shell 依赖）
            mountState: target,                   // ← 新字段
            pluginName: plugin?.id ?? entry.runtime.pluginId,   // ← 旧字段
            featureExplain: '',                   // ← 旧字段
            loadState: entry.loadState,           // ← 新字段
        });
    }

    // 插件通知（仅退出时）
    if (target === 'detached' && reason) {
        entry.view.webContents.send(IPC.PLUGIN_OUT, {
            pluginId: entry.runtime.pluginId,
            reason,
        });
    }
}
```

---

### Task P2-6：PluginCatalog 移入 matchFeatures

**Files:**
- Modify: `packages/host/src/plugins/plugin-catalog.ts`
- Modify: `packages/host/src/ipc/register-handlers.ts`（SEARCH_QUERY handler 改用 PluginCatalog.matchFeatures + 保留 sendPluginSearch）

**关键：SEARCH_QUERY handler 必须保留 `runtimeManager.sendPluginSearch(req)`，不能只做 feature match。**

```typescript
// register-handlers.ts 的 SEARCH_QUERY handler
ipcMain.handle(IPC.SEARCH_QUERY, (_event, req) => {
    // Built-in search
    const results = runBuiltinSearch(req.query);

    // Plugin feature match（从 PluginCatalog 获取，不再从 RuntimeManager）
    results.push(...pluginCatalog.matchFeatures(req.query));

    // ... 结果排序、发送 search:batch ...

    // 插件运行时搜索（保留！不能丢掉）
    runtimeManager.sendPluginSearch(req);

    // Final batch
    // ...
});
```

---

### Task P2-7：新建 RuntimeCoordinator

**Files:**
- Create: `packages/host/src/runtime/runtime-coordinator.ts`
- Modify: `packages/host/src/index.ts`

**注意**：`Coordinator` 不直接调 `runtimeManager.destroy()` 或 `runtimeManager.attachToHost()`——它调 `RuntimeManager` 已有的方法。`ActivationContext` 存在但 **暂不修改** PluginRuntime 类型（Phase 2 末再切换），当前通过局部变量传递激活信息。

```typescript
// packages/host/src/runtime/runtime-coordinator.ts

import type { ActivationContext } from './types';
import type { RuntimeHost } from '../window/hosts/runtime-host';
import type { RuntimeManager } from './runtime-manager';
import type { RuntimeHostRegistry } from '../window/runtime-host-registry';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import { Closable } from '../window/hosts/capabilities';
import { IPC } from '@szybko/shared';
import { Menu } from 'electron';

export class RuntimeCoordinator {
    constructor(
        private runtimeManager: RuntimeManager,
        private hostRegistry: RuntimeHostRegistry,
        private pluginCatalog: PluginCatalog,
    ) {}

    activatePlugin(pluginId: string, featureCode?: string): void {
        const runtime = this.runtimeManager.getOrCreate(pluginId);
        if (!runtime) return;

        // 如果已有活跃 runtime 在 launcher，先 detach
        this.detachActiveFromLauncher();

        // 挂载到 launcher host
        const host = this.hostRegistry.getOrCreateLauncherHost();
        this.runtimeManager.attachToHost(runtime.id, host, featureCode);
    }

    moveToHost(runtimeId: string, targetType: 'launcher' | 'floating'): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime || !runtime.host) return;

        // detach（不发 plugin:out——view 还在，只是换窗口）
        this.runtimeManager.detachFromHost(runtimeId);

        // 创建/获取目标 host
        const host: RuntimeHost = targetType === 'launcher'
            ? this.hostRegistry.getOrCreateLauncherHost()
            : this.hostRegistry.createFloatingHost();

        // attach（发 plugin:enter）
        this.runtimeManager.attachToHost(runtimeId, host);
    }

    hideRuntime(runtimeId: string): void {
        // detach 传入 'hide' → transitionMountState 发 plugin:out { reason: 'hide' }
        this.runtimeManager.detachFromHost(runtimeId, 'hide');
    }

    destroyRuntime(runtimeId: string): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime) return;

        // 如果挂在 floating host，先 close 窗口再 destroy
        const host = runtime.host;
        if (host && 'close' in host) {
            (host as RuntimeHost & Closable).detach(runtime);
            (host as RuntimeHost & Closable).close();   // ← 关窗口
        } else if (host) {
            this.runtimeManager.detachFromHost(runtimeId, 'destroy');
        }

        // 销毁 Runtime（close WebContents + 清理）
        this.runtimeManager.destroy(runtimeId);
    }

    pinRuntime(runtimeId: string, pin: boolean): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime?.host) return;
        if ('setAlwaysOnTop' in runtime.host) {
            (runtime.host as any).setAlwaysOnTop(pin);
        }
    }

    showPluginMenu(runtimeId: string, variant?: 'launcher' | 'detached'): void {
        const items: Electron.MenuItemConstructorOptions[] = [];
        if (variant === 'detached') {
            items.push({ label: '结束运行', click: () => this.destroyRuntime(runtimeId) });
        } else {
            items.push({
                label: '分离为独立窗口',
                accelerator: 'CmdOrCtrl+D',
                click: () => this.moveToHost(runtimeId, 'floating'),
            });
            items.push({ type: 'separator' });
            items.push({ label: '结束运行', click: () => this.destroyRuntime(runtimeId) });
        }
        Menu.buildFromTemplate(items).popup();
    }

    // ── 私有 ──
    private detachActiveFromLauncher(): void {
        const launcher = this.hostRegistry.getOrCreateLauncherHost();
        for (const rt of this.runtimeManager.getAll()) {
            if (rt.host?.id === launcher.id) {
                this.runtimeManager.detachFromHost(rt.id);
            }
        }
    }
}
```

---

### Task P2-8：IPC Handler 归一到 RuntimeCoordinator + 补全 IPC 类型

**Files:**
- Modify: `packages/host/src/ipc/register-handlers.ts`
- Modify: `packages/host/src/ipc/execute-action.ts`
- Modify: `packages/shared/src/ipc/contract.ts`
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/api/plugin.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/api/plugin-lifecycle.ts`

**IPC 合约变更要点**：
- `RuntimeStatePayload` 同时包含旧字段（`state`, `pluginName`, `featureExplain`）和新字段（`mountState`, `loadState`）
- 新增 `PluginOutPayload`, `MoveToHostRequest`
- 新增 `IPC.PLUGIN_OUT` 通道

```typescript
// packages/shared/src/ipc/contract.ts

// ── Runtime 状态变更（保留旧字段 100% 兼容 Shell） ──
interface RuntimeStatePayload {
    runtimeId: string;
    pluginId: string;
    state: string;                    // 旧字段 "attached"|"detached" — Shell 仍读它
    mountState?: 'attached' | 'detached';  // 新字段
    loadState?: 'loading' | 'loaded' | 'error';
    pluginName?: string;              // 旧字段
    featureExplain?: string;          // 旧字段
}

// ── 插件退出 ──
interface PluginOutPayload {
    pluginId: string;
    reason: 'hide' | 'destroy';
}

// ── Host 迁移 ──
interface MoveToHostRequest {
    runtimeId: string;
    targetHostType: 'launcher' | 'floating';
}

// ── 更新合约表 ──
export interface IpcMainToRendererEventContract {
    // ... 现有 ...
    [IPC.PLUGIN_RUNTIME_STATE]: RuntimeStatePayload;  // 之前是 unknown
    [IPC.PLUGIN_ENTER]: PluginEnterPayload;            // 之前是 unknown
    [IPC.PLUGIN_OUT]: PluginOutPayload;                // 新增
}

export interface IpcInvokeContract {
    [IPC.HOST_SWITCH]: {
        request: MoveToHostRequest;
        response: { ok: boolean; hostId?: string; error?: string };
    };
}
```

---

### Task P2-9：清理旧类型（shared 移除旧 Host/PluginRuntime）

**Files:**
- Modify: `packages/shared/src/runtime/types.ts`
- 删除 `Host`, `PluginRuntime`, `RuntimeState`——Phase 2 末已无代码使用它们

---

### Phase 2 验证清单

| 检查 | 命令/方法 |
|------|----------|
| 类型检查 | `pnpm -r run typecheck` |
| 搜索 → 打开插件 | 手动 |
| 隐藏插件 (Escape) | 手动 |
| 分离到浮动窗口 | 手动 |
| 销毁浮动窗口（关窗口/右键结束） | 窗口关闭，Runtime 清除，无残留空白窗口 |
| 分离后再合并 | 手动 |
| plugin:out 到达插件 | 插件 preload onPluginOut 触发 |
| plugin:enter 在 load 完成后才发 | 打开大插件→loadState='loading'+mountState='attached'→loaded 后补发 enter |
| Shell 兼容 | `grep -r '\\.state\\|\\.pluginName\\|\\.featureExplain' packages/shell/` — 正常 |
| 无 RuntimeCoordinator 绕过 | `grep 'runtimeManager\\.attachToHost\\|runtimeManager\\.detachFromHost' packages/host/src/ipc/` — 空 |
| destroyRuntime 关窗口 | 对 floating 窗口调用 destroyRuntime → window.close() 被调用 |
| Search 保留 sendPluginSearch | 检查 SEARCH_QUERY handler 调 runtimeManager.sendPluginSearch |

---

## 验证命令

```bash
# 每次 typecheck（有效检查）
pnpm -r run typecheck

# 手动回归清单
echo "1. 搜索→打开插件"
echo "2. Escape 隐藏"
echo "3. 右键菜单→分离"
echo "4. 浮动窗口 pin"
echo "5. 关闭浮动窗口"
echo "6. 再次打开同一插件（单例复用）"
echo "7. 打开不同插件（切换）"
```
