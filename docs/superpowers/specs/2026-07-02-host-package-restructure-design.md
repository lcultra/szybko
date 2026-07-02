# @szybko/host 目录重构设计

- **日期**: 2026-07-02
- **状态**: 设计稿
- **涉及包**: `packages/host`

---

## 1. 动机

当前 `packages/host/src/` 采用平铺布局，12 个模块文件 + 1 个 `hosts/` 子目录混在 `src/` 下。
随着项目推进，文件数只会增长，平铺的可维护性开始下降。

**问题清单：**

1. **凝聚力（Cohesion）被文件系统隐藏** — 有明确内部依赖关系的模块群（plugin 链：loader→registry→store）在目录上没有体现，开发者需要从 import 反推结构
2. **`ipc-handlers.ts` 膨胀至 273 行** — 接近 blueprint 设定的 300 行拆分阈值，且混合了 IPC 注册、搜索业务、动作执行三件事
3. **`store.ts` 命名模糊** — 全局叫 "Store" 在项目中容易与 zustand store 混淆，实际只被 plugin-registry 使用
4. **未来扩展未预留空间** — runtime-pool、host-factory、更多 Host 类型已在 roadmap 上，平铺会让文件数轻松突破 20

---

## 2. 目标

- 纯**文件组织重构**，不改运行时行为
- 按**领域（Domain）** 分组，不按层（Layer）分组
- 当前 14 个文件重排后保持 14 个文件（ipc 域内从 1 文件拆为 3），总文件数 16
- 不在本次范围内：runtime-pool、host-factory 等新功能

---

## 3. 设计方案

### 3.1 最终目录结构

```
packages/host/src/
├── index.ts                      # barrel
├── plugins/                      # 插件发现与注册
│   ├── plugin-loader.ts          # 读 plugin.json
│   ├── plugin-registry.ts        # 持久化注册表
│   ├── plugin-manager.ts         # 编排
│   └── store.ts                  # lowdb 持久化封装
├── runtime/                      # Runtime 生命周期
│   └── runtime-manager.ts        # 创建/销毁/attach/detach
├── window/                       # 窗口与 Host
│   ├── window-manager.ts         # BrowserWindow 管理
│   ├── hosts/
│   │   ├── launcher-host.ts      # LauncherHost 实现
│   │   └── floating-host.ts      # FloatingHost 实现
│   ├── shortcut-manager.ts       # 全局快捷键
│   └── theme.ts                  # 主题检测
├── ipc/                          # IPC 通信层
│   ├── register-handlers.ts      # IPC 注册薄层
│   ├── builtin-search.ts         # 内置搜索业务
│   └── execute-action.ts         # 动作执行
└── services/                     # 独立基础服务
    ├── adapter-bridge.ts         # TS → Rust 桥接
    └── config-manager.ts         # 用户配置管理
```

### 3.2 迁移操作

#### 纯迁移（10 个文件，零逻辑变化）

| 源路径 | 目标路径 | 影响范围 |
|---|---|---|
| `src/plugin-loader.ts` | `src/plugins/plugin-loader.ts` | `index.ts` barrel |
| `src/plugin-registry.ts` | `src/plugins/plugin-registry.ts` | `index.ts`, `plugin-manager.ts` |
| `src/plugin-manager.ts` | `src/plugins/plugin-manager.ts` | `index.ts`, `runtime-manager.ts` |
| `src/store.ts` | `src/plugins/store.ts` | `index.ts`, `plugin-registry.ts` |
| `src/runtime-manager.ts` | `src/runtime/runtime-manager.ts` | `index.ts`, `ipc-handlers.ts` |
| `src/window-manager.ts` | `src/window/window-manager.ts` | `index.ts`, `runtime-manager.ts`, `shortcut-manager.ts`, `ipc-handlers.ts` |
| `src/shortcut-manager.ts` | `src/window/shortcut-manager.ts` | `index.ts` |
| `src/theme.ts` | `src/window/theme.ts` | `index.ts` |
| `src/adapter-bridge.ts` | `src/services/adapter-bridge.ts` | `index.ts` |
| `src/config-manager.ts` | `src/services/config-manager.ts` | `index.ts` |

#### 目录迁移（1 个目录）

| 源路径 | 目标路径 | 影响范围 |
|---|---|---|
| `src/hosts/` | `src/window/hosts/` | `index.ts`, `window-manager.ts` |

#### 拆分操作（1 个文件拆为 3）

| 源文件 | 目标文件 | 提取内容 |
|---|---|---|
| `src/ipc-handlers.ts` | `src/ipc/builtin-search.ts` | `calculate()`, `STATIC_APPS`, `SOURCES`, `runBuiltinSearch()` |
| | `src/ipc/execute-action.ts` | `executeAction()` |
| | `src/ipc/register-handlers.ts` | `registerIpcHandlers()`, `notifyShowMainWindow()` |

#### barrel 更新

`src/index.ts` 所有 re-export 路径更新为新的相对路径。

### 3.3 `ipc/` 拆分细节

#### `ipc/builtin-search.ts`

```typescript
// 职责：内置搜索来源（计算器 + 快速应用列表）
// 依赖：@szybko/shared（SearchResult 类型）
// 无 Electron 依赖，可独立测试

export function runBuiltinSearch(query: string): SearchResult[]
// 内部包含 calculate(), STATIC_APPS, SOURCES
```

#### `ipc/execute-action.ts`

```typescript
// 职责：统一动作执行 dispatch
// 依赖：@szybko/shared（ActionDescriptor 类型）, electron（shell/clipboard/exec）
// 无 ipcMain 依赖，可独立测试

export function executeAction(action: ActionDescriptor): { ok: boolean; error?: string }
```

#### `ipc/register-handlers.ts`

```typescript
// 职责：IPC 注册薄层 — 导入业务函数，注册 ipcMain.handle/on
// 依赖：WindowManager, RuntimeManager（构造函数注入）

export function registerIpcHandlers(windowManager: WindowManager, runtimeManager?: RuntimeManager)
export function notifyShowMainWindow(win: BrowserWindow)
```

---

## 4. 不在此范围

- runtime-pool（预热/LRU）
- host-factory 工厂模式
- 新增 Host 类型（SidebarHost / DockHost）
- 任何功能新增或行为变更

---

## 5. 影响分析

### 正向影响

- **结构即语义** — 域名（plugins/、window/、ipc/）直接说明文件职责
- **测试边界清晰** — `builtin-search.ts` 和 `execute-action.ts` 可脱离 Electron 测试
- **扩展有位置** — 后续 runtime-pool 放在 `runtime/runtime-pool.ts`，host-factory 放在 `window/host-factory.ts`
- **降低认知负荷** — 新开发者看到目录结构就理解 host 包的职责划分

### 风险

- 可能影响外部 consumer 的直接引用路径（目前所有引用都通过 barrel `index.ts`，风险极低）
- git 历史中文件移动后 `git log --follow` 仍可追溯

### 回滚方案

如果迁移后发现 import 错误，所有文件可原路移回。纯文件移动操作，无状态迁移。

---

## 6. 实施步骤

1. 创建新目录结构
2. 移动 10 个纯迁移文件 + 1 个目录
3. 拆分 `ipc-handlers.ts` 为 3 个文件
4. 更新 `index.ts` barrel 路径
5. TypeScript 类型检查通过
6. `pnpm dev` 启动验证
