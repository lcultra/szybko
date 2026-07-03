# Architecture Foundation Overhaul

> 解决当前架构中 10 个已知问题，建立可长期进化的基线。

**状态：设计定稿**

---

## 背景

上一轮重构（schema v2 search + RuntimeManager 分解 + SearchService 抽取）完成后，代码库在结构上已有改善，但仍有 10 个遗留问题。

这些问题按影响面分四个象限：

### P0 — 质量门禁（阻断基线化）

**问题 1：typecheck/lint 未通过**

Shell.tsx:28 把函数式 updater `(i) => Math.max(0, i - 1)` 传给只接受 `number` 的 `setSelectedIndex`。pnpm lint 有 5 个 import-order 错误。

当前这版不能作为稳定基线继续演进。必须先修门禁。

**问题 2：PluginCatalog 仍在扫描时改用户状态**

`plugin-catalog.ts:30` 自动重新启用已禁用插件，`:37` 因磁盘缺失禁用插件。"用户偏好"和"磁盘可见性"互相覆盖。建议把 registry reconciliation 单独建模，扫描不要直接决定 enabled。

### P1 — 架构深化

**问题 3：Floating host 元信息抽象不够**

`floating-runtime-host.ts:66` query 里的 `pluginId` 实际填了 `runtimeId`。根因是 `HostMeta` 只有 `runtimeId/pluginName`，不够表达 floating 页面初始化需要。

建议统一用可序列化的 `RuntimeSlot` snapshot，而非 URL query 临时拼字段。

**问题 4：RuntimeManager 仍然偏重**

`runtime-manager.ts:39` 仍负责：创建 WebContentsView、加载 URL、处理快捷键、维护 hostMap、发布 shell 状态、从 manifest 推展示名。建议拆 runtime factory、state publisher、host attachment。

**问题 5：Capability 模型还是半抽象**

`runtime-coordinator.ts:80` 用 `'close' in host`，pin 用 `'setAlwaysOnTop' in host`。仍是运行时探测。建议定义明确 type guard 或 capability registry。

### P2 — 协议和 SDK

**问题 6：插件 API / Shell 内部 API 边界仍混**

`host.ts:22` 在 shell 页面也暴露 `window.szybko`，Shell 仍通过插件 API 执行动作。Shell 应该只走 internal API。

**问题 7：协议字段漂移未被类型兜住**

`contract.ts:71` PluginEnterPayload 字段是 `code`，但 `launcher/index.html:10` 读 `payload.featureCode`。`api/plugin.ts:11` callback 仍是 `unknown`。

**问题 8：SDK 承诺面过宽**

`plugin-sdk/src/types/api.d.ts` 还是完整 uTools 风格接口和大量 `any`，实际平台 API 没实现这些承诺。

### P3 — 基础设施

**问题 9：持久化迁移机制仍缺**

`platform-database.ts:23` 启动时手写建表，schema 后续升级不可审计。

**问题 10：原生能力直接在 action switch 里执行**

`execute-action.ts:5` 直接调用 Electron shell/clipboard/exec。权限、审计、平台差异无 adapter 边界。

---

## 设计

### 1. 质量门禁修复

#### 1.1 Shell.tsx 类型错误

`setSelectedIndex`（Zustand action，签名 `(index: number) => void`）被传入函数式 updater。修改为直接传值：

```typescript
// 前
onSelectUp: () => setSelectedIndex(i => Math.max(0, i - 1)),
onSelectDown: () => setSelectedIndex(i => Math.min(results.length - 1, i + 1)),

// 后
onSelectUp: () => setSelectedIndex(Math.max(0, selectedIndex - 1)),
onSelectDown: () => setSelectedIndex(Math.min(results.length - 1, selectedIndex + 1)),
```

#### 1.2 import-order lint 错误

运行 `pnpm lint --fix`，如果自动修复后仍有残留，手动调整。

#### 1.3 基线门禁配置

在 `package.json` 建立 `check` script：`pnpm typecheck && pnpm lint`，CI 入口用此命令。

### 2. PluginCatalog 不碰用户状态

#### 当前问题

`init()` 做了三件事且混在一起：
1. 扫描磁盘 → 发现插件列表
2. 自动注册未安装的、自动启用已禁用的
3. 自动禁用磁盘缺失的

步骤 2 和 3 改写了用户偏好的 enabled 状态。

#### 方案

将"安装状态同步"从 PluginCatalog 中拆出，放入独立的 **InstallationSynchronizer**：

```
PluginDiscovery.scan()        → PluginInfo[]
InstallationSynchronizer.sync(discovered, existing) → ReconciliationPlan
PluginCatalog.init()
  ├─ discovered = discovery.scan()
  ├─ plan = synchronizer.sync(discovered, repos)
  ├─ plan.apply(repos)        // 只处理"新增"和"真的是错误或残留"的情况
  └─ cache = discovered
```

关键变化：扫描不再自动 `setEnabled`。"插件被禁用"是用户偏好，不被磁盘可见性覆盖。磁盘缺失的插件保持 enabled 状态（persisted 在 DB），只是 `getEnabled()` 时过滤掉 `get() === undefined` 的项。

