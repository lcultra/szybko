# 核心抽象精炼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分 3 步重构插件 Runtime 体系的核心抽象，使插件的注册、检索、运行、分离、隐藏、销毁等底层能力原子化且职责清晰，后续多 Host 类型、多实例、插件市场等功能迭代无需大重构。

**Architecture:** PluginCatalog 负责插件发现/查询，RuntimeManager 负责 Runtime 生命周期和状态机，RuntimeHost 接口族负责 view 挂载，RuntimeHostRegistry 负责 Host 实例管理，WindowManager 负责 BrowserWindow 原语，RuntimeCoordinator 作为所有业务流程的强制入口。

**Tech Stack:** Electron 43, pnpm monorepo, TypeScript 5.x

## Global Constraints

- `@szybko/shared` 必须保持零 Electron 依赖（不导入 electron 类型）
- PluginRuntime 的 `webContentsView`/`webContents` 类型只在 `packages/host` 包内
- 每步必须可独立合入，不破坏现有功能
- 每步必须可回退

---

## 文件结构映射

### Step 1 后（重命名 + 类型分拆，不改行为）

| 文件 | 职责 |
|------|------|
| `packages/shared/src/runtime/types.ts` | 纯可序列化类型：`RuntimeState`, `LoadState`, `MountState`, `RuntimeInfo`, `RuntimeHostInfo`；保留旧 `Host`/`PluginRuntime` 作为兼容 |
| `packages/host/src/runtime/types.ts` | **新建** `PluginRuntime` host 版（含 `WebContentsView`）+ `ActivationContext` |
| `packages/host/src/plugins/plugin-catalog.ts` | **改名** 自 plugin-manager.ts，类名 `PluginCatalog`，行为不变 |
| `packages/host/src/plugins/plugin-registry.ts` | 不变 |
| `packages/host/src/plugins/plugin-loader.ts` | 不变 |
| `packages/host/src/plugins/store.ts → persistence/store.ts` | **移动** 通用 JSON 持久化 |
| `packages/host/src/window/hosts/launcher-runtime-host.ts` | **改名** 自 launcher-host.ts，类名 `LauncherRuntimeHost`，行为不变 |
| `packages/host/src/window/hosts/floating-runtime-host.ts` | **改名** 自 floating-host.ts，类名 `FloatingRuntimeHost`，行为不变 |
| `packages/host/src/window/window-manager.ts` | 保留 `createMainWindow`/`resize`/`addChildView`/`removeChildView`/`relayout`；`createHost`/`registerHost`/`getHost` 内部委托给 RuntimeHostRegistry |
| `packages/host/src/window/runtime-host-registry.ts` | **新建** RuntimeHostRegistry，从 WindowManager 抽取 host 注册/工厂逻辑 |
| `packages/host/src/runtime/runtime-manager.ts` | 内部使用新类型；`attachToWindow`/`detachFromWindow` 等方法签名和行为不变 |
| `apps/desktop/src/main/index.ts` | 使用新类名 |

### Step 2 后（RuntimeHost 精确化 + WindowManager 收窄）

| 文件 | 改动 |
|------|------|
| `packages/host/src/window/hosts/launcher-runtime-host.ts` | 构造时接收 `WindowManager`；`attach`/`detach` 调用 `addChildView`/`removeChildView` |
| `packages/host/src/window/hosts/floating-runtime-host.ts` | `attach(runtime, view?)`保持 `view?` 过渡参数（Step 3 移除）；`detach` 只移除 view 不关窗口；实现 `Focusable`/`Pinnable`/`Closable` |
| `packages/host/src/window/runtime-host-registry.ts` | 完善单例逻辑：`getOrCreateLauncherHost()` 注入 `WindowManager` |
| `packages/host/src/window/window-manager.ts` | 移除 `attachPluginView`/`detachPluginView`/`pluginView`；移除 host 工厂/注册方法（全归 RuntimeHostRegistry） |
| `packages/host/src/runtime/runtime-manager.ts` | `attachToHost`(runtimeId, host) 内部先调 `host.attach(runtime, view)` 再加主机通知；`detachFromHost` 同理；移除 `matchPluginFeatures`；移除 `detachToFloatingWindow`（归 Coordinator） |
| `packages/host/src/plugins/plugin-catalog.ts` | 移入 `matchFeatures()` |
| `packages/shared/src/runtime/types.ts` | 移除旧 `Host`/`PluginRuntime`（已无人使用） |

### Step 3 后（RuntimeCoordinator + IPC 归一）

| 文件 | 改动 |
|------|------|
| `packages/host/src/runtime/runtime-coordinator.ts` | **新建** `RuntimeCoordinator` |
| `packages/host/src/ipc/register-handlers.ts` | 所有 plugin/host IPC handler 只调 `RuntimeCoordinator` 方法 |
| `packages/host/src/ipc/execute-action.ts` | `plugin.open` 处理移入 Coordinator |
| `packages/shared/src/ipc/contract.ts` | 补 `RuntimeStatePayload`, `PluginEnterPayload`, `PluginOutPayload`, `MoveToHostRequest` |
| `packages/shared/src/ipc/channels.ts` | 补 `PLUGIN_OUT` |
| `packages/shared/src/runtime/types.ts` | 补 `LoadState`, `MountState` (若 Step 1 未加) |
| `packages/host/src/index.ts` | 导出 `RuntimeCoordinator` |
| `apps/desktop/src/main/index.ts` | 创建 `RuntimeCoordinator` 实例，注入给 `registerIpcHandlers` |
| `apps/desktop/src/preload/api/plugin-lifecycle.ts` | 暴露 `onPluginOut` |

---

## Step 1：类型分拆 + 重命名（不改行为）

### Task 1.1：新增 host 运行时类型 + 扩展 shared 类型

**Files:**
- Modify: `packages/shared/src/runtime/types.ts`
- Create: `packages/host/src/runtime/types.ts`
- Modify: `packages/host/src/index.ts`

**Interfaces:**
- Consumes: 当前 `packages/host/src/runtime/runtime-manager.ts` 内部类型
- Produces: `RuntimeInfo`, `RuntimeHostInfo`, `LoadState`, `MountState`（shared）；`PluginRuntime`, `ActivationContext`（host）

- [ ] **Step 1: 扩展 shared/src/runtime/types.ts——新增可序列化类型，保留旧类型**

```typescript
// packages/shared/src/runtime/types.ts

// ── 旧类型（保留，Step 2 再移除） ──
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

// ── 新类型（新增，与旧类型并存） ──

export type LoadState = 'loading' | 'loaded' | 'error';
export type MountState = 'attached' | 'detached';

/** 可序列化的运行时摘要，用于 IPC 通知 */
export interface RuntimeInfo {
    id: string;
    pluginId: string;
    instanceId: string;
    loadState: LoadState;
    mountState: MountState;
    hostInfo: RuntimeHostInfo | null;
}

/** RuntimeHost 的可序列化摘要 */
export interface RuntimeHostInfo {
    id: string;
    type: 'launcher' | 'floating';
}
```

- [ ] **Step 2: 新增 host/src/runtime/types.ts**

```typescript
// packages/host/src/runtime/types.ts

import type { RuntimeInfo, RuntimeHostInfo } from '@szybko/shared';
import type { WebContents, WebContentsView } from 'electron';

/** 插件激活上下文——每次进入时的动态参数 */
export interface ActivationContext {
    featureCode: string;
    featureExplain?: string;
    keyword?: string;
    query?: string;
}

/** 主进程内部的完整 Runtime 表示 */
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
// packages/host/src/index.ts

export { RuntimeManager } from './runtime/runtime-manager';
// ... 现有导出不变 ...

// 新增
export type { PluginRuntime, ActivationContext } from './runtime/types';
```

- [ ] **Step 4: 从 packages/shell 验证 shared 无 Electron leak**

```bash
grep -r 'electron' packages/shared/src/ --include='*.ts'
# 期望输出空——shared 不引用 electron
```

- [ ] **Step 5: 运行类型检查确认无编译错误**

