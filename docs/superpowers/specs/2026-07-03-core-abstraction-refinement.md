# 核心抽象精炼：Plugin Runtime 体系的原子化重构

> 基于当前（2026-07-03）代码库的实际实现与蓝图设计的差距分析，提出一组**原子化的底层抽象**，使插件注册、检索、运行、分离、隐藏、销毁等基础能力足够干净，后续多 Host 类型、多实例、插件市场等功能迭代时无需大重构。

---

## 目录

1. [现状评估 — 抽象使用情况](#1-现状评估--抽象使用情况)
2. [设计原则](#2-设计原则)
3. [精炼后的分层职责](#3-精炼后的分层职责)
4. [命名体系](#4-命名体系)
5. [Package 边界 — shared 无 Electron 依赖](#5-package-边界--shared-无-electron-依赖)
6. [PluginCatalog 层](#6-plugincatalog-层)
7. [RuntimeManager 层](#7-runtimemanager-层)
8. [RuntimeHost 层 — 能力接口模式](#8-runtimehost-层--能力接口模式)
9. [RuntimeHostRegistry 层](#9-runtimehostregistry-层)
10. [WindowManager 层](#10-windowmanager-层)
11. [RuntimeCoordinator — 强制入口](#11-runtimecoordinator--强制入口)
12. [IPC 契约完善](#12-ipc-契约完善)
13. [状态机 — 加载与挂载分离](#13-状态机--加载与挂载分离)
14. [原子能力到高层操作的组合](#14-原子能力到高层操作的组合)
15. [迁移路径](#15-迁移路径)
16. [不做的事（显式排除）](#16-不做的事显式排除)

---

## 1. 现状评估 — 抽象使用情况

### 1.1 蓝图定义的职责矩阵（应该是这样）

```
PluginCatalog   →  插件的安装、发现、枚举
RuntimeManager  →  Runtime 生命周期（创建/销毁/查询）
                  + 状态管理（created → ... → destroyed）
                  + 跨 Runtime 通信（搜索广播）
WindowManager   →  窗口创建/定位/大小
RuntimeHost     →  展示容器（attach/detach PluginRuntime）
```

### 1.2 实际实现中的偏差

| 抽象 | 当前状态 | 问题 |
|------|----------|------|
| `Host` 接口 | `LauncherHost.attach/detach` 从未被调用；`FloatingHost.attach` 签名不兼容 | Host 接口形同虚设 |
| `RuntimeManager` | 承担了搜索、Host 切换、pin、窗口操作、菜单弹出 | 职责过载，违反单一职责 |
| `PluginRuntime` | 不含 `webContents`/`webContentsView`，view 在内部 `Map` 中 | 外部无法直接操作 view |
| `WindowManager` | `createHost()` 创建了 `LauncherHost` 但从不使用 | 死代码 |
| `host:switch` IPC | 有 handler 但只 `createHost` 不迁移 Runtime | 半成品抽象 |
| `did-finish-load` vs `attached` | attach 可能发生在 load 完成前，状态机会被异步覆盖 | 竞争条件 |
| LauncherHost 个数 | 当前 WindowManager 一个 `pluginView` 字段天然单例，但新设计没有对应机制 | 单例假设未显式处理 |

### 1.3 被 Validated 的状态（当前工作正确的部分）

- `RuntimeManager.create()` → `WebContentsView` + `PluginRuntime`
- `RuntimeManager.attachToWindow()` → view 挂载 + 双向通知
- `RuntimeManager.detachFromWindow()` → view 移除 + `detached` 状态
- `RuntimeManager.destroyFromWindow()` → view 关闭 + entry 清理
- `RuntimeManager.detachToFloatingWindow()` → view 迁移到新窗口
- `WindowManager.attachPluginView/detachPluginView` → contentView 的增删
- `PluginCatalog.scan()` → 目录扫描 + `plugin.json` 加载 + registry 同步
- 双 preload 架构（host.ts vs plugin.ts）正确隔离了宿主 UI 和插件 API
- IPC 的类型系统（`IpcInvokeContract` + `invoke`/`on`/`send` 泛型包装）方向正确

---

## 2. 设计原则

### P1：每个模块有一个清晰的责任边界

如果问"这个功能该放哪"，答案应该是明确的，而不是"放 RuntimeManager 也行"。

### P2：接口即契约，多态是核心

`RuntimeHost` 接口必须可以被多态调用，不能出现 `instanceof FloatingRuntimeHost` 分支。任何新 RuntimeHost 类型只需实现 `RuntimeHost` 接口，不修改已有代码。Host 的特有能力通过**能力接口**表达。

### P3：package 边界清晰

`@szybko/shared` 只包含可序列化的契约类型（IPC payload、RuntimeState 枚举、API 接口），不包含 Electron 主进程对象。`WebContentsView`、`BrowserWindow` 等限定在 `host` 包内。

### P4：状态变更可观测

Runtime 状态转换必须通过 IPC 通知相关方（宿主 UI + 插件自身），不能静默转换。

### P5：原子能力可组合

每个公开方法应该是单一操作（"attach runtime to host"），高层流程（"detach to floating window"）通过 `RuntimeCoordinator` 组合原子操作实现。

### P6：RuntimeCoordinator 是流程的强制入口

IPC handlers 不允许直接调用 `RuntimeManager`/`RuntimeHostRegistry`/`WindowManager` 的低阶方法。所有业务流程必须通过 `RuntimeCoordinator`，确保组合逻辑在同一个地方维护。

### P7：不为未实现的功能设计抽象

不为预热池、插件市场、sandbox 隔离等当前未实现的功能预留抽象层。这些应该在需要时自然生长。

---

## 3. 精炼后的分层职责

```
                       IPC Handlers
                           │
                           ▼
                   RuntimeCoordinator   ←── 强制入口，所有业务流程都在这里
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   PluginCatalog     RuntimeManager    RuntimeHostRegistry
   PluginRegistry                                     │
                                                      ▼
                                              RuntimeHost 接口族
                                          ┌──────┴──────┐
                                    LauncherRuntimeHost  FloatingRuntimeHost
                                          │
                                          ▼
                                     WindowManager
                                   (BrowserWindow 原语)
```

**关键规则**：

- **IPC handler 不能绕过 RuntimeCoordinator**：所有业务操作（激活、隐藏、销毁、迁移）都通过 `RuntimeCoordinator` 方法。
- **RuntimeCoordinator 编排原子操作**：`RuntimeManager.attachToHost()` 是原子操作（只调 `host.attach()` + 发通知），`RuntimeCoordinator.activatePlugin()` 是组合操作（getOrCreate + attachToHost + 发插件进入事件）。
- **RuntimeHost 不直接暴露给 IPC**：RuntimeHost 实例对 `RuntimeCoordinator` 可见，对 IPC handler 不可见。

---

## 4. 命名体系

### 4.1 核心命名对照

| 当前代码名 | 新名 | 层 | 职责 |
|-----------|------|-----|------|
| `PluginManager` | `PluginCatalog` | Plugin | 扫描目录、加载 manifest、查询可用插件 |
| `PluginRegistry` | `PluginRegistry`（不变） | Plugin | 持久化 installed/enabled/source/path |
| `RuntimeManager` | `RuntimeManager`（职责收窄） | Runtime | Runtime 生命周期、状态、查询、消息广播 |
| `Host` 接口 | `RuntimeHost` | Host | Runtime 的显示挂载点接口 |
| `LauncherHost` | `LauncherRuntimeHost` | Host | 主搜索窗口里的 RuntimeHost |
| `FloatingHost` | `FloatingRuntimeHost` | Host | 独立浮动窗口里的 RuntimeHost |
| `WindowManager` | `WindowManager`（职责收窄） | Window | BrowserWindow 创建、定位、大小等窗口原语 |
| (新建) | `RuntimeHostRegistry` | Host | RuntimeHost 实例注册/创建/查询 |
| `PluginOrchestrator` | `RuntimeCoordinator` | Orchestration | 打开、隐藏、销毁、迁移 host 的业务编排层 |

### 4.2 方法名规范

| 方法 | 所属类 | 说明 |
|------|--------|------|
| `activatePlugin(pluginId, context)` | `RuntimeCoordinator` | 用户选中插件 → 在 launcher 显示 |
| `hideRuntime(runtimeId)` | `RuntimeCoordinator` | 隐藏（保留 Runtime） |
| `destroyRuntime(runtimeId)` | `RuntimeCoordinator` | 销毁 Runtime |
| `moveToHost(runtimeId, targetHost)` | `RuntimeCoordinator` | 迁移到另一个 RuntimeHost |
| `attachToHost(runtimeId, host)` | `RuntimeManager` | 原子操作：关联到 Host |
| `detachFromHost(runtimeId)` | `RuntimeManager` | 原子操作：从 Host 解关联 |
| `getOrCreateLauncherHost()` | `RuntimeHostRegistry` | 获取/创建 LauncherRuntimeHost 单例 |
| `createFloatingHost()` | `RuntimeHostRegistry` | 创建新的 FloatingRuntimeHost |

### 4.3 命名轴

```
Plugin 轴      → 回答"有哪些插件可用"
  PluginRegistry, PluginCatalog

Runtime 轴     → 回答"Runtime 在哪、什么状态、怎么操作"
  RuntimeManager, RuntimeHost, RuntimeCoordinator

Window 轴      → 回答"BrowserWindow 多大、在哪"
  WindowManager
```

没有两个类回答同一个问题。

---

## 5. Package 边界 — shared 无 Electron 依赖

### 5.1 问题

`@szybko/shared` 的 `package.json` 没有 `electron` 依赖，它只提供跨包的纯类型契约。不能把 `WebContentsView` 等 Electron 类型放进去。

### 5.2 类型分两层

```
@zybko/shared/src/runtime/types.ts        # 纯可序列化契约
@packages/host/src/runtime/types.ts        # Electron 主进程类型
```

#### `@szybko/shared` 层（无 Electron 依赖）

```typescript
// packages/shared/src/runtime/types.ts

export type RuntimeState
    = 'created'
    | 'loading'
    | 'loaded'
    | 'attached'
    | 'detached'
    | 'destroyed';

/** Runtime 的负载状态 */
export type LoadState = 'loading' | 'loaded' | 'error';

/** Runtime 的挂载状态 */
export type MountState = 'attached' | 'detached';

/** 可序列化的运行时摘要信息，用于 IPC 通知和 UI 展示 */
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

#### `packages/host` 层（含 Electron 类型）

```typescript
// packages/host/src/runtime/types.ts

import type { RuntimeInfo, RuntimeState, RuntimeHostInfo } from '@szybko/shared';
import type { WebContents, WebContentsView } from 'electron';

/** 插件激活上下文 — 每次进入插件时的动态参数 */
export interface ActivationContext {
    featureCode: string;
    featureExplain?: string;
    keyword?: string;
    query?: string;
}

/** 主进程内部的完整 Runtime 表示 */
export interface PluginRuntime {
    // ── 公开信息（可序列化） ──
    info: RuntimeInfo;

    // ── Electron 主进程对象 ──
    webContentsView: WebContentsView;
    webContents: WebContents;

    // ── 业务数据 ──
    cache: Map<string, any>;
    pluginName: string;

    // ── 当前激活上下文（每次 attach 时更新） ──
    currentActivation?: ActivationContext;
}
```

### 5.3 跨包引用关系

```
shared  ──→  RuntimeInfo, RuntimeHostInfo, RuntimeState,
              LoadState, MountState, ActivationContext (纯类型)
             无 Electron 导入

host    ──→  PluginRuntime (包含 RuntimeInfo + WebContentsView)
             import { RuntimeInfo } from '@szybko/shared'

shell   ──→  RuntimeInfo, RuntimeHostInfo (用于 zustand store 和 UI 渲染)
             无 Electron 导入
```

---

## 6. PluginCatalog 层

### 6.1 现有问题

- `install`/`uninstall`/`update` 在 `PluginManager` 类型中被定义但未实现
- `store.ts`（通用 JSON 持久化）放在 `plugins/` 目录下
- `matchPluginFeatures`（搜索匹配）不应该在 RuntimeManager 中

### 6.2 原子能力

```typescript
class PluginCatalog {
    // ── 查询（read-only）──────────────────────────────────
    /** 获取单个插件信息 */
    get(id: string): PluginInfo | undefined;

    /** 获取所有扫描到的插件 */
    getAll(): PluginInfo[];

    /** 获取所有已启用的插件 */
    getEnabled(): PluginInfo[];

    // ── 发现 ─────────────────────────────────────────────
    /** 扫描插件目录，加载 plugin.json，同步 registry */
    scan(): void;

    // ── 启停 ─────────────────────────────────────────────
    /** 启用/禁用（只改 registry 状态，不创建/销毁 Runtime） */
    enable(id: string): void;
    disable(id: string): void;

    // ── 安装/卸载（骨架 — 实现体待未来填充） ───────────
    install(path: string): void;      // throws NotImplemented
    uninstall(id: string): void;      // throws NotImplemented
    update(id: string): void;         // throws NotImplemented

    // ── Feature 匹配（从 RuntimeManager 移入） ──────────
    /** 按用户输入匹配插件 feature cmds */
    matchFeatures(query: string): FeatureMatchResult[];
}
```

`PluginCatalog` 只回答"有哪些插件可用"这个问题。它不创建 Runtime，不操作窗口，不处理 IPC。`enable/disable` 只是修改 `PluginRegistry` 中的开关状态，不负责销毁或创建 Runtime。

`Store` 从 `plugins/` 移到 `packages/host/src/persistence/store.ts`。

---

## 7. RuntimeManager 层

### 7.1 设计的解耦目标

| 职责 | 去向 |
|------|------|
| Runtime 创建/销毁/查询 | RuntimeManager **保留** |
| 状态机 | RuntimeManager **保留** |
| 向 Runtime 发送/广播消息 | RuntimeManager **保留** |
| Host 关联（`attachToHost`/`detachFromHost`） | RuntimeManager **保留**（原子操作） |
| `matchPluginFeatures` | 移到 `PluginCatalog` |
| 多步编排（分离到浮动窗口等） | 移入 `RuntimeCoordinator` — 强制入口 |
| `pinPluginWindow` | 通过 RuntimeHost 能力接口 + RuntimeCoordinator |

### 7.2 原子能力

```typescript
class RuntimeManager {
    // ── 生命周期 ─────────────────────────────────────────
    /** 创建 Runtime：new WebContentsView + PluginRuntime，加载 URL */
    create(pluginId: string): PluginRuntime;

    /** 销毁 Runtime：close WebContents + 清理 */
    destroy(runtimeId: string): void;

    /** 获取单个 Runtime */
    get(runtimeId: string): PluginRuntime | undefined;

    /** 按 pluginId 查找所有 Runtime（单例模式取第一个） */
    getByPluginId(pluginId: string): PluginRuntime[];

    /** 获取所有 Runtime */
    getAll(): PluginRuntime[];

    /** 获取或创建 Runtime（已存在则复用） */
    getOrCreate(pluginId: string): PluginRuntime | null;

    // ── 状态机 ─────────────────────────────────────────
    /** 转换 Runtime 状态（自动触发通知） */
    transitionLoadState(runtimeId: string, target: LoadState): void;
    transitionMountState(runtimeId: string, target: MountState): void;

    // ── 消息 ─────────────────────────────────────────────
    /** 向指定 Runtime 发送消息 */
    sendMessage(runtimeId: string, channel: string, payload: unknown): void;

    /** 向满足条件的所有 Runtime 广播消息 */
    broadcast(channel: string, payload: unknown, filter?: (r: PluginRuntime) => boolean): void;

    // ── RuntimeHost 关联（原子操作） ──────────────────
    /** 将 Runtime 关联到某个 RuntimeHost（内部调 host.attach） */
    attachToHost(runtimeId: string, host: RuntimeHost): void;

    /** 将 Runtime 从当前 RuntimeHost 解关联（内部调 host.detach） */
    detachFromHost(runtimeId: string): void;

    // ── 预热池（Phase 2） ──────────────────────────────
    // 当前不实现
}
```

**关键行为变化**：
- `attachToHost` 调 `host.attach(runtime)`。view 的添加到 RuntimeHost 内部完成，RuntimeManager 不直接操作 WindowManager。
- `detachFromHost` 调 `host.detach(runtime)`。同上。
- `transitionLoadState`/`transitionMountState` 是状态机入口，所有状态变更经此方法，自动触发通知。

---

## 8. RuntimeHost 层 — 能力接口模式

### 8.1 问题

简单的 `attach/detach` 接口不够表达 `FloatingRuntimeHost` 的 `focus()`、`setAlwaysOnTop()`、`close()` 等能力。如果把这些方法放进 `RuntimeHost` 接口，`LauncherRuntimeHost` 也要实现它们（空实现或抛错）。如果放外面，调用方又得 `instanceof FloatingRuntimeHost`。

### 8.2 解决方案：能力接口（Capability Interfaces）

```typescript
// ── 核心接口（所有 RuntimeHost 必须实现） ─────────────

interface RuntimeHost {
    readonly id: string;
    readonly type: 'launcher' | 'floating';

    /** 挂载 Runtime 的视图到当前容器 */
    attach(runtime: PluginRuntime): void;

    /** 从当前容器移除 Runtime 的视图 */
    detach(runtime: PluginRuntime): void;
}

// ── 可选能力接口（按需实现） ───────────────────────────

interface Focusable {
    focus(): void;
}

interface Pinnable {
    setAlwaysOnTop(pin: boolean): void;
}

interface Closable {
    /** 关闭窗口并清理资源 */
    close(): void;
}

interface Resizable {
    resize(width: number, height: number): void;
}

interface Positionable {
    setPosition(x: number, y: number): void;
}
```

### 8.3 LauncherRuntimeHost

```typescript
class LauncherRuntimeHost implements RuntimeHost {
    readonly id: string;
    readonly type = 'launcher' as const;

    constructor(
        id: string,
        private windowManager: WindowManager,
    ) {}

    attach(runtime: PluginRuntime): void {
        this.windowManager.addChildView(runtime.webContentsView);
        this.windowManager.relayout();
    }

    detach(runtime: PluginRuntime): void {
        this.windowManager.removeChildView(runtime.webContentsView);
        this.windowManager.relayout();
    }
}
```

`LauncherRuntimeHost` 不实现 `Focusable`/`Pinnable`/`Closable`——它不拥有独立窗口，这些操作通过 `WindowManager` 完成。

### 8.4 FloatingRuntimeHost

```typescript
class FloatingRuntimeHost implements RuntimeHost, Focusable, Pinnable, Closable {
    readonly id: string;
    readonly type = 'floating' as const;

    private window: BrowserWindow | null = null;
    private currentRuntimeId: string | null = null;

    constructor(id: string) {}

    // ── RuntimeHost ────────────────────────────────────

    attach(runtime: PluginRuntime): void {
        if (!this.window) this.createWindow(runtime.pluginName);
        this.window!.contentView.addChildView(runtime.webContentsView);
        this.layoutCurrentView();
        this.window!.show();
        this.currentRuntimeId = runtime.id;
    }

    detach(runtime: PluginRuntime): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(runtime.webContentsView);
        }
        this.currentRuntimeId = null;
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
        this.window?.close();
        this.window = null;
    }

    // ── 内部方法 ────────────────────────────────────────

    private createWindow(pluginName: string): void {
        this.window = new BrowserWindow({ /* ... */ });
        this.window.getContentView().setBorderRadius(10);
        this.window.loadURL(/* floating.html */);
    }

    private layoutCurrentView(): void {
        if (!this.window || !this.currentRuntimeId) return;
        // 计算 view bounds
    }
}
```

### 8.5 如何安全使用能力接口

没有 `instanceof`，而是通过 `RuntimeCoordinator` 提供类型安全的能力查询：

```typescript
// 在 RuntimeCoordinator 中
class RuntimeCoordinator {
    pinRuntime(runtimeId: string, pin: boolean): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime?.host) return;

        const pinnable = this.asPinnable(runtime.host);
        if (pinnable) {
            pinnable.setAlwaysOnTop(pin);
        }
    }

    private asPinnable(host: RuntimeHost): Pinnable | null {
        return 'setAlwaysOnTop' in host ? (host as Pinnable) : null;
    }

    private asFocusable(host: RuntimeHost): Focusable | null {
        return 'focus' in host ? (host as Focusable) : null;
    }

    private asClosable(host: RuntimeHost): Closable | null {
        return 'close' in host ? (host as Closable) : null;
    }
}
```

**为什么这比 `instanceof` 好**：
- 不依赖具体类名——任何 RuntimeHost 只要实现了 `setAlwaysOnTop` 就自动是 `Pinnable`
- 能力查询在 `RuntimeCoordinator` 内部集中维护，外部不感知
- 新增能力接口不需要修改 RuntimeManager 或 RuntimeHostRegistry

---

## 9. RuntimeHostRegistry 层

### 9.1 为什么需要单独的 Registry

当前 `WindowManager` 承担了 Host 的创建和注册。但 Host 的注册/查询和 BrowserWindow 的原语操作是两件事。拆开之后：

- `RuntimeHostRegistry`：回答"有哪些 RuntimeHost 实例？哪个是 launcher？"
- `WindowManager`：回答"BrowserWindow 多大？在哪？怎么加子 view？"

### 9.2 RuntimeHostRegistry

```typescript
class RuntimeHostRegistry {
    // ── 工厂（LauncherRuntimeHost 是单例） ─────────────
    getOrCreateLauncherHost(): LauncherRuntimeHost;
    createFloatingHost(): FloatingRuntimeHost;

    // ── 注册/查询 ──────────────────────────────────────
    registerHost(host: RuntimeHost): void;
    unregisterHost(hostId: string): void;
    getHost(hostId: string): RuntimeHost | undefined;
    getAllHosts(): RuntimeHost[];
}
```

**LauncherRuntimeHost 单例机制**：

```typescript
class RuntimeHostRegistry {
    private launcherHost: LauncherRuntimeHost | null = null;
    private hosts: Map<string, RuntimeHost> = new Map();

    getOrCreateLauncherHost(): LauncherRuntimeHost {
        if (!this.launcherHost) {
            this.launcherHost = new LauncherRuntimeHost(`launcher-host`, this.windowManager);
            this.hosts.set(this.launcherHost.id, this.launcherHost);
        }
        return this.launcherHost;
    }

    createFloatingHost(): FloatingRuntimeHost {
        const host = new FloatingRuntimeHost(`floating-${Date.now()}`);
        this.hosts.set(host.id, host);
        return host;
    }

    registerHost(host: RuntimeHost): void {
        this.hosts.set(host.id, host);
    }

    unregisterHost(hostId: string): void {
        this.hosts.delete(hostId);
    }

    getHost(hostId: string): RuntimeHost | undefined {
        return this.hosts.get(hostId);
    }

    getAllHosts(): RuntimeHost[] {
        return Array.from(this.hosts.values());
    }
}
```

`RuntimeHostRegistry` 的构造函数接收 `WindowManager` 实例，在创建 `LauncherRuntimeHost` 时注入。

---

## 10. WindowManager 层

### 10.1 现有问题

- `createHost('launcher')` 创建了 `LauncherHost` 但不在构造时注入 `WindowManager`
- `attachPluginView` 维护了 `pluginView` 单字段
- 职责混了 Host 工厂和窗口原语

### 10.2 精炼后的职责（职责收窄）

```typescript
class WindowManager {
    // ── 主窗口生命周期 ─────────────────────────────
    createMainWindow(preloadPath: string): BrowserWindow;
    getWindow(): BrowserWindow | null;
    show(): void;
    hide(): void;
    isVisible(): boolean;

    // ── 窗口几何 ──────────────────────────────────
    resize(height: number): void;
    repositionToCursor(): void;

    // ── 低阶视图操作（供 LauncherRuntimeHost 使用） ──
    /** 将子 view 添加到主窗口 contentView */
    addChildView(view: WebContentsView): void;
    /** 从主窗口 contentView 移除子 view */
    removeChildView(view: WebContentsView): void;
    /** 重新计算所有子 view 的位置（窗口 resize 或 view 变更时调用） */
    relayout(): void;
}
```

`WindowManager` 现在完全不知道 Runtime、RuntimeHost、插件的存在。它只提供 BrowserWindow 的原语操作。

连接关系：`RuntimeHostRegistry` 创建 `LauncherRuntimeHost` 时注入 `WindowManager`；`LauncherRuntimeHost.attach/detach` 内部分别调 `WindowManager.addChildView`/`removeChildView`。

---

## 11. RuntimeCoordinator — 强制入口

### 11.1 为什么不是可选的

IPC handler 只能调 `RuntimeCoordinator` 的方法，不能调 `RuntimeManager`/`RuntimeHostRegistry`/`WindowManager` 的方法。

```
     IPC Handlers
         │
         ▼ 只调这里
   RuntimeCoordinator
         │
         ▼ 内部组合
   RuntimeManager.attachToHost()
   RuntimeHostRegistry.getOrCreateLauncherHost()
   etc.
```

### 11.2 RuntimeCoordinator 的完整定义

```typescript
class RuntimeCoordinator {
    constructor(
        private runtimeManager: RuntimeManager,
        private hostRegistry: RuntimeHostRegistry,
        private pluginCatalog: PluginCatalog,
    ) {}

    // ── 插件激活（搜索选中 → 显示插件 UI） ────────
    activatePlugin(pluginId: string, context?: ActivationContext): void;

    // ── Host 迁移 ──────────────────────────────────
    /** 在任意两个 RuntimeHost 之间迁移 Runtime */
    moveToHost(runtimeId: string, targetType: 'launcher' | 'floating'): void;

    // ── 隐藏（保留 Runtime） ──────────────────────
    hideRuntime(runtimeId: string): void;

    // ── 销毁 ──────────────────────────────────────
    destroyRuntime(runtimeId: string): void;

    // ── RuntimeHost 能力操作（安全包装） ──────────
    focusRuntime(runtimeId: string): void;
    pinRuntime(runtimeId: string, pin: boolean): void;
    showPluginMenu(runtimeId: string, variant?: 'launcher' | 'detached'): void;
}
```

### 11.3 RuntimeCoordinator 内部实现

```typescript
class RuntimeCoordinator {
    activatePlugin(pluginId: string, context?: ActivationContext): void {
        // 1. 获取或创建 Runtime
        const runtime = this.runtimeManager.getOrCreate(pluginId);
        if (!runtime) return;

        // 2. 计算当前激活上下文（如果没有传入，也尝试从 manifest 补 featureExplain）
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

        // 3. 获取 LauncherRuntimeHost（单例，不会重复创建）
        const host = this.hostRegistry.getOrCreateLauncherHost();
        // 如果当前已有活跃 Runtime，先 detach
        this.detachActiveFromLauncher();

        // 4. 关联到 Host（原子操作，内部调 host.attach + 发通知）
        this.runtimeManager.attachToHost(runtime.id, host);
    }

    moveToHost(runtimeId: string, targetType: 'launcher' | 'floating'): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime || !runtime.host) return;

        // 1. 从当前 Host 解关联（不发 plugin:out）
        this.runtimeManager.detachFromHost(runtimeId);

        // 2. 创建/获取目标 Host
        const host = targetType === 'launcher'
            ? this.hostRegistry.getOrCreateLauncherHost()
            : this.hostRegistry.createFloatingHost();

        // 3. 关联到新 Host（发 plugin:enter，不发 plugin:out）
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

    // ── 私有辅助 ──

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

### 11.4 IPC handler 的唯一出口

```typescript
// register-handlers.ts — 正确的做法
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
    return { ok: true, hostId: findNewHostId() };
});
```

IPC handler 不知道 `RuntimeCoordinator` 内部怎么组合原子操作。它只知道"隐藏 → 调 coordinator.hideRuntime"。

---

## 12. IPC 契约完善

### 12.1 现有问题

| channel | 当前类型 | 问题 |
|---------|----------|------|
| `IPC.PLUGIN_RUNTIME_STATE` | `unknown` | 应定义精确的 payload |
| `IPC.PLUGIN_ENTER` | `unknown` | 同上 |
| `IPC.HOST_SWITCH` | 已定义但 handler 不完整 | 应该完成而非删除 |
| `plugin:out` 通道 | 不存在 | 插件无法感知被分离/隐藏 |
| `host:switch` 的 request 用 `pluginId` | 不精确 | 应该用 `runtimeId` |

### 12.2 完整的 IPC 契约

```typescript
// packages/shared/src/ipc/contract.ts

// ── Runtime 状态变更通知 ──────────────────────────

interface RuntimeStatePayload {
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

// ── 插件进入通知 ─────────────────────────────────

interface PluginEnterPayload {
    pluginId: string;
    featureCode: string;
    featureExplain?: string;
    keyword?: string;
    query?: string;
}

// ── 插件退出通知（当前缺失） ─────────────────────

interface PluginOutPayload {
    pluginId: string;
    /** 退出原因 — hide: 隐藏保留；destroy: 销毁 */
    reason: 'hide' | 'destroy';
    featureCode?: string;
}

// ── Host 迁移请求 ────────────────────────────────

interface MoveToHostRequest {
    runtimeId: string;
    targetHostType: 'launcher' | 'floating';
}

interface MoveToHostResponse {
    ok: boolean;
    hostId?: string;
    error?: string;
}
```

### 12.3 通知规则

| 操作 | 宿主 UI 收到 | 插件收到 | 说明 |
|------|-------------|---------|------|
| `attachToHost` | `mountState: attached` | `plugin:enter` | 插件显示 UI |
| `detachFromHost` (hide) | `mountState: detached` | `plugin:out { reason: 'hide' }` | 宿主回到搜索 |
| `destroy` | `mountState: detached` | `plugin:out { reason: 'destroy' }` | 清理状态 |
| `moveToHost` | `mountState: detached` + `mountState: attached` | `plugin:enter`（不发送 plugin:out） | view 移动窗口，插件继续运行 |

关键区别：**`moveToHost` 不发 `plugin:out`**。插件从 launcher 移到 floating 只是显示位置变了，插件仍在运行。插件收到新的 `plugin:enter` 通知。

---

## 13. 状态机 — 加载与挂载分离

### 13.1 问题

当前状态机是线性链条：

```
created → activated → attached → detached → destroyed
           ↑
     did-finish-load（异步）
```

如果用户在 `did-finish-load` 触发前就执行 `attach`，状态从 `created` 跳到 `attached`，然后 `did-finish-load` 又设回 `activated`。这是一个竞争条件。

### 13.2 解决方案：两条独立的轴

Load 状态和 Mount 状态是正交的：

```
Load 轴:   loading ──→ loaded ──→ error
                   ↑
             did-finish-load / did-fail-load

Mount 轴:   detached ⇄ attached
                   （attachToHost / detachFromHost）
```

### 13.3 运行时状态表示

```typescript
// 在 PluginRuntime 中
{
    info: {
        loadState: 'loading' | 'loaded' | 'error';
        mountState: 'attached' | 'detached';
    }
}
```

### 13.4 状态转换表

```
Load 转换：
  created → (自动) loading → (did-finish-load) loaded
  loading → (did-fail-load) error
  loaded  → (destroy) destroyed

Mount 转换（独立于 loadState）：
  * → attached     attachToHost  （任何时候都可以）
  * → detached     detachFromHost（任何时候都可以）

终结态：
  * → destroyed    destroy        （优先于 load/mount）
```

**允许的组合**：

| loadState | mountState | 含义 |
|-----------|-----------|------|
| `loading` | `detached` | 正在加载，未显示 |
| `loading` | `attached` | 正在加载但已经显示了（用户操作快于加载完成） |
| `loaded` | `detached` | 加载完成，未显示 |
| `loaded` | `attached` | 加载完成，正在显示 ← 正常态 |
| `error` | `detached` | 加载失败 |
| `error` | `attached` | 加载失败但仍显示错误页 |

`loading + attached` 是正确的——用户在插件加载期间看到空白或加载指示器，加载完成后自动更新。

### 13.5 通知规则

| 转换 | 通知 |
|------|------|
| `loading → loaded` | 如果 `mountState === 'attached'`，补发 `plugin:enter`（此时才真正可交互） |
| `loading → error` | 如果 `mountState === 'attached'`，发送错误通知给宿主 UI |
| `mountState: detached → attached` | 发送 `mountState: attached` 给宿主 UI；如果 `loadState === 'loaded'` 再发 `plugin:enter` |
| `mountState: attached → detached` | 发送 `mountState: detached` 给宿主 UI + `plugin:out`（如果是 hide/destroy） |
| `→ destroyed` | 发送 `cleanup` 通知 |

### 13.6 transitionLoadState / transitionMountState 的实现

```typescript
// 在 RuntimeManager 中
transitionLoadState(runtimeId: string, target: LoadState): void {
    const runtime = this.get(runtimeId);
    if (!runtime) return;

    runtime.info.loadState = target;

    if (target === 'loaded' && runtime.info.mountState === 'attached') {
        this.notifyPluginEnter(runtime);  // 补发 enter
    }
}

transitionMountState(runtimeId: string, target: MountState, reason?: 'hide' | 'destroy'): void {
    const runtime = this.get(runtimeId);
    if (!runtime) return;

    runtime.info.mountState = target;
    this.notifyHostUI(runtime);

    if (target === 'attached' && runtime.info.loadState === 'loaded') {
        this.notifyPluginEnter(runtime);
    }
    if (target === 'detached' && reason) {
        this.notifyPluginOut(runtime, reason);
    }
}
```

---

## 14. 原子能力到高层操作的组合

### 14.1 当前流程 vs 目标

#### 用户选中插件

```
plugin:exec
  → coordinator.activatePlugin(pluginId, context)
    → runtime = runtimeManager.getOrCreate(pluginId)
    → runtime.currentActivation = { featureCode, featureExplain, keyword }
    → hostRegistry.getOrCreateLauncherHost()        // 单例
    → detachActiveFromLauncher()                     // 已有 view 先移除
    → runtimeManager.attachToHost(runtime.id, host)
      → host.attach(runtime)
        → LauncherRuntimeHost: windowManager.addChildView(view) + relayout()
        → FloatingRuntimeHost: (窗口不存在则创建) addChildView + show
      → (状态机自动发通知：mountState + plugin:enter)
```

#### 迁移到浮动窗口

```
host:switch
  → coordinator.moveToHost(runtimeId, 'floating')
    → runtimeManager.detachFromHost(runtimeId)      // 不发 plugin:out
      → host.detach(runtime)
      → mountState → detached, 通知宿主 UI
    → host = hostRegistry.createFloatingHost()
    → runtimeManager.attachToHost(runtimeId, host)
      → host.attach(runtime)
        → FloatingRuntimeHost: (窗口不存在则创建) addChildView + show
      → mountState → attached, 通知宿主 UI + plugin:enter
```

#### 隐藏 Runtime（保留）

```
plugin:hide
  → coordinator.hideRuntime(runtimeId)
    → runtimeManager.detachFromHost(runtimeId)      // 发 plugin:out { reason: 'hide' }
```

#### 销毁 Runtime

```
plugin:destroy
  → coordinator.destroyRuntime(runtimeId)
    → if attached: runtimeManager.detachFromHost(runtimeId)
    → runtimeManager.destroy(runtimeId)              // close WebContents + cleanup
                                                     // 发 plugin:out { reason: 'destroy' }
```

### 14.2 原子操作总图

```
┌────────────────────────────────────────────────────────────────────┐
│                        RuntimeCoordinator                          │
│                                                                     │
│  activatePlugin(pluginId, context)     ←── IPC: plugin:exec         │
│  moveToHost(runtimeId, targetType)     ←── IPC: host:switch         │
│  hideRuntime(runtimeId)                ←── IPC: plugin:hide         │
│  destroyRuntime(runtimeId)             ←── IPC: plugin:destroy      │
│  pinRuntime(runtimeId, pin)            ←── IPC: plugin:pin          │
│  showPluginMenu(runtimeId, variant)    ←── IPC: plugin:show-menu    │
│                                                                     │
│  注：IPC handler 仅以此 6 个方法为入口。                            │
│  不提供 IPC handler → RuntimeManager / RuntimeHostRegistry 的直接路径。│
└────────────────────────────────────────────────────────────────────┘
```

---

## 15. 迁移路径

### 15.1 总体策略

分 3 步，每步可独立合入、可回退。每步不破坏现有功能。

### 15.2 Step 1：类型分拆 + 数据模型对齐 + 重命名

**目标**：建立正确的类型分层和命名体系，不改任何运行时行为。

**动作**：
1. 拆 `shared/runtime/types.ts`：保留纯可序列化类型，创建 `host/runtime/types.ts` 含 `PluginRuntime`（Electron 对象）
2. 执行重命名（只改名不改逻辑）：
   - `PluginManager` → `PluginCatalog`
   - `LauncherHost` → `LauncherRuntimeHost`（暂不改 behavior，后续 Step 2 改）
   - `FloatingHost` → `FloatingRuntimeHost`（暂不改 behavior）
   - `WindowManager` `createHost('launcher')` → `createLauncherHost()`, `createHost('floating')` → `createFloatingHost()`（接口改名）
3. 新建 `RuntimeHostRegistry`（包装当前的 host 注册/查询逻辑，从 WindowManager 抽取）
4. 更新所有 import/export

**不改的**：`attachToWindow`/`detachFromWindow` 等方法的内部行为。所有 IPC handler 不变。

**改动量**：2 个新文件 + 6-8 个修改，~100 行。

**验证**：现有 plugin open/detach/hide/destroy 流程完全不受影响。

### 15.3 Step 2：RuntimeHost 精确化 + WindowManager 收窄

**目标**：让 `RuntimeHost` 接口真正可多态调用，能力接口落地。

**涉及文件**：

| 文件 | 改动 |
|------|------|
| `host/src/window/hosts/launcher-runtime-host.ts` | 构造时注入 `WindowManager`；`attach`/`detach` 做实际 view 操作 |
| `host/src/window/hosts/floating-runtime-host.ts` | `attach(runtime)` 签名去掉 `view?`；`detach` 只移除 view 不关窗口；实现 `Focusable`/`Pinnable`/`Closable` |
| `host/src/window/window-manager.ts` | 移走 host 工厂/注册表到 `RuntimeHostRegistry`；`attachPluginView`/`detachPluginView` → `addChildView`/`removeChildView`；移除 `pluginView` 字段 |
| `host/src/window/runtime-host-registry.ts` | 新文件（Step 1 已建，Step 2 完善逻辑） |
| `host/src/runtime/runtime-manager.ts` | `attachToWindow` → `attachToHost`（内部调 `host.attach`）；`detachFromWindow` → `detachFromHost`（内部调 `host.detach`）；移除 `matchPluginFeatures` |
| `host/src/plugins/plugin-catalog.ts` | 移入 `matchFeatures()` |
| `host/src/persistence/store.ts` | 从 `plugins/` 移入（Step 1 可做） |

**改动量**：6 个文件，~200 行修改。

**关键验证点**：`RuntimeManager.attachToHost` 不再直接调用 `windowManager.attachPluginView`，而是通过 `host.attach(runtime)` 间接操作。三大流程（打开/隐藏/分离）必须回归。

### 15.4 Step 3：引入 RuntimeCoordinator + IPC 归一

**目标**：所有业务流经 `RuntimeCoordinator`，IPC handler 只调 `RuntimeCoordinator` 方法。

**涉及文件**：

| 文件 | 改动 |
|------|------|
| `host/src/runtime/runtime-coordinator.ts` | **新建** |
| `host/src/index.ts` | 导出 `RuntimeCoordinator` |
| `host/src/ipc/register-handlers.ts` | 所有 plugin/host IPC handler 改为调 `RuntimeCoordinator` 方法 |
| `host/src/ipc/execute-action.ts` | `plugin.open` 处理移到 RuntimeCoordinator |
| `shared/src/ipc/contract.ts` | 补精确类型 + `PluginOutPayload` |
| `shared/src/ipc/channels.ts` | 补 `PLUGIN_OUT` |
| `apps/desktop/src/main/index.ts` | 创建 `RuntimeCoordinator` 实例，注入给 `registerIpcHandlers` |
| `apps/desktop/src/preload/api/plugin-lifecycle.ts` | 暴露 `onPluginOut` |

**改动量**：1 个新文件 + 7 个修改，~200 行新增。

**验证**：所有 6 个插件相关 IPC handler 都通过 `RuntimeCoordinator`。`plugin:out` 事件到达插件。

### 15.5 文件变更清单（新旧对照）

| 旧路径/类名 | 新路径/类名 | Step |
|-----------|-----------|------|
| `packages/host/src/plugins/plugin-manager.ts` (PluginManager) | `packages/host/src/plugins/plugin-catalog.ts` (PluginCatalog) | 1 |
| `packages/host/src/window/hosts/launcher-host.ts` (LauncherHost) | `packages/host/src/window/hosts/launcher-runtime-host.ts` (LauncherRuntimeHost) | 1 |
| `packages/host/src/window/hosts/floating-host.ts` (FloatingHost) | `packages/host/src/window/hosts/floating-runtime-host.ts` (FloatingRuntimeHost) | 1 |
| `packages/host/src/window/window-manager.ts` (createHost) | `packages/host/src/window/runtime-host-registry.ts` (RuntimeHostRegistry) 从 WindowManager 抽离 | 1 |
| `packages/host/src/plugins/store.ts` | `packages/host/src/persistence/store.ts` | 1 |
| `packages/host/src/runtime/runtime-manager.ts` | 同名，职责收窄 | 2 |
| 无 | `packages/host/src/runtime/runtime-coordinator.ts` (RuntimeCoordinator) | 3 |

### 15.6 回退策略

每一步的改动独立可回退：

- **Step 1**（类型分拆 + 重命名）：纯新增 + 重命名，不改行为。回退只需恢复旧 import 路径。
- **Step 2**（Host 精确化）：如果 `host.attach` 流程有问题，`RuntimeManager.attachToHost` 可以直接调 `WindowManager.addChildView` 作为紧急旁路。
- **Step 3**（RuntimeCoordinator）：如果 Coordinator 有 bug，IPC handler 可以短期直接调 RuntimeManager/WindowManager 的方法。

---

## 16. 不做的事（显式排除）

| 事项 | 排除原因 | 应该什么时候做 |
|------|---------|-------------|
| `Suspended` 状态实现 | 当前无预热池需求，添加后需处理 WebContents 暂停/恢复逻辑 | 需要 LRU 缓存/资源回收时 |
| 预热池（warmup pool） | 当前 `startAll()` 全量创建足够用 | 插件数超过 20 或冷启动超 300ms 时 |
| `install`/`uninstall`/`update` | 插件市场功能未开启 | 开始做插件市场时 |
| Sandbox 运行模式 | MVP 只用 `compat` | 插件市场上线前 |
| 多实例插件（`single: false`） | 当前所有插件都是单例，多实例会需要 instance 管理 | 第一个非单例插件出现时 |
| MatchCommand 类型支持（regex/over/files/img/window） | 是搜索匹配特性，不是运行时能力 | 需要高级匹配时 |
| `plugin.runCommand` action | 不清楚使用场景 | 有明确 consumer 时 |
| 测试框架 | 是基础设施，不影响抽象设计 | 独立任务，随时可开始 |
| `PluginScene` 空 div | 属于 UI 层，不影响底层能力抽象 | 和 UI 迭代一起做 |
| 插件崩溃检测/恢复 | 当前进程模型天然隔离，不需要额外机制 | 需要用户反馈时 |

---

## 附录 A：V1 → V3 修正记录

| V1 的问题 | V2 的修正 | V3 (本次) 的修正 |
|-----------|----------|-----------------|
| `PluginRuntime` 含 `WebContentsView` 在 shared 包 | 拆为 `shared.RuntimeInfo`（可序列化）+ `host.PluginRuntime`（含 Electron 类型） | 同上，保持不变 |
| Step 1 改了 Host 行为但 callsite 未同步 | Step 1 只做类型分拆，不改任何行为；Host 签名修正在 Step 2 | 同上，+ 重命名也放 Step 1 |
| 状态机线性有竞争条件 | 拆为 `loadState` + `mountState` 两条正交轴 | 同上 |
| Orchestrator 是"可选语法糖" | Orchestrator 是 IPC handler 强制入口 | 同上，按新命名调整 |
| `Host` 接口只有 `attach/detach`，能力靠 `instanceof` | 引入 `Focusable`/`Pinnable`/`Closable` 能力接口 | 同上 |
| `switchHost` 通知插件 `plugin:out` | 只通知宿主 UI，不通知插件 | 同上，方法名 `moveToHost` |
| LauncherHost 没有单例保证 | `getOrCreateLauncherHost()` 返回单例 | 同上，`RuntimeHostRegistry` 持有 |
| `featureExplain` 作为 runtime metadata | 作为 `ActivationContext` 字段 | 同上 |
| 命名体系不统一 | - | 全量改名：`PluginCatalog`、`RuntimeHost`、`RuntimeCoordinator`、`RuntimeHostRegistry` |
| Host 注册混在 WindowManager | - | 抽取 `RuntimeHostRegistry` 独立类 |