`InstallationSynchronizer` 的逻辑：
- 磁盘发现但 DB 没有 → **register**（新安装）
- DB 有且 enabled，但磁盘没有 → **保持 enabled，但 getEnabled() 不返回它**（暂时的离线）
- DB 有且 disabled → **不动**（用户选择）
- 磁盘发现且 DB 有且 disabled → **不动**（用户选择）

### 3. Floating 页面元信息

#### 当前问题

`HostMeta` 只有 `{ runtimeId, pluginName }`，floating 页面还需要 `pluginId` 和 `featureExplain`。结果 `floating-runtime-host.ts:66` 把 runtimeId 填进了 URL query 的 pluginId 字段。

#### 方案

**用 `RuntimeSlot` 替代 URL query 拼字段。**

`RuntimeSlot` 已经是前端的类型（`packages/shell/src/types/index.ts`），包含 `runtimeId`, `pluginId`, `pluginName`, `featureExplain`, `loadState`, `mountState`。

FloatingRuntimeHost 在创建窗口时，把 `RuntimeSlot` 序列化到 URL query 的单个 `slot` 参数（`encodeURIComponent(JSON.stringify(slot))`）。

FloatingApp 初始化时反序列化 `slot` 参数，直接填充 `useRuntimeStore`。

这样：
- 不再有字段错位（runtimeId 填成 pluginId）
- 加了新字段不需要改 URL query 参数名
- 前后端共享同一个类型定义

#### HostMeta 扩展

`HostMeta` 增加 `pluginId` 和 `featureExplain` 可选字段，由 RuntimeManager 在 attach 时提供。

### 4. RuntimeManager 进一步拆分

#### 当前痛点

`RuntimeManager` 仍做 5 件事：
1. 创建 WebContentsView（生命周期）
2. 加载插件 URL（URL 解析）
3. 维护快捷键回调（事件处理）
4. 维护 hostMap（宿主映射）
5. 发布 shell 状态（UI 通信）

#### 方案

拆成 4 个模块，RuntimeManager 只做编排：

```
RuntimeManager (编排)
  ├─ RuntimeViewFactory      — 创建 WebContentsView + 加载 URL
  ├─ RuntimeHostAttacher     — hostMap 管理 + attach/detach
  ├─ RuntimeStatePublisher   — 发布 PLUGIN_RUNTIME_STATE
  └─ 键盘快捷键              — 保留在 RuntimeManager 作为委托回调
```

**RuntimeViewFactory**
```typescript
class RuntimeViewFactory {
    create(plugin: PluginInfo): { view: WebContentsView; runtimeId: string };
    loadUrl(view: WebContentsView, plugin: PluginInfo): void;
}
```

**RuntimeHostAttacher**
```typescript
class RuntimeHostAttacher {
    private hostMap: Map<string, RuntimeHost>;
    attach(runtimeId, host, view, meta): void;
    detach(runtimeId): RuntimeHost | null;
    getHostFor(runtimeId): RuntimeHost | null;
}
```

**RuntimeStatePublisher**
```typescript
class RuntimeStatePublisher {
    constructor(private windowManager: WindowManager);
    publish(runtimeId, pluginId, pluginName, featureExplain, mountState, loadState): void;
}
```

RuntimeManager 只保留：`entries` Map、`create()` 调用工厂、`attachToHost()` 委托给 attacher、`publishState()` 委托给 publisher。

### 5. Capability 模型

#### 当前问题

`runtime-coordinator.ts` 用 `'close' in host` 和 `'setAlwaysOnTop' in host` 做运行时探测。能力检查散在 coordinator 中。

#### 方案

定义 type guard 函数，集中管理 host 能力判断：

```typescript
// packages/host/src/window/hosts/capabilities.ts (扩展)
import type { Closable, Focusable, Pinnable } from './capabilities';
import type { RuntimeHost } from './runtime-host';

export function isClosable(host: RuntimeHost): host is RuntimeHost & Closable {
    return 'close' in host;
}

export function isPinnable(host: RuntimeHost): host is RuntimeHost & Pinnable {
    return 'setAlwaysOnTop' in host;
}

export function isFocusable(host: RuntimeHost): host is RuntimeHost & Focusable {
    return 'focus' in host;
}
```

Coordinator 中：
```typescript
if (isClosable(host)) host.close();
if (isPinnable(host)) host.setAlwaysOnTop(pin);
```

这比 `'close' in host` 好在：
- 类型推导自动 narrowing
- 集中在 capabilities.ts 里，改能力模型只改一个文件
- 可以加文档注释

### 6. 插件 API / Shell 内部 API 边界

#### 当前问题

`host.ts`（主窗口 preload）同时暴露 `window.szybko`（插件 API）和 `window.szybkoInternal`（内部 API）。Shell 代码在 `Shell.tsx:36` 调用 `window.szybko?.execute(action)` 执行动作，应该用 `window.szybkoInternal`。

#### 方案

**收紧：Shell 只走 internal API。**