```bash
pnpm -r exec tsc --noEmit 2>&1 | head -30
# 或者如果 tsc 是 workspace 级则：
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/runtime/types.ts packages/host/src/runtime/types.ts packages/host/src/index.ts
git commit -m "refactor: add RuntimeInfo/RuntimeHostInfo types, create host/runtime/types.ts

- shared: add LoadState, MountState, RuntimeInfo, RuntimeHostInfo (serializable)
- host: create PluginRuntime (with WebContentsView), ActivationContext
- Keep old Host/PluginRuntime types for backward compat (removed in Step 2)
- No behavior changes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1.2：重命名 PluginManager → PluginCatalog

**Files:**
- Create: `packages/host/src/plugins/plugin-catalog.ts`（内容同 plugin-manager.ts，类名改为 PluginCatalog）
- Delete: `packages/host/src/plugins/plugin-manager.ts`
- Modify: `packages/host/src/plugins/plugin-registry.ts`（import 路径）
- Modify: `packages/host/src/runtime/runtime-manager.ts`（import + type 引用）
- Modify: `packages/host/src/index.ts`（export）
- Modify: `apps/desktop/src/main/index.ts`（import + new PluginCatalog）

**Interfaces:**
- Consumes: `PluginRegistry`, `PluginLoader`（不变）
- Produces: `class PluginCatalog`（所有 public 方法签名与旧 PluginManager 一致）

- [ ] **Step 1: 创建 plugin-catalog.ts（复制 plugin-manager.ts 内容，类名改为 PluginCatalog）**

```typescript
// packages/host/src/plugins/plugin-catalog.ts

import type { PluginRegistry } from './plugin-registry';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PluginLoader } from './plugin-loader';

export interface PluginInfo {
    id: string;
    manifest: import('@szybko/shared').PluginManifest;
    path: string;
}

export class PluginCatalog {
    private loader = new PluginLoader();
    private plugins: Map<string, PluginInfo> = new Map();

    constructor(
        private registry: PluginRegistry,
        private pluginsBaseDir: string,
    ) {}

    async init(): Promise<void> {
        await this.registry.init();
        this.scan();
    }

    scan() { /* 与旧 PluginManager.scan() 完全一致 */ }
    get(id: string): PluginInfo | undefined { /* 与旧一致 */ }
    getAll(): PluginInfo[] { /* 与旧一致 */ }
    getEnabled(): PluginInfo[] { /* 与旧一致 */ }
}
```

- [ ] **Step 2: 更新 runtime-manager.ts 的 import**

```typescript
// packages/host/src/runtime/runtime-manager.ts
// 改 import 行
- import type { PluginManager } from '../plugins/plugin-manager';
+ import type { PluginCatalog } from '../plugins/plugin-catalog';
```

- [ ] **Step 3: 更新 host/src/index.ts export**

```typescript
- export { PluginManager } from './plugins/plugin-manager';
+ export { PluginCatalog } from './plugins/plugin-catalog';
```

- [ ] **Step 4: 更新 apps/desktop/src/main/index.ts**

```typescript
- import { PluginManager, PluginRegistry, ... } from '@szybko/host';
+ import { PluginCatalog, PluginRegistry, ... } from '@szybko/host';
```

并将 `new PluginManager(registry, pluginsDir)` → `new PluginCatalog(registry, pluginsDir)`。

- [ ] **Step 5: 删除旧文件**

```bash
git rm packages/host/src/plugins/plugin-manager.ts
```

- [ ] **Step 6: 运行类型检查**

```bash
npx tsc --noEmit 2>&1
# 期望：0 错误
```

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/plugins/plugin-catalog.ts packages/host/src/runtime/runtime-manager.ts packages/host/src/index.ts apps/desktop/src/main/index.ts
git rm packages/host/src/plugins/plugin-manager.ts
git commit -m "refactor: rename PluginManager → PluginCatalog

- Create plugin-catalog.ts with PluginCatalog class (identical API)
- Update all imports and exports
- Delete plugin-manager.ts
- No behavior changes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1.3：重命名 LauncherHost → LauncherRuntimeHost

**Files:**
- Create: `packages/host/src/window/hosts/launcher-runtime-host.ts`
- Delete: `packages/host/src/window/hosts/launcher-host.ts`
- Modify: none（LauncherRuntimeHost 只在 window-manager.ts 和 host/index.ts 中被引用）

**Interfaces:**
- 与旧 `LauncherHost` 完全一致：`implements Host`，`attach/detach` 只改 state flags

- [ ] **Step 1: 创建 launcher-runtime-host.ts**

```typescript
// packages/host/src/window/hosts/launcher-runtime-host.ts

import type { Host, PluginRuntime } from '@szybko/shared';

export class LauncherRuntimeHost implements Host {
    id: string;
    type = 'launcher' as const;

    constructor(id: string) { this.id = id; }

    attach(runtime: PluginRuntime) {
        runtime.state = 'attached';
        runtime.host = this;
    }

    detach(runtime: PluginRuntime) {
        runtime.state = 'detached';
        runtime.host = null;
    }
}
// 与旧 launcher-host.ts 内容完全一致，仅类名变化
```

- [ ] **Step 2: 更新 host/index.ts**

```typescript
- export { LauncherHost } from './window/hosts/launcher-host';
+ export { LauncherRuntimeHost } from './window/hosts/launcher-runtime-host';
```

- [ ] **Step 3: 删除旧文件**

```bash
git rm packages/host/src/window/hosts/launcher-host.ts
```

- [ ] **Step 4: 类型检查**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/window/hosts/launcher-runtime-host.ts packages/host/src/index.ts
git rm packages/host/src/window/hosts/launcher-host.ts
git commit -m "refactor: rename LauncherHost → LauncherRuntimeHost

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1.4：重命名 FloatingHost → FloatingRuntimeHost

**Files:**
- Create: `packages/host/src/window/hosts/floating-runtime-host.ts`
- Delete: `packages/host/src/window/hosts/floating-host.ts`
- Modify: `packages/host/src/runtime/runtime-manager.ts`（3 处 `FloatingHost` 引用）
- Modify: `packages/host/src/index.ts`

**Interfaces:**
- 与旧 `FloatingHost` 完全一致：`createWindow/attach/detach/focus/setAlwaysOnTop`

- [ ] **Step 1: 创建 floating-runtime-host.ts（与旧 floating-host.ts 同内容，仅类名改为 FloatingRuntimeHost）**

- [ ] **Step 2: 更新 runtime-manager.ts 中 3 处 FloatingHost 引用为 FloatingRuntimeHost**

```typescript
// 第 7 行 import
- import { FloatingHost } from '../window/hosts/floating-host';
+ import { FloatingRuntimeHost } from '../window/hosts/floating-runtime-host';

// 第 131 行 instanceof 判断
- if (entry.runtime.host?.type === 'floating') {
-     const host = entry.runtime.host as FloatingHost;
+ if (entry.runtime.host?.type === 'floating') {
+     const host = entry.runtime.host as FloatingRuntimeHost;

// 第 203 行
- if (entry.runtime.host instanceof FloatingHost) {
+ if (entry.runtime.host instanceof FloatingRuntimeHost) {

// 第 250 行 new FloatingHost
- const host = new FloatingHost(`floating-${Date.now()}`);
+ const host = new FloatingRuntimeHost(`floating-${Date.now()}`);

// 第 260 行
- if (entry.runtime.host instanceof FloatingHost) {
+ if (entry.runtime.host instanceof FloatingRuntimeHost) {
```

- [ ] **Step 3: 删除旧文件 + 更新 index.ts**

- [ ] **Step 4: 类型检查**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/window/hosts/floating-runtime-host.ts packages/host/src/runtime/runtime-manager.ts packages/host/src/index.ts
git rm packages/host/src/window/hosts/floating-host.ts
git commit -m "refactor: rename FloatingHost → FloatingRuntimeHost

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1.5：从 WindowManager 抽取 RuntimeHostRegistry

**Files:**
- Create: `packages/host/src/window/runtime-host-registry.ts`
- Modify: `packages/host/src/window/window-manager.ts`
- Modify: `packages/host/src/ipc/register-handlers.ts`
- Modify: `packages/host/src/index.ts`

**Interfaces:**
- `RuntimeHostRegistry`: `getOrCreateLauncherHost()`, `createFloatingHost()`, `registerHost()`, `unregisterHost()`, `getHost()`, `getAllHosts()`
- `WindowManager`: 移除 `registerHost`/`getHost`/`getAllHosts`（已迁移到 Registry）

- [ ] **Step 1: 新建 RuntimeHostRegistry**

```typescript
// packages/host/src/window/runtime-host-registry.ts

import type { Host } from '@szybko/shared';
import { LauncherRuntimeHost } from './hosts/launcher-runtime-host';
import { FloatingRuntimeHost } from './hosts/floating-runtime-host';
import type { WindowManager } from './window-manager';

export class RuntimeHostRegistry {
    private hosts: Map<string, Host> = new Map();
    private launcherHost: LauncherRuntimeHost | null = null;

    constructor(private windowManager: WindowManager) {}

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

注意：`LauncherRuntimeHost` 构造时还不接收 `WindowManager` 参数（Step 2 才改），所以此处 `windowManager` 存而暂未用。

- [ ] **Step 2: 修改 WindowManager——移除 host 注册/查询方法，保留窗口原语和兼容工厂方法**

```typescript
// packages/host/src/window/window-manager.ts

import { RuntimeHostRegistry } from './runtime-host-registry';
// 移除 LauncherHost/FloatingHost import

export class WindowManager {
    private window: BrowserWindow | null = null;
    private hostRegistry: RuntimeHostRegistry | null = null;
    private pluginView: WebContentsView | null = null;  // 暂保留，Step 2 移除

    // ── Host 注册表（委托给 Registry） ──
    initHostRegistry(): RuntimeHostRegistry {
        this.hostRegistry = new RuntimeHostRegistry(this);
        return this.hostRegistry;
    }

    getHostRegistry(): RuntimeHostRegistry | null {
        return this.hostRegistry;
    }

    // ── 以下方法保留（向后兼容，Step 2 移走） ──
    createHost(type: 'launcher' | 'floating'): Host {
        return this.hostRegistry
            ? (type === 'launcher'
                ? this.hostRegistry.getOrCreateLauncherHost()
                : this.hostRegistry.createFloatingHost())
            : (type === 'launcher'
                ? new LauncherRuntimeHost(`launcher-${Date.now()}`)
                : new FloatingRuntimeHost(`floating-${Date.now()}`));
    }

    registerHost(id: string, host: Host) {
        this.hostRegistry?.registerHost(host);
    }

    getHost(id: string): Host | undefined {
        return this.hostRegistry?.getHost(id);
    }

    // ── 窗口原语（保留） ──
    createMainWindow(preloadPath: string): BrowserWindow { /* 不变 */ }
    getWindow() { return this.window; }
    resize(height: number) { /* 不变 */ }
    hide() { this.window?.hide(); }
    show() { /* 不变 */ }
    isVisible(): boolean { /* 不变 */ }

    // ── View 操作（Step 2 重构） ──
    attachPluginView(view: WebContentsView): void { /* 不变 */ }
    detachPluginView(): void { /* 不变 */ }
    private updatePluginBounds(): void { /* 不变 */ }
}
```

- [ ] **Step 3: 在 apps/desktop/src/main/index.ts 中初始化 Registry**

```typescript
// apps/desktop/src/main/index.ts
const windowManager = new WindowManager();
const hostRegistry = windowManager.initHostRegistry();
```

- [ ] **Step 4: 更新 host/src/index.ts 导出 RuntimeHostRegistry**

```typescript
export { RuntimeHostRegistry } from './window/runtime-host-registry';
```

- [ ] **Step 5: 类型检查 + 验证回归**

```bash
npx tsc --noEmit 2>&1
# 手动验证：插件打开/隐藏/分离/销毁 流程正常
```

- [ ] **Step 6: Commit**

```bash
git add packages/host/src/window/runtime-host-registry.ts packages/host/src/window/window-manager.ts packages/host/src/index.ts apps/desktop/src/main/index.ts
git commit -m "refactor: extract RuntimeHostRegistry from WindowManager

- New RuntimeHostRegistry class with host lifecycle (register/unregister/query)
- WindowManager delegates host methods to registry
- LauncherHost is a singleton (getOrCreateLauncherHost)
- Behavior unchanged — same attachPluginView/detachPluginView logic
- Step 2 will migrate view operations to RuntimeHost

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1.6：移动 Store 到 persistence/ 目录

**Files:**
- Create: `packages/host/src/persistence/store.ts`
- Delete: `packages/host/src/plugins/store.ts`
- Modify: `packages/host/src/plugins/plugin-registry.ts`（import 路径）
- Modify: `packages/host/src/index.ts`（export 路径）

- [ ] **Step 1: 创建 persistence/store.ts（内容同 plugins/store.ts 一致）**

```typescript
// packages/host/src/persistence/store.ts
// 内容与旧 plugins/store.ts 完全一致
```

- [ ] **Step 2: 更新 plugin-registry.ts 的 import 路径**

```typescript
- import type { Store } from './store';
+ import type { Store } from '../persistence/store';
```

- [ ] **Step 3: 更新 host/index.ts 导出路径**

```typescript
- export { Store } from './plugins/store';
+ export { Store } from './persistence/store';
```

- [ ] **Step 4: 旧文件 + 类型检查**

```bash
git rm packages/host/src/plugins/store.ts
npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/persistence/store.ts packages/host/src/plugins/plugin-registry.ts packages/host/src/index.ts
git rm packages/host/src/plugins/store.ts
git commit -m "refactor: move Store from plugins/ to persistence/

Store is a generic JSON persistence utility, not plugin-specific.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Step 1 验证清单

| 检查项 | 方法 |
|--------|------|
| 类型检查通过 | `npx tsc --noEmit` — 0 error |
| 搜索插件 → 打开 | 输入关键词 → 回车 → 插件显示在搜索框下方 |
| 隐藏插件 | Escape → 回到搜索模式，插件 WebContents 存活 |
| 分离到浮动窗口 | 右键菜单 → 分离 → 浮动窗口出现，插件继续运行 |
| 销毁插件 | 浮动窗口关闭 / 右键菜单 → 结束 → Runtime 清除 |
| pnpm dev 正常启动 | `pnpm dev` → 窗口出现，搜索可用 |

---

## Step 2：RuntimeHost 精确化 + WindowManager 收窄

### Task 2.1：LauncherRuntimeHost 接管 view 管理

**Files:**
- Modify: `packages/host/src/window/hosts/launcher-runtime-host.ts`
- Modify: `packages/host/src/window/runtime-host-registry.ts`
- Modify: `packages/host/src/window/window-manager.ts`

**Interfaces:**
- LauncherRuntimeHost 构造器：`constructor(id: string, windowManager: WindowManager)`
- RuntimeHostRegistry 注入 WindowManager 到 LauncherRuntimeHost

- [ ] **Step 1: 修改 LauncherRuntimeHost——attach/detach 接收 view 参数并操作 WindowManager**

```typescript
// packages/host/src/window/hosts/launcher-runtime-host.ts

import type { Host, PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import type { WindowManager } from '../window-manager';

export class LauncherRuntimeHost implements Host {
    readonly id: string;
    readonly type = 'launcher' as const;
    private currentView: WebContentsView | null = null;

    constructor(
        id: string,
        private windowManager: WindowManager,
    ) {}

    /** @param view — 过渡参数，Step 3 改从 runtime.webContentsView 获取 */
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

- [ ] **Step 2: 修改 RuntimeHostRegistry——创建 LauncherRuntimeHost 时注入 WindowManager**

```typescript
// packages/host/src/window/runtime-host-registry.ts 中
getOrCreateLauncherHost(): LauncherRuntimeHost {
    if (!this.launcherHost) {
        this.launcherHost = new LauncherRuntimeHost(`launcher-host`, this.windowManager);
        this.hosts.set(this.launcherHost.id, this.launcherHost);
    }
    return this.launcherHost;
}
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/host/src/window/hosts/launcher-runtime-host.ts packages/host/src/window/runtime-host-registry.ts
git commit -m "refactor: LauncherRuntimeHost now manages view via WindowManager

- Inject WindowManager into LauncherRuntimeHost
- attach/detach actually add/remove the WebContentsView
- RuntimeHostRegistry provides WindowManager at construction time

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2.2：FloatingRuntimeHost 签名对齐 + 能力接口

**Files:**
- Modify: `packages/host/src/window/hosts/floating-runtime-host.ts`
- Create: `packages/host/src/window/hosts/capabilities.ts`（能力接口定义）

**Interfaces:**
- `RuntimeHost`: attach(runtime), detach(runtime)
- `Focusable`: focus()
- `Pinnable`: setAlwaysOnTop(pin: boolean)
- `Closable`: close()
- FloatingRuntimeHost 同时实现上述接口

- [ ] **Step 1: 创建能力接口文件**

```typescript
// packages/host/src/window/hosts/capabilities.ts

export interface Focusable {
    focus(): void;
}

export interface Pinnable {
    setAlwaysOnTop(pin: boolean): void;
}

export interface Closable {
    close(): void;
}

export interface Resizable {
    resize(width: number, height: number): void;
}

export interface Positionable {
    setPosition(x: number, y: number): void;
}
```

- [ ] **Step 2: 重写 FloatingRuntimeHost——保持 `view?` 过渡参数，实现能力接口**

```typescript
// packages/host/src/window/hosts/floating-runtime-host.ts

import type { Host, PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import { join } from 'node:path';
import process from 'node:process';
import { BORDER_WIDTH, DEFAULT_WINDOW_WIDTH, SEARCHBAR_HEIGHT } from '@szybko/shared';
import { BrowserWindow } from 'electron';
import type { Focusable, Pinnable, Closable } from './capabilities';

export class FloatingRuntimeHost implements Host, Focusable, Pinnable, Closable {
    readonly id: string;
    readonly type = 'floating' as const;
    private window: BrowserWindow | null = null;
    private view: WebContentsView | null = null;

    constructor(id: string) {}

    // ── RuntimeHost（保持 view? 过渡参数，Step 3 移除） ──

    /** @param view — 过渡参数，Step 3 改从 runtime.webContentsView 获取 */
    attach(runtime: PluginRuntime, view?: WebContentsView): void {
        if (!this.window) {
            this.createWindow(runtime.pluginId);
        }
        if (view) {
            this.view = view;
            this.window!.contentView.addChildView(view);
            this.layoutCurrentView();
        }
        runtime.state = 'attached';
        runtime.host = this;
        this.window!.show();
    }

    detach(runtime: PluginRuntime): void {
        if (this.view && this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(this.view);
        }
        runtime.state = 'detached';
        runtime.host = null;
        this.view = null;
    }

    // ── Focusable ───────────────────────────────────────

    focus(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.show();
            this.window.focus();
        }
    }

    // ── Pinnable ────────────────────────────────────────

    setAlwaysOnTop(pin: boolean): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.setAlwaysOnTop(pin);
        }
    }

    // ── Closable ────────────────────────────────────────

    close(): void {
        // 注意：close 不负责 detach runtime——调用方先调 detachFromHost
        this.window?.close();
        this.window = null;
        this.view = null;
    }

    // ── 内部 ────────────────────────────────────────────

    createWindow(pluginName: string, runtimeId?: string, pluginId?: string, explain?: string) {
        this.window = new BrowserWindow({
            width: DEFAULT_WINDOW_WIDTH,
            height: 600,
            frame: false,
            transparent: true,
            titleBarStyle: 'hidden',
            trafficLightPosition: { x: 12, y: 26 },
            webPreferences: {
                preload: join(__dirname, '../preload/host.js'),
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        this.window.getContentView().setBorderRadius(10);

        const query: Record<string, string> = {
            name: pluginName,
            runtimeId: runtimeId ?? '',
            pluginId: pluginId ?? '',
            explain: explain ?? '',
        };
        if (process.env.ELECTRON_RENDERER_URL) {
            const qs = new URLSearchParams(query).toString();
            void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')}/floating.html?${qs}`);
        } else {
            void this.window.loadFile(join(__dirname, '../renderer/floating.html'), { query });
        }
    }

    private layoutCurrentView(): void {
        if (!this.view || !this.window) return;
        const [, winHeight] = this.window.getSize();
        this.view.setBounds({
            x: BORDER_WIDTH,
            y: SEARCHBAR_HEIGHT,
            width: DEFAULT_WINDOW_WIDTH - BORDER_WIDTH * 2,
            height: Math.max(winHeight - SEARCHBAR_HEIGHT - BORDER_WIDTH, 0),
        });
    }
}
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/host/src/window/hosts/floating-runtime-host.ts packages/host/src/window/hosts/capabilities.ts
git commit -m "refactor: FloatingRuntimeHost signature aligned, add capability interfaces

- Introduce Focusable/Pinnable/Closable capability interfaces
- FloatingRuntimeHost implements all three
- attach/detach signature accepts only runtime (no view?)
- No behavior change — view management still via RuntimeManager internally
- Step 3 will fully wire runtime.webContentsView

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2.3：RuntimeManager 职责收窄——attachToHost + detachFromHost

**Files:**
- Modify: `packages/host/src/runtime/runtime-manager.ts`
- Modify: `packages/host/src/plugins/plugin-catalog.ts`

**Interfaces:**
- `RuntimeManager.attachToHost(runtimeId, host)` — 调 `host.attach(runtime)`，不再直接操作 WindowManager
- `RuntimeManager.detachFromHost(runtimeId)` — 调 `host.detach(runtime)`
- 移除 `RuntimeManager.matchPluginFeatures()` → 归 `PluginCatalog.matchFeatures()`
- 移除 `RuntimeManager.detachToFloatingWindow()` → 归 `RuntimeCoordinator`（Step 3）
- 移除 `RuntimeManager.pinPluginWindow()` → 归 `RuntimeCoordinator`（Step 3）

- [ ] **Step 1: RuntimeManager 中 `attachToWindow` → `attachToHost`，通过 host.attach 操作 view**

```typescript
// packages/host/src/runtime/runtime-manager.ts

attachToHost(runtimeId: string, host: Host, featureCode?: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) {
        console.warn(`[RuntimeManager] attachToHost: runtime ${runtimeId} not found`);
        return;
    }

    // 单例模式：已在浮动窗口中 → 聚焦窗口（仍用 instanceof 过渡，Step 3 Coordinator 接管此逻辑）
    if (entry.runtime.host?.type === 'floating') {
        (entry.runtime.host as FloatingRuntimeHost).focus();
        entry.view.webContents.send(IPC.PLUGIN_ENTER, {
            pluginId: entry.runtime.pluginId,
            featureCode,
        });
        return;
    }

    // 通过 Host 接口操作 view（不再直接调 WindowManager.attachPluginView）
    host.attach(entry.runtime, entry.view);
    entry.runtime.host = host;
    entry.runtime.state = 'attached';

    // 查询插件展示信息
    let pluginName = entry.runtime.pluginId;
    let featureExplain = '';
    const plugin = this.pluginManager.get(entry.runtime.pluginId);
    if (plugin) {
        const feature = plugin.manifest.features.find(f => f.code === featureCode);
        if (feature) {
            pluginName = feature.explain || plugin.id;
            featureExplain = feature.explain || '';
        }
    }

    // 通知渲染进程
    const win = this.windowManager.getWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId: entry.runtime.id,
            pluginId: entry.runtime.pluginId,
            pluginName,
            featureExplain,
            state: 'attached',
        });
    }

    // 通知插件
    entry.view.webContents.send(IPC.PLUGIN_ENTER, {
        pluginId: entry.runtime.pluginId,
        featureCode,
    });
}
```

注意：`host.attach(entry.runtime, entry.view)` 通过 `view?` 过渡参数传递 view。Step 3 换新 `PluginRuntime` 类型后改为 `host.attach(runtime)` + 内部读 `runtime.webContentsView`。

- [ ] **Step 2: `detachFromWindow` → `detachFromHost`**

```typescript
detachFromHost(runtimeId: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;

    if (entry.runtime.host) {
        entry.runtime.host.detach(entry.runtime);  // 通过 host 移除 view
    }
    entry.runtime.state = 'detached';  // detach() 内已设 state，此处确保
    entry.runtime.host = null;

    // 通知渲染进程（此处保留，host.detach 不负责通知）
    const win = this.windowManager.getWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId: entry.runtime.id,
            pluginId: entry.runtime.pluginId,
            state: 'detached',
        });
    }
}
```

- [ ] **Step 3: `destroyFromWindow` 中使用 `detachFromHost` 替代手动 detach**

```typescript
destroyFromWindow(runtimeId: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;

    if (entry.runtime.host instanceof FloatingRuntimeHost) {
        entry.runtime.host.detach(entry.runtime);
        entry.view.webContents.close();
        this.entries.delete(runtimeId);
        return;
    }

    this.detachFromHost(runtimeId);  // 走 host.detach + 通知
    entry.view.webContents.close();
    this.entries.delete(runtimeId);
}
```

- [ ] **Step 4: `detachToFloatingWindow` 整理——去除直接操作，等待 Step 3 Coordinator 接管**

```typescript
// 保留方法但标记 @deprecated，内部简化
/** @deprecated Use RuntimeCoordinator.moveToHost() instead */
detachToFloatingWindow(runtimeId: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;

    const win = this.windowManager.getWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId: entry.runtime.id,
            pluginId: entry.runtime.pluginId,
            state: 'detached',
        });
    }

    this.detachFromHost(runtimeId);

    const pluginId = entry.runtime.pluginId;
    let pluginName = pluginId;
    let explain = '';
    const pluginInfo = this.pluginManager.get(pluginId);
    if (pluginInfo) {
        const feature = pluginInfo.manifest.features[0];
        if (feature) {
            pluginName = feature.explain || pluginInfo.id;
            explain = feature.explain || '';
        }
    }

    // 这里保留直接 new FloatingRuntimeHost（Step 3 Coordinator 会接管此逻辑）
    const host = new FloatingRuntimeHost(`floating-${Date.now()}`);
    host.createWindow(pluginName, entry.runtime.id, pluginId, explain);
    host.attach(entry.runtime, entry.view);
}
```

- [ ] **Step 5: 移除 `matchPluginFeatures`，在 PluginCatalog 中添加 `matchFeatures`**

```typescript
// packages/host/src/plugins/plugin-catalog.ts

export class PluginCatalog {
    // ... 现有方法 ...

    /** 匹配插件 features[].cmds */
    matchFeatures(query: string): SearchResult[] {
        const results: SearchResult[] = [];
        const lower = query.trim().toLowerCase();
        if (!lower) return results;

        for (const plugin of this.getEnabled()) {
            for (const feature of plugin.manifest.features) {
                const match = (feature.cmds || []).some((cmd) => {
                    if (typeof cmd === 'string') return cmd.toLowerCase() === lower;
                    return false;
                });
                if (match) {
                    results.push({
                        id: `plugin-activate-${plugin.id}-${feature.code}`,
                        title: feature.explain || feature.code,
                        subtitle: `打开 ${plugin.id}`,
                        icon: feature.icon || '🧩',
                        group: '插件',
                        score: 90,
                        action: { type: 'plugin.open', payload: { pluginId: plugin.id, featureCode: feature.code } },
                    });
                }
            }
        }
        return results;
    }
}
```

- [ ] **Step 6: 更新 register-handlers.ts——用 PluginCatalog.matchFeatures 替代 RuntimeManager.matchPluginFeatures**

```typescript
// packages/host/src/ipc/register-handlers.ts

// 在 search handler 中：
- results.push(...runtimeManager.matchPluginFeatures(req.query));
+ results.push(...pluginCatalog.matchFeatures(req.query));
```

- [ ] **Step 7: 更新 runtime-manager.ts import（移除 matchPluginFeatures，更新 pluginManager → pluginCatalog 引用）**

- [ ] **Step 8: 类型检查 + 回归验证**

```bash
npx tsc --noEmit 2>&1
# 验证：搜索仍能匹配插件 feature，打开/隐藏/分离/销毁正常
```

- [ ] **Step 9: Commit**

```bash
git add packages/host/src/runtime/runtime-manager.ts packages/host/src/plugins/plugin-catalog.ts packages/host/src/ipc/register-handlers.ts
git commit -m "refactor: RuntimeManager attachToHost/detachFromHost via RuntimeHost

- attachToHost calls host.attach(runtime) instead of WindowManager directly
- detachFromHost calls host.detach(runtime)
- matchPluginFeatures moved to PluginCatalog.matchFeatures
- Prepares for RuntimeCoordinator in Step 3

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2.4：WindowManager 收窄——移除 pluginView 和 attachPluginView

**Files:**
- Modify: `packages/host/src/window/window-manager.ts`
- Modify: `packages/host/src/runtime/runtime-manager.ts`（调整对 WindowManager 的调用）

**Interfaces:**
- `WindowManager` 只保留：`createMainWindow`, `getWindow`, `show`, `hide`, `isVisible`, `resize`, `repositionToCursor`, `addChildView`, `removeChildView`, `relayout`
- 移除 `attachPluginView`, `detachPluginView`, `pluginView` 字段, `updatePluginBounds`, `createHost`, `registerHost`, `getHost`

- [ ] **Step 1: 重写 WindowManager——只保留窗口原语**

```typescript
// packages/host/src/window/window-manager.ts

import { BORDER_WIDTH, DEFAULT_WINDOW_WIDTH, MAX_WINDOW_HEIGHT, MIN_WINDOW_HEIGHT, SEARCHBAR_HEIGHT, WINDOW_TOP_OFFSET_RATIO } from '@szybko/shared';
import { BrowserWindow, WebContentsView, screen } from 'electron';
import { RuntimeHostRegistry } from './runtime-host-registry';

export class WindowManager {
    private window: BrowserWindow | null = null;

    createMainWindow(preloadPath: string): BrowserWindow {
        this.repositionToCursor();

        this.window = new BrowserWindow({
            width: DEFAULT_WINDOW_WIDTH,
            height: MIN_WINDOW_HEIGHT,
            frame: false,
            transparent: true,
            resizable: false,
            webPreferences: {
                preload: preloadPath,
                sandbox: false,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        this.window.contentView.setBorderRadius(8);
        this.window.on('blur', () => this.window?.hide());
        return this.window;
    }

    getWindow() { return this.window; }

    repositionToCursor() {
        const cursorPoint = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(cursorPoint);
        const winX = Math.round(display.workArea.x + (display.workArea.width - DEFAULT_WINDOW_WIDTH) / 2);
        const winY = Math.round(display.workArea.y + display.workArea.height * WINDOW_TOP_OFFSET_RATIO);
        this.window?.setPosition(winX, winY);
    }

    resize(height: number) {
        const clamped = Math.min(Math.max(height, MIN_WINDOW_HEIGHT), MAX_WINDOW_HEIGHT);
        this.window?.setSize(DEFAULT_WINDOW_WIDTH, clamped);
        this.relayout();
    }

    show() {
        this.repositionToCursor();
        this.window?.show();
    }

    hide() { this.window?.hide(); }
    isVisible(): boolean { return this.window?.isVisible() ?? false; }

    // ── HostRegistry 访问（只读 getter，供过渡期使用） ──
    private hostRegistry: RuntimeHostRegistry | null = null;

    initHostRegistry(): RuntimeHostRegistry {
        this.hostRegistry = new RuntimeHostRegistry(this);
        return this.hostRegistry;
    }

    getHostRegistry(): RuntimeHostRegistry | null {
        return this.hostRegistry;
    }

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

    relayout(): void {
        if (!this.window) return;
        const [, height] = this.window.getSize();
        // 遍历所有子 view 重新布局
        const views = this.window.contentView.children;
        let y = SEARCHBAR_HEIGHT;
        for (const view of views) {
            view.setBounds({
                x: BORDER_WIDTH,
                y,
                width: DEFAULT_WINDOW_WIDTH - BORDER_WIDTH * 2,
                height: Math.max(height - SEARCHBAR_HEIGHT - BORDER_WIDTH, 0),
            });
            y += height - SEARCHBAR_HEIGHT - BORDER_WIDTH;
        }
    }
}
```

- [ ] **Step 2: 更新 register-handlers.ts——用 addChildView/removeChildView**

register-handlers.ts 不直接调 `addChildView`——它调 `RuntimeManager` 的方法，`RuntimeManager` 再调 `host.attach()`，LauncherRuntimeHost 再调 `WindowManager.addChildView()`。所以 register-handlers.ts 不需要改。

但 step 2.3 已经改好了 `RuntimeManager.attachToHost` → `host.attach`。需要确保 `LauncherRuntimeHost.attach` 内部调了 `addChildView` 而非 `attachPluginView`（已在 Task 2.1 完成）。

- [ ] **Step 3: 确认 RuntimeManager 不再引用已移除的 WindowManager 方法**

检查 runtime-manager.ts 中是否还有任何 `windowManager.attachPluginView()` 或 `windowManager.detachPluginView()`——应全部替换为 `host.attach()` / `host.detach()`。

- [ ] **Step 4: 同步更新 register-handlers.ts 使用 RuntimeHostRegistry**

`host:switch` handler 目前调 `windowManager.createHost()` 和 `windowManager.registerHost()`——这些方法在 Task 2.4 中移除。同步改为用 `RuntimeHostRegistry`：

```typescript
// packages/host/src/ipc/register-handlers.ts

ipcMain.handle(
    IPC.HOST_SWITCH,
    (_event, { pluginId, targetHost }) => {
        const registry = windowManager.getHostRegistry();
        if (!registry) return { ok: false, error: 'HostRegistry not initialized' };
        const host = targetHost === 'launcher'
            ? registry.getOrCreateLauncherHost()
            : registry.createFloatingHost();
        // createFloatingHost 已自动注册，getOrCreateLauncherHost 也是
        return { ok: true, hostId: host.id };
    },
);
```

注意：此改动在 Step 3 会被 `coordinator.moveToHost()` 替代。这里只是过渡。

- [ ] **Step 4: 类型检查 + 回归验证**

```bash
npx tsc --noEmit 2>&1
# 验证四大流程
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/window/window-manager.ts
git commit -m "refactor: WindowManager narrowed to window primitives only

- Removed attachPluginView/detachPluginView/pluginView
- Removed createHost/registerHost/getHost (moved to RuntimeHostRegistry)
- Added addChildView/removeChildView/relayout for LauncherRuntimeHost
- WindowManager no longer knows about plugins or hosts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Step 2 验证清单

| 检查项 | 方法 |
|--------|------|
| 类型检查通过 | `npx tsc --noEmit` — 0 error |
| 搜索插件 → 打开 | 输入关键词 → 回车 → 插件显示 |
| 隐藏插件 | Escape → 回到搜索，插件存活 |
| 分离到浮动窗口 | 分离 → 浮动窗口出现 |
| 销毁插件 | 关闭浮动窗口 / 结束运行 → Runtime 清除 |
| WindowManager 无 host 引用 | grep 'createHost\|registerHost\|attachPluginView' window-manager.ts — 空 |
| RuntimeManager 无 matchPluginFeatures | grep 'matchPluginFeatures' runtime-manager.ts — 空 |

---

## Step 3：RuntimeCoordinator + IPC 归一

### Task 3.1：新建 RuntimeCoordinator

**Files:**
- Create: `packages/host/src/runtime/runtime-coordinator.ts`
- Modify: `packages/host/src/index.ts`

**Interfaces:**
- `RuntimeCoordinator.activatePlugin(pluginId, context?)`
- `RuntimeCoordinator.moveToHost(runtimeId, targetType)`
- `RuntimeCoordinator.hideRuntime(runtimeId)`
- `RuntimeCoordinator.destroyRuntime(runtimeId)`
- `RuntimeCoordinator.pinRuntime(runtimeId, pin)`
- `RuntimeCoordinator.showPluginMenu(runtimeId, variant?)`

- [ ] **Step 1: 创建 RuntimeCoordinator**

```typescript
// packages/host/src/runtime/runtime-coordinator.ts

import type { ActivationContext } from './types';
import type { RuntimeManager } from './runtime-manager';
import type { RuntimeHostRegistry } from '../window/runtime-host-registry';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import { Pinnable, Focusable, Closable } from '../window/hosts/capabilities';
import { IPC } from '@szybko/shared';
import { Menu } from 'electron';

export class RuntimeCoordinator {
    constructor(
        private runtimeManager: RuntimeManager,
        private hostRegistry: RuntimeHostRegistry,
        private pluginCatalog: PluginCatalog,
    ) {}

    activatePlugin(pluginId: string, context?: ActivationContext): void {
        const runtime = this.runtimeManager.getOrCreate(pluginId);
        if (!runtime) return;

        // 计算激活上下文
        const plugin = this.pluginCatalog.get(pluginId);
        const feature = context?.featureCode
            ? plugin?.manifest.features.find(f => f.code === context!.featureCode)
            : undefined;
        runtime.currentActivation = {
            featureCode: context?.featureCode ?? '',
            featureExplain: context?.featureExplain ?? feature?.explain,
            keyword: context?.keyword,
            query: context?.query,
        };

        // 获取 LauncherRuntimeHost（单例）
        const host = this.hostRegistry.getOrCreateLauncherHost();
        // 先清理 launcher 上已有的 runtime
        this.detachActiveFromLauncher();

        // 关联到 Host
        this.runtimeManager.attachToHost(runtime.id, host, context?.featureCode);
    }

    moveToHost(runtimeId: string, targetType: 'launcher' | 'floating'): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime || !runtime.host) return;

        // detach（不发 plugin:out）
        this.runtimeManager.detachFromHost(runtimeId);

        // 获取/创建目标 Host
        const host = targetType === 'launcher'
            ? this.hostRegistry.getOrCreateLauncherHost()
            : this.hostRegistry.createFloatingHost();

        // attach（发 plugin:enter）
        this.runtimeManager.attachToHost(runtimeId, host);
    }

    hideRuntime(runtimeId: string): void {
        this.runtimeManager.detachFromHost(runtimeId);
        // detachFromHost 内部发 plugin:out { reason: 'hide' }
    }

    destroyRuntime(runtimeId: string): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (runtime?.host) {
            this.runtimeManager.detachFromHost(runtimeId);
        }
        this.runtimeManager.destroy(runtimeId);
        // destroy 内部发 plugin:out { reason: 'destroy' }
    }

    pinRuntime(runtimeId: string, pin: boolean): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime?.host) return;
        const pinnable = 'setAlwaysOnTop' in runtime.host
            ? (runtime.host as Pinnable)
            : null;
        if (pinnable) pinnable.setAlwaysOnTop(pin);
    }

    showPluginMenu(runtimeId: string, variant?: 'launcher' | 'detached'): void {
        const items: Electron.MenuItemConstructorOptions[] = [];
        const isFloating = variant === 'detached';
        if (isFloating) {
            items.push({
                label: '结束运行',
                click: () => this.destroyRuntime(runtimeId),
            });
        } else {
            items.push({
                label: '分离为独立窗口',
                accelerator: 'CmdOrCtrl+D',
                click: () => {
                    // 先拿到 runtimeId 对应的 pluginId 传给 moveToHost
                    this.moveToHost(runtimeId, 'floating');
                },
            });
            items.push({ type: 'separator' });
            items.push({
                label: '结束运行',
                click: () => this.destroyRuntime(runtimeId),
            });
        }
        const menu = Menu.buildFromTemplate(items);
        menu.popup();
    }

    // ── 私有 ──

    private detachActiveFromLauncher(): void {
        const launcherHost = this.hostRegistry.getOrCreateLauncherHost();
        for (const rt of this.runtimeManager.getAll()) {
            if (rt.host?.id === launcherHost.id) {
                this.runtimeManager.detachFromHost(rt.id);
            }
        }
    }
}
```

- [ ] **Step 2: 更新 host/index.ts 导出 RuntimeCoordinator**

```typescript
export { RuntimeCoordinator } from './runtime/runtime-coordinator';
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/host/src/runtime/runtime-coordinator.ts packages/host/src/index.ts
git commit -m "feat: add RuntimeCoordinator as mandatory business flow entry

- activatePlugin, moveToHost, hideRuntime, destroyRuntime, pinRuntime
- showPluginMenu with native popup
- detachActiveFromLauncher ensures single runtime on launcher host
- Step 3.2 will wire IPC handlers to Coordinator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3.2：IPC Handler 归一到 RuntimeCoordinator

**Files:**
- Modify: `packages/host/src/ipc/register-handlers.ts`
- Modify: `packages/host/src/ipc/execute-action.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**
- `registerIpcHandlers` 接收 `RuntimeCoordinator` 替代 `RuntimeManager`
- IPC handler 只调 `RuntimeCoordinator` 方法

- [ ] **Step 1: 修改 register-handlers.ts——改用 RuntimeCoordinator**

```typescript
// packages/host/src/ipc/register-handlers.ts

import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';

export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,  // 替代 RuntimeManager
) {
    ipcMain.handle(IPC.PLUGIN_EXEC, (_event, { action }) => {
        if (action.type === 'plugin.open') {
            coordinator.activatePlugin(action.payload.pluginId, {
                featureCode: action.payload.featureCode,
            });
            return { ok: true };
        }
        return executeAction(action);
    });

    ipcMain.handle(IPC.PLUGIN_HIDE, (_event, { runtimeId }) => {
        coordinator.hideRuntime(runtimeId);
        return { ok: true };
    });

    ipcMain.handle(IPC.PLUGIN_DESTROY, (_event, { runtimeId }) => {
        coordinator.destroyRuntime(runtimeId);
        return { ok: true };
    });

    ipcMain.handle(IPC.HOST_SWITCH, (_event, { runtimeId, targetHostType }) => {
        coordinator.moveToHost(runtimeId, targetHostType);
        return { ok: true, hostId: '' };  // hostId 由 Coordinator 内部管理
    });

    ipcMain.handle(IPC.SHOW_PLUGIN_MENU, (_event, { runtimeId, variant }) => {
        coordinator.showPluginMenu(runtimeId, variant);
        return { ok: true };
    });

    ipcMain.handle(IPC.PLUGIN_PIN, (_event, { runtimeId, pin }) => {
        coordinator.pinRuntime(runtimeId, pin);
        return { ok: true };
    });

    // ── Search handler 仍需要 PluginCatalog ⚠️ ──
    // SEARCH_QUERY handler 需要 pluginCatalog.matchFeatures
    // 保持：注册时额外传入 pluginCatalog，或者 Coordinator 暴露 getPluginCatalog()
    ipcMain.handle(IPC.SEARCH_QUERY, (_event, req) => {
        const results = runBuiltinSearch(req.query);
        results.push(...coordinator.pluginCatalog.matchFeatures(req.query));
        // ...
    });
}
```

注意：`SEARCH_QUERY` handler 需要访问 `PluginCatalog.matchFeatures`。这里有两种方式：
1. `RuntimeCoordinator` 暴露 `pluginCatalog` 属性（简单，公开内部依赖）
2. `registerIpcHandlers` 额外接收 `PluginCatalog`（接口更清晰）

**推荐方案 2**——让 registerIpcHandlers 接收 coordinator + pluginCatalog：

```typescript
export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,
    pluginCatalog: PluginCatalog,
) {
    // ...
    ipcMain.handle(IPC.SEARCH_QUERY, (_event, req) => {
        const results = runBuiltinSearch(req.query);
        results.push(...pluginCatalog.matchFeatures(req.query));
        // ...
    });
}
```

- [ ] **Step 2: 修改 execute-action.ts——移除 plugin.open 处理**

```typescript
// packages/host/src/ipc/execute-action.ts
// plugin.open 已不存在于此——全归 RuntimeCoordinator
export function executeAction(action: ActionDescriptor): { ok: boolean; error?: string } {
    switch (action.type) {
        case 'shell.openPath': { /* ... */ }
        case 'shell.openUrl': { /* ... */ }
        case 'clipboard.writeText': { /* ... */ }
        case 'process.launchApp': { /* ... */ }
        case 'plugin.open':
        case 'plugin.runCommand': {
            // 不应再到达这里（IPC handler 前置拦截了）
            console.warn(`[execute] unexpected plugin action: ${action.type}`);
            return { ok: false, error: 'use RuntimeCoordinator for plugin actions' };
        }
        default:
            return { ok: false, error: `Unknown action type: ${(action as any).type}` };
    }
}
```

- [ ] **Step 3: 更新 main/index.ts——创建 Coordinator 并传入**

```typescript
// apps/desktop/src/main/index.ts

import { PluginCatalog, PluginRegistry, registerIpcHandlers, RuntimeManager, ShortcutManager, Store, WindowManager, RuntimeHostRegistry, RuntimeCoordinator } from '@szybko/host';
// ...

void app.whenReady().then(async () => {
    // ... store, registry, pluginCatalog 初始化 ...

    const runtimeManager = new RuntimeManager(pluginCatalog, windowManager, pluginPreloadPath);
    await runtimeManager.startAll();

    const hostRegistry = new RuntimeHostRegistry(windowManager);
    const coordinator = new RuntimeCoordinator(runtimeManager, hostRegistry, pluginCatalog);

    const win = windowManager.createMainWindow(preloadPath);
    // ... loadURL ...

    registerIpcHandlers(windowManager, coordinator, pluginCatalog);
    shortcutManager.registerToggle(windowManager);
});
```

- [ ] **Step 4: 类型检查 + 回归验证**

```bash
npx tsc --noEmit 2>&1
# 验证：所有 IPC handler 都通过 Coordinator
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/ipc/register-handlers.ts packages/host/src/ipc/execute-action.ts apps/desktop/src/main/index.ts
git commit -m "refactor: IPC handlers unified through RuntimeCoordinator

- registerIpcHandlers receives coordinator + pluginCatalog instead of RuntimeManager
- All plugin business flows go through coordinator
- execute-action no longer handles plugin.open (intercepted by IPC handler)
- SEARCH_QUERY still uses pluginCatalog.matchFeatures directly

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3.3：补全 IPC 类型 + plugin:out 通道

**Files:**
- Modify: `packages/shared/src/ipc/contract.ts`
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/runtime/types.ts`（补 `LoadState`, `MountState` 如尚未添加）
- Modify: `packages/host/src/runtime/runtime-manager.ts`（状态机通知逻辑）
- Modify: `apps/desktop/src/preload/api/plugin-lifecycle.ts`（暴露 `onPluginOut`）

**Interfaces:**
- `IPC.PLUGIN_OUT` 通道
- `RuntimeStatePayload`, `PluginEnterPayload`, `PluginOutPayload`, `MoveToHostRequest`
- LoadState/MountState 导出

- [ ] **Step 1: 更新 IPC channels**

```typescript
// packages/shared/src/ipc/channels.ts

export const IPC = {
    // ... 现有 ...
    PLUGIN_OUT: 'plugin:out',             // 新增
} as const;
```

- [ ] **Step 2: 更新 IPC contract**

```typescript
// packages/shared/src/ipc/contract.ts

import type { RuntimeHostInfo } from '../runtime/types';

// ── Runtime 状态变更 ──
export interface RuntimeStatePayload {
    runtimeId: string;
    pluginId: string;
    mountState: 'attached' | 'detached';
    hostInfo?: RuntimeHostInfo;
    loadState?: 'loading' | 'loaded' | 'error';
    metadata?: {
        pluginName: string;
        featureExplain?: string;
    };
}

// ── 插件进入 ──
export interface PluginEnterPayload {
    pluginId: string;
    featureCode: string;
    featureExplain?: string;
    keyword?: string;
    query?: string;
}

// ── 插件退出（新增） ──
export interface PluginOutPayload {
    pluginId: string;
    reason: 'hide' | 'destroy';
    featureCode?: string;
}

// ── Host 迁移 ──
export interface MoveToHostRequest {
    runtimeId: string;
    targetHostType: 'launcher' | 'floating';
}

export interface MoveToHostResponse {
    ok: boolean;
    hostId?: string;
    error?: string;
}

// ── 更新合约表 ──

export interface IpcMainToRendererEventContract {
    [IPC.SEARCH_BATCH]: SearchBatch;
    [IPC.WINDOW_SHOW]: void;
    [IPC.THEME_CHANGED]: { isDark: boolean };
    [IPC.PLUGIN_RUNTIME_STATE]: RuntimeStatePayload;  // 之前是 unknown
    [IPC.PLUGIN_SEARCH]: PluginSearchContext;
    [IPC.PLUGIN_ENTER]: PluginEnterPayload;            // 之前是 unknown
    [IPC.PLUGIN_OUT]: PluginOutPayload;                // 新增
}

export interface IpcInvokeContract {
    // ... 现有 ...
    [IPC.HOST_SWITCH]: {
        request: MoveToHostRequest;
        response: MoveToHostResponse;
    };
}
```

- [ ] **Step 3: 确认 RuntimeManager 状态通知使用新类型**

检查 runtime-manager.ts 中的 `win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, ...)` 调用——确保 payload 符合 `RuntimeStatePayload`。

- [ ] **Step 4: 在 RuntimeManager 的 detachFromHost 中发送 plugin:out**

```typescript
// runtime-manager.ts — detachFromHost 末尾

detachFromHost(runtimeId: string, reason?: 'hide' | 'destroy'): void {
    // ... 现有逻辑 ...

    // 发送 plugin:out 给插件
    if (reason) {
        entry.view.webContents.send(IPC.PLUGIN_OUT, {
            pluginId: entry.runtime.pluginId,
            reason,
            featureCode: entry.runtime.currentActivation?.featureCode,
        } satisfies PluginOutPayload);
    }
}
```

注意：`reason` 参数从调用方传入——`RuntimeCoordinator.hideRuntime` 传 `'hide'`，`RuntimeCoordinator.destroyRuntime` 传 `'destroy'`。

- [ ] **Step 5: 更新 preload 暴露 onPluginOut**

```typescript
// apps/desktop/src/preload/api/plugin-lifecycle.ts

import type { PluginOutPayload } from '@szybko/shared';

export function createPluginLifecycleApi() {
    return {
        onRuntimeStateChanged: on(IPC.PLUGIN_RUNTIME_STATE),
        onSearch: /* ... */,
        onPluginEnter: on(IPC.PLUGIN_ENTER),
        onPluginOut: on(IPC.PLUGIN_OUT),        // 新增
    };
}
```

更新 `packages/shared/src/api/plugin.ts` 中的 `SzybkoPluginApi` 接口：

```typescript
export interface SzybkoPluginApi {
    execute: /* ... */;
    switchHost: /* ... */;
    onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;
    onSearch: (cb: (ctx: PluginSearchContext) => SearchResult[]) => () => void;
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;  // 新增
}
```

- [ ] **Step 6: 类型检查**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ipc/ packages/shared/src/api/plugin.ts packages/host/src/runtime/runtime-manager.ts apps/desktop/src/preload/api/plugin-lifecycle.ts
git commit -m "feat: add plugin:out IPC channel, precise IPC types

- IPC.PLUGIN_OUT channel for plugin hide/destroy notification
- RuntimeStatePayload, PluginEnterPayload, PluginOutPayload, MoveToHostRequest
- onPluginOut exposed in preload and plugin API
- detachFromHost sends plugin:out with reason

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3.4：状态机拆分为 loadState + mountState 两条轴

**Files:**
- Modify: `packages/host/src/runtime/runtime-manager.ts`
- Modify: `packages/shared/src/runtime/types.ts`（确认 LoadState/MountState 已导出）

**Interfaces:**
- `RuntimeManager.transitionLoadState(runtimeId, target)`
- `RuntimeManager.transitionMountState(runtimeId, target, reason?)`

- [ ] **Step 1: 在 RuntimeEntry 中添加 loadState/mountState 字段，并实现转换方法**

```typescript
// packages/host/src/runtime/runtime-manager.ts

import type { LoadState, MountState, RuntimeStatePayload, PluginEnterPayload, PluginOutPayload } from '@szybko/shared';
import { IPC } from '@szybko/shared';

// 修改 RuntimeEntry 接口——新增 loadState/mountState 轴（独立于旧 PluginRuntime.state）
interface RuntimeEntry {
    runtime: PluginRuntime;
    view: WebContentsView;
    loadState: LoadState;          // 新增
    mountState: MountState;        // 新增
}

// 新建 Runtime 时初始化
create(pluginId: string): PluginRuntime | null {
    // ... 现有逻辑 ...
    const entry: RuntimeEntry = {
        runtime,
        view,
        loadState: 'loading',       // ← 新增
        mountState: 'detached',     // ← 新增
    };
    // ...
}

// ── 状态转换方法 ──

transitionLoadState(runtimeId: string, target: LoadState): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;

    entry.loadState = target;

    if (target === 'loaded' && entry.mountState === 'attached') {
        // 补发 plugin:enter——此时插件才真正可交互
        entry.view.webContents.send(IPC.PLUGIN_ENTER, {
            pluginId: entry.runtime.pluginId,
            featureCode: entry.runtime.currentActivation?.featureCode ?? '',
            featureExplain: entry.runtime.currentActivation?.featureExplain,
            keyword: entry.runtime.currentActivation?.keyword,
            query: entry.runtime.currentActivation?.query,
        } satisfies PluginEnterPayload);
    }
}

transitionMountState(runtimeId: string, target: MountState, reason?: 'hide' | 'destroy'): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;

    entry.mountState = target;

    // 通知宿主 UI
    const win = this.windowManager.getWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId: entry.runtime.id,
            pluginId: entry.runtime.pluginId,
            mountState: target,
            loadState: entry.loadState,
        } satisfies RuntimeStatePayload);
    }

    // 插件通知
    if (target === 'attached' && entry.loadState === 'loaded') {
        entry.view.webContents.send(IPC.PLUGIN_ENTER, {
            pluginId: entry.runtime.pluginId,
            featureCode: entry.runtime.currentActivation?.featureCode ?? '',
            featureExplain: entry.runtime.currentActivation?.featureExplain,
        } satisfies PluginEnterPayload);
    }

    if (target === 'detached' && reason) {
        entry.view.webContents.send(IPC.PLUGIN_OUT, {
            pluginId: entry.runtime.pluginId,
            reason,
            featureCode: entry.runtime.currentActivation?.featureCode,
        } satisfies PluginOutPayload);
    }
}
```

- [ ] **Step 2: 在 attachToHost/detachFromHost/destroy 中使用新状态机方法**

`transitionMountState` 发出的 IPC payload 同时包含 `state`（旧字段，向后兼容）和 `mountState`（新字段），确保 Step 3 后渲染进程仍然能处理旧格式。

```typescript
// transitionMountState 发送 payload 时包含向后兼容字段
win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
    runtimeId: entry.runtime.id,
    pluginId: entry.runtime.pluginId,
    state: target,           // ← 向后兼容：旧渲染代码读 payload.state
    mountState: target,      // ← 新字段
    loadState: entry.loadState,
    metadata: {
        pluginName: entry.runtime.pluginId,
    },
} satisfies RuntimeStatePayload & { state: string });
```

在 `attachToHost` 中用 `transitionMountState` 替代手动通知：

```typescript
attachToHost(runtimeId: string, host: Host, featureCode?: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;
    // ... 现有逻辑（host.attach + 状态设置） ...

    this.transitionMountState(runtimeId, 'attached');
    // transitionMountState 内部已处理 IPC 通知，不再需要手动
    // win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, ...)  -- 移除
}

detachFromHost(runtimeId: string, reason?: 'hide' | 'destroy'): void {
    // ... 现有逻辑 ...
    this.transitionMountState(runtimeId, 'detached', reason);
}

destroy(runtimeId: string): void {
    // ...
    this.transitionMountState(runtimeId, 'detached', 'destroy');
    // 然后 close webContents + 清理
}
```

- [ ] **Step 3: 在 WebContents did-finish-load 和 did-fail-load 事件中使用 transitionLoadState**

```typescript
// runtime-manager.ts create() 方法中
view.webContents.on('did-finish-load', () => {
    runtime.state = 'activated';                     // 保留旧逻辑（兼容）
    this.transitionLoadState(runtime.id, 'loaded');  // 新增 loadState 轴
});

view.webContents.on('did-fail-load', () => {
    this.transitionLoadState(runtime.id, 'error');
});
```

- [ ] **Step 4: 类型检查**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/runtime/runtime-manager.ts
git commit -m "refactor: state machine split into loadState + mountState

- transitionLoadState/transitionMountState as state machine entry
- loading + attached is a valid state combination
- plugin:enter deferred until loadState === 'loaded'
- plugin:out sent on detach with reason
- did-finish-load/did-fail-load drive loadState transitions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Step 3 验证清单

| 检查项 | 方法 |
|--------|------|
| 类型检查通过 | `npx tsc --noEmit` — 0 error |
| 搜索插件 → 打开 | 插件正常显示，plugin:enter 到达插件 |
| 隐藏插件 | plugin:out { reason: 'hide' } 到达插件 |
| 销毁插件 | plugin:out { reason: 'destroy' } 到达插件 |
| 分离到浮动窗口 | view 迁移，插件继续运行，不发送 plugin:out |
| loadState + mountState 正确 | 打开后 loadState='loaded' + mountState='attached' |
| IPC handler 全部通过 Coordinator | 检查 register-handlers.ts 中无直接调 RuntimeManager |
| `host:switch` 走 moveToHost | IPC handler 调 coordinator.moveToHost() |

---

## 完整验证回归（所有步骤完成后）

| 场景 | 预期 |
|------|------|
| `pnpm dev` 正常启动 | 窗口显示，搜索可用 |
| 输入关键字匹配插件 feature | 搜索结果中出现插件 |
| 选择插件打开 | WebContents 加载，插件 UI 显示在搜索栏下方 |
| 按 Escape | 插件隐藏，回到搜索模式，Runtime 保留 |
| 右键菜单 → 分离 | 浮动窗口出现，插件 UI 迁移 |
| 浮动窗口置顶 | 点击 pin 按钮 → 窗口置顶 |
| 关闭浮动窗口 | Runtime 销毁，无残留 |
| 从浮动窗口右键 → 结束运行 | 同上 |
| 反复打开/隐藏同一个插件 | 单例模式复用同一个 Runtime |
| 在 launcher 打开不同插件 | 先隐藏当前插件，再显示新插件 |

---

## 回退策略

| Step | 回退方式 |
|------|---------|
| Step 1 | 回退 package 重命名：`git revert` 对应 commit；或恢复旧 import 路径 |
| Step 2 | RuntimeCoordinator 未引入前，RuntimeManager 旧接口仍保留；若 host.attach 有问题，`RuntimeManager.attachToHost` 可直接调 `WindowManager.addChildView` 作为紧急修复 |
| Step 3 | Coordinator 有 bug 时，IPC handler 可短期回退到直接调 RuntimeManager 方法；`plugin:out` 通道缺失不会阻断已有流程 |