1. 把 `execute` 加入 `SzybkoInternalApi`（或已有的 search/window/theme 同级）
2. Shell.tsx 改为 `window.szybkoInternal?.execute(action)`
3. `window.szybko` 仅在插件 preload（`plugin.ts`）中暴露
4. `host.ts` 不再暴露 `window.szybko`

这样：
- 主窗口 preload 只给 shell 用，不暴露插件能力
- 插件 preload 只给插件用，不暴露平台内部能力
- 权限边界清晰

### 7. 协议字段漂移

#### 当前问题

- `PluginEnterPayload.code` 是标准字段名
- `launcher/index.html` 读 `payload.featureCode`
- `api/plugin.ts:onPluginEnter` callback 是 `unknown`

#### 方案

1. 修复内置插件：launcher 插件改为读 `payload.code`
2. `onPluginEnter` callback 类型从 `unknown` 改为 `PluginEnterPayload`
3. 运行时发送 `PluginEnterPayload` 时确认字段名一致

这样编译器就能兜住字段名变更。

### 8. SDK 承诺面收窄

#### 当前问题

`plugin-sdk/src/types/api.d.ts` 暴露完整的 uTools 兼容接口（~30 个方法 + DB API），但实际平台 API 只实现了 `execute`/`onPluginEnter`/`onPluginOut` 等几个。

#### 方案

SDK 先只导出当前稳定的 Szybko 契约：

```typescript
// types/api.d.ts → 精简为当前实现的 API
export interface SzybkoPluginSDK {
    // 已实现的
    execute: (action: ActionDescriptor) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
    switchHost: (runtimeId: string, targetHost: 'launcher' | 'floating') => Promise<...>;
    setFeature: (feature: PluginFeature) => Promise<...>;
    getFeatures: (codes?: string[]) => Promise<PluginFeature[]>;
    removeFeature: (code: string) => Promise<...>;
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
    onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;
}
```

uTools 兼容接口单独放 `compat/utools.ts`，不污染主 SDK 导出。

### 9. 持久化迁移机制

#### 当前问题

`platform-database.ts` 启动时 `sqlite.exec(CREATE TABLE IF NOT EXISTS ...)` 手写建表。schema 升级不可审计，不可回滚。

#### 方案

引入版本化 migrations 目录：

```
packages/host/src/persistence/migrations/
  001_create_initial_tables.sql
  002_add_command_trigger_search.sql
  ...
```

`PlatformDatabase` 启动时：
1. 查询 `_migrations` 表（记录已执行的 migration）
2. 按序执行未应用的 migration
3. 记录执行结果和 hash

Migration 文件是纯 SQL，每条对应一个版本。初始 migration 为当前 DDL。

### 10. 原生能力 Adapter

#### 当前问题

`execute-action.ts` 的 `switch` 直接调用 `electron.shell`/`clipboard`/`exec`。没有权限层，没有平台适配层，没有审计。

#### 方案

定义 `NativeCapabilityService` 接口：

```typescript
interface NativeCapabilityService {
    openPath(path: string): Promise<void>;
    openUrl(url: string): Promise<void>;
    writeClipboard(text: string): Promise<void>;
    launchApp(bundleId: string): Promise<void>;
}
```

`execute-action.ts` 调用 service 而非直接使用 Electron API。初始实现 `ElectronNativeCapabilityService` 封装现有 Electron 调用。

后续可以加：
- `AuditLoggingDecorator` — 记录调用
- `PermissionGuardDecorator` — 检查权限
- `PlatformAdapter` — 跨平台差异

---

## 架构变更总结

| 模块 | 当前状态 | 目标状态 |
|------|---------|---------|
| PluginCatalog | 扫描+注册+启用+禁用耦合 | 扫描+同步分离，sync 尊重用户偏好 |
| Floating host meta | URL query 手拼字段，已有错位 | RuntimeSlot 序列化，类型安全 |
| RuntimeManager | 5 职合一 | 编排 3 个独立模块 |
| Capability 检查 | `'close' in host` 散落 | type guard 集中管理 |
| Host preload | 暴露双重 API | 只暴露 internal API |
| SDK 导出 | uTools 兼容接口 + any | 当前稳定契约 |
| DB 迁移 | CREATE TABLE IF NOT EXISTS | 版本化 migration |
| 原生能力 | 直接调用 Electron | NativeCapabilityService |

---

## 执行顺序

1. **P0 质量门禁** — 修 typecheck + lint → 建立 `check` script
2. **协议修复** — featureCode → code + callback 类型 → SDK 收窄
3. **PluginCatalog** — 拆分 InstallationSynchronizer
4. **Floating host meta** — RuntimeSlot 序列化 + HostMeta 扩展
5. **RuntimeManager** — 拆分 RuntimeViewFactory / RuntimeHostAttacher / RuntimeStatePublisher
6. **Capability type guard** — 集中能力检查
7. **API 边界** — execute 移入 internal API
8. **DB migrations** — 初始 migration 框架
9. **Native capability** — NativeCapabilityService 接口 + 基本实现

前 4 个任务独立，可以并行；后 5 个有依赖关系。
