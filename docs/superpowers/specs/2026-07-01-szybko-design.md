# Szybko — 类 uTools 生产力启动器设计文档

> 日期: 2026-07-01
> 状态: 设计阶段

---

## 1. 项目概述

Szybko（波兰语"快速"之意）是一个跨平台桌面生产力启动器，灵感来自 uTools / Alfred / Raycast。
通过 Alt+Space 快速唤出搜索框，用户可启动应用、搜索文件、操作剪贴板，并通过插件系统扩展无限能力。

### 核心原则

- **极速** — 搜索框毫秒级响应，系统操作流畅不卡顿
- **可扩展** — 插件系统为核心，所有功能均可通过插件添加
- **跨平台适配** — 优先 macOS，通过适配器模式支持 Windows / Linux
- **AI 原生开发** — 整个项目通过 AI 辅助编程构建

---

## 2. 技术选型

| 层 | 技术 | 说明 |
|---|---|---|
| 宿主框架 | Electron | 跨平台桌面应用容器 |
| 系统核心 | Rust (napi-rs) | 编译为 `.node` 原生模块，处理性能敏感的系统调用 |
| 前端 UI | React | 搜索框、设置页面、插件商店 UI |
| 项目组织 | Monorepo (pnpm workspace) | 统一管理所有包，共享配置 |
| 构建工具 | Turborepo (可选) | 加速 monorepo 构建 |
| 打包 | electron-builder | 应用分发与自动更新 |

---

## 3. 架构设计

### 3.1 系统分层

```
┌─────────────────────────────────────────────────────────┐
│                    插件层 (Sandbox WebView)                │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐│
│  │ file-search    │  │ translate      │  │ 计算器       ││
│  │ manifest.json  │  │ manifest.json  │  │ manifest.json││
│  │ index.html     │  │ index.html     │  │ index.html   ││
│  │ preload.js     │  │ preload.js     │  │ preload.js   ││
│  └───────┬────────┘  └───────┬────────┘  └──────┬───────┘│
├──────────┴──────────────────┴───────────────────┴────────┤
│              IPC 桥接 (Electron contextBridge)              │
├──────────────────────────────────────────────────────────┤
│        Electron 主进程 (TypeScript)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ 窗口管理  │ │ 插件加载器 │ │ 插件商店  │ │ 自动更新   │ │
│  │ 快捷键    │ │ 生命周期  │ │ 客户端   │ │            │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
├──────────────────────────────────────────────────────────┤
│    系统能力适配器接口层 (TypeScript Interface)              │
│  IFileSystem | IClipboard | IProcess | IWindow | ...    │
├──────┬───────────────────────────────────────────────────┤
│      │  napi-rs 桥接层                                    │
├──────┴───────────────────────────────────────────────────┤
│              Rust 核心 (napi-rs .node 模块)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ 文件索引   │ │ 模糊搜索  │ │ 剪贴板监控 │ │ 全局快捷键  ││
│  │ macOS     │ │ macOS    │ │ macOS    │ │ macOS      │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 3.2 技术边界

| 职责 | 分配给 |
|---|---|
| 窗口管理、渲染进程 | Electron 主进程 (TS) |
| 搜索框 UI、设置 UI | React (渲染进程) |
| 插件加载、生命周期、权限管理 | Electron 主进程 (TS) |
| 文件索引与全文搜索 | Rust (napi-rs) |
| 模糊搜索引擎 | Rust (napi-rs) |
| 剪贴板监控与历史 | Rust (napi-rs) |
| 全局快捷键注册 | Rust (napi-rs) |
| 屏幕截图 / 颜色拾取 | Rust (napi-rs) |
| 进程 / 应用管理 | Rust (napi-rs) |
| 插件商店 API 通信 | Electron 主进程 (TS) |
| 本地存储 / 配置管理 | Electron 主进程 (TS) |

---

## 4. 系统能力适配器设计

### 4.1 适配器接口定义

所有适配器接口在 `packages/adapter-interface` 包中以 TypeScript interface 定义：

```typescript
// packages/adapter-interface/src/fs.ts
export interface IFileSystemAdapter {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
  indexDirectory(path: string): Promise<IndexStats>
  watchDirectory(path: string, callback: FileChangeCallback): Promise<WatcherHandle>
  getRecentFiles(count: number): Promise<FileInfo[]>
}

// packages/adapter-interface/src/clipboard.ts
export interface IClipboardAdapter {
  readText(): Promise<string>
  writeText(text: string): Promise<void>
  getHistory(limit?: number): Promise<ClipboardEntry[]>
  startMonitoring(callback: (entry: ClipboardEntry) => void): Promise<void>
  stopMonitoring(): Promise<void>
}

// packages/adapter-interface/src/process.ts
export interface IProcessAdapter {
  launchApp(bundleId: string): Promise<void>
  listRunningApps(): Promise<AppInfo[]>
  getInstalledApps(): Promise<AppInfo[]>
  executeCommand(command: string, args?: string[]): Promise<CommandResult>
}

// packages/adapter-interface/src/window.ts
export interface IWindowAdapter {
  getActiveWindow(): Promise<WindowInfo>
  listWindows(): Promise<WindowInfo[]>
  focusWindow(windowId: string): Promise<void>
  getWindowBounds(windowId: string): Promise<Rect>
}

// packages/adapter-interface/src/globalShortcut.ts
export interface IGlobalShortcutAdapter {
  register(accelerator: string, callback: () => void): Promise<void>
  unregister(accelerator: string): Promise<void>
  unregisterAll(): Promise<void>
}

// packages/adapter-interface/src/image.ts
export interface IImageAdapter {
  captureScreen(): Promise<Buffer>
  pickColor(): Promise<Color>
  getImageInfo(path: string): Promise<ImageInfo>
}

// packages/adapter-interface/src/notification.ts
export interface INotificationAdapter {
  show(title: string, body: string, options?: NotificationOptions): Promise<void>
}

// packages/adapter-interface/src/shell.ts
export interface IShellAdapter {
  openPath(path: string): Promise<void>
  openUrl(url: string): Promise<void>
  showInFinder(path: string): Promise<void>
  trashItem(path: string): Promise<void>
}

// packages/adapter-interface/src/search.ts
export interface ISearchEngine {
  fuzzySearch(query: string, items: IndexedItem[]): Promise<ScoredItem[]>
  buildIndex(items: IndexedItem[]): Promise<SearchIndex>
}
```

### 4.2 适配器注册与获取

```typescript
// 适配器注册中心
class AdapterRegistry {
  register<T>(name: string, adapter: T): void
  get<T>(name: string): T
  getAvailable(): string[]
}

// 使用示例
const fsAdapter = registry.get<IFileSystemAdapter>('filesystem')
const results = await fsAdapter.search('package.json')
```

### 4.3 Rust 实现模式 (napi-rs)

```rust
// packages/core-rust/src/adapters/macos/fs.rs
#[napi]
pub async fn search_files(
  query: String,
  options: SearchOptions,
) -> napi::Result<Vec<SearchResult>> {
  // macOS 原生实现: 使用 MDItem / fsevent / 自定义索引
  // 返回结果由 napi 自动序列化为 JS 对象
}

#[napi(object)]
pub struct SearchResult {
  pub name: String,
  pub path: String,
  pub kind: String,
  pub modified_at: i64,
  pub score: f64,
}
```

---

## 5. 搜索交互设计

### 5.1 搜索模式

采用**直搜模式**（类似 uTools），核心流程：

```
Alt+Space → 弹出搜索框 → 用户输入
    │
    ▼
插件调度器匹配关键词
    │
    ├── 已注册关键词匹配 → 分发到对应插件
    │    例: "file abc" → file-search 插件
    │
    ├── 全量应用搜索 → 匹配本地安装的 App
    │    例: "chrome" → Google Chrome
    │
    └── 系统功能 → 计算器、系统命令等
         例: "1+1" → 2
```

### 5.2 搜索数据流

```
用户输入 "file abc"
    │
    ▼
React 搜索框 UI (防抖 100ms)
    │  IPC → 主进程
    ▼
插件调度器
    │
    ├── 遍历已启用插件，匹配关键词
    │   ("file" → file-search 插件)
    │
    ├── 同时进行系统搜索（应用、计算器等）
    │
    ▼
目标插件 WebView 收到搜索事件
    │  通过 preload API 调系统能力
    ▼
插件执行搜索逻辑
    │  调 system.filesystem.search("abc")
    │  → IPC → Electron 主进程
    │  → napi-rs → Rust 文件索引引擎
    │  → 返回结果
    ▼
插件返回搜索结果
    │  [{title, subtitle, icon, action}]
    ▼
React 搜索框渲染结果列表
    │
用户点击选择
    │
    ▼
插件执行 action（打开文件/复制文本/跳转）
```

---

## 6. 插件系统

### 6.1 插件目录结构

```
szybko/plugins/
├── file-search/
│   ├── manifest.json        # 插件元数据
│   ├── index.html           # 插件 UI 入口
│   ├── preload.js           # 桥接脚本（沙箱环境运行）
│   ├── assets/
│   │   └── icon.png
│   └── package.json         # 开发依赖（可选）
├── translate/
└── calculator/
```

### 6.2 manifest.json 定义

```json
{
  "name": "file-search",
  "title": "文件搜索",
  "version": "1.0.0",
  "description": "快速搜索本地文件",
  "author": "Your Name",
  "icon": "assets/icon.png",
  "main": "index.html",
  "preload": "preload.js",
  "features": [
    {
      "keyword": "file",
      "description": "搜索本地文件",
      "matchType": "prefix"
    },
    {
      "keyword": "find",
      "description": "按内容搜索文件",
      "matchType": "prefix"
    }
  ],
  "permissions": [
    "filesystem:read",
    "filesystem:index"
  ],
  "settings": {
    "maxResults": 20,
    "searchPaths": ["~", "/Users"]
  }
}
```

### 6.3 插件生命周期

```
[安装]
    │  从商店下载 / 手动放入 plugins/ 目录 / 从 npm 安装
    ▼
[注册]
    │  插件加载器读取 manifest.json
    │  注册关键词到调度器
    │  校验请求的权限
    ▼
[休眠] ←──── [激活]
    │          用户输入匹配关键词时
    │          创建 WebView 沙箱
    │          加载 index.html
    │          注入 preload.js (contextBridge API)
    │          调用 onActivate(context)
    ▼
[运行]
    │  接收搜索请求
    │  调用系统能力 API
    │  返回搜索建议
    ▼
[去激活]
    │  搜索框关闭/超时
    │  销毁 WebView 释放资源
    │  保存持久化状态
    ▼
[卸载]
    │  删除插件目录
    │  清除关键词注册
```

### 6.4 插件安全沙箱

- 每个插件运行在独立的 `<webview>` / `BrowserView` 中
- 使用 `contextIsolation: true` + `sandbox: true`
- 通过 `preload.js` 中的 `contextBridge` 暴露有限的 API
- 插件只能调用 `manifest.json` 中 `permissions` 声明的能力
- 不可访问 Node.js 原生 API、文件系统、网络（除非授权）

### 6.5 插件 SDK

```bash
npm create @szybko/plugin my-plugin
cd my-plugin
npm install
npm run dev    # 启动热更新开发环境
```

插件开发代码示例：

```typescript
// preload.js — 在沙箱环境中运行
const { system } = window.__SZYBKO__

// 插件被激活时调用
window.onActivate = async (context: ActivationContext) => {
  const results = await system.filesystem.search(context.query)
  return results.map(r => ({
    id: r.path,
    title: r.name,
    subtitle: r.path,
    icon: r.icon,
    action: () => system.shell.openPath(r.path)
  }))
}

// 插件需要定期执行的操作
window.onBackgroundTask = async () => {
  await system.filesystem.indexDirectory('~/Documents')
}
```

---

## 7. 项目目录结构

```
szybko/
├── package.json              # monorepo root (pnpm workspace)
├── pnpm-workspace.yaml       # workspace 定义
├── turbo.json                # Turborepo 配置
├── tsconfig.json             # 全局 TypeScript 配置
├── .eslintrc.js              # 全局 lint 配置
├── .prettierrc               # 代码格式化
│
├── packages/
│   ├── core-rust/            # Rust 核心能力 (napi-rs)
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── adapters/
│   │   │   │   ├── macos/       # macOS 适配器实现
│   │   │   │   ├── windows/     # 后续实现
│   │   │   │   └── linux/       # 后续实现
│   │   │   ├── search/          # 模糊搜索引擎
│   │   │   ├── clipboard/       # 剪贴板监控
│   │   │   ├── indexing/        # 文件索引
│   │   │   └── shortcut/        # 全局快捷键
│   │   └── build.rs
│   │
│   ├── adapter-interface/   # TS 适配器接口定义
│   │   └── src/
│   │       ├── index.ts
│   │       ├── fs.ts
│   │       ├── clipboard.ts
│   │       ├── process.ts
│   │       ├── window.ts
│   │       ├── shortcut.ts
│   │       ├── image.ts
│   │       ├── notification.ts
│   │       ├── shell.ts
│   │       └── search.ts
│   │
│   ├── host/                # Electron 主进程
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── main.ts           # Electron 入口
│   │   │   ├── window-manager.ts  # 窗口管理
│   │   │   ├── shortcut-manager.ts # 全局快捷键注册
│   │   │   ├── plugin-loader.ts   # 插件加载器
│   │   │   ├── plugin-runtime.ts  # 插件沙箱管理
│   │   │   ├── adapter-bridge.ts  # 适配器桥接 (TS → Rust)
│   │   │   ├── store.ts          # 插件商店客户端
│   │   │   ├── update.ts         # 自动更新
│   │   │   └── config.ts         # 应用配置
│   │   └── tsconfig.json
│   │
│   ├── ui/                  # React UI
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── main.tsx          # 入口
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── SearchBar.tsx       # 搜索框
│   │   │   │   ├── ResultList.tsx      # 结果列表
│   │   │   │   ├── ResultItem.tsx      # 单个结果
│   │   │   │   ├── PluginSettings.tsx  # 插件设置
│   │   │   │   └── StorePanel.tsx      # 插件商店面板
│   │   │   ├── hooks/
│   │   │   │   ├── useSearch.ts
│   │   │   │   ├── useKeyboard.ts
│   │   │   │   └── usePluginIPC.ts
│   │   │   └── styles/
│   │   │       └── global.css
│   │   └── tsconfig.json
│   │
│   ├── plugin-sdk/          # 插件开发者工具包
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── manifest.d.ts
│   │   │   │   ├── api.d.ts
│   │   │   │   └── lifecycle.d.ts
│   │   │   ├── cli.ts            # create-plugin 脚手架
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   │
│   ├── plugin-store/        # 插件商店 API 客户端
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── store-api.ts
│   │       └── types.ts
│   │
│   └── shared/              # 共享类型和工具
│       ├── package.json
│       └── src/
│           ├── types.ts        # 公共类型定义
│           └── utils.ts        # 工具函数
│
├── apps/
│   └── desktop/             # Electron 应用入口/打包
│       ├── package.json
│       ├── electron-builder.yml  # 打包配置
│       └── resources/
│           ├── icon.icns         # macOS 图标
│           └── icon.ico          # Windows 图标
│
├── plugins/                 # 本地开发插件目录
│   └── example-plugin/
│       ├── manifest.json
│       ├── index.html
│       └── preload.js
│
└── docs/
    ├── superpowers/
    │   └── specs/
    │       └── 2026-07-01-szybko-design.md
    ├── plugin-dev.md        # 插件开发文档
    └── architecture.md      # 架构详解
```

---

## 8. 数据流设计

### 8.1 搜索请求流

```
[React 搜索框] 用户输入 "file abc"
    │  防抖 100ms
    ▼
[IPC] 主进程
    │
    ├─▶ [插件调度器]
    │       匹配关键词 "file" → file-search 插件
    │       检查插件是否已激活 → 否 → 激活插件
    │
    └─▶ [系统搜索]
            搜索已安装应用
            内置计算器
    等待所有搜索结果
    │
    ▼
[IPC] 返回合并结果到渲染进程
    │
    ▼
[React 搜索框] 渲染结果列表
```

### 8.2 插件通信流

```
[插件 WebView]
    │  preload.js 中的 __SZYBKO__ API
    ▼
[contextBridge]
    │  Electron IPC
    ▼
[主进程 PluginRuntime]
    │  权限校验 → 通过
    ▼
[AdapterRegistry.get('filesystem')]
    │
    ├─▶ [TS 适配器实现] → 调用 napi-rs 导出的 Rust 函数
    │                    → Rust 执行 macOS 系统调用
    │                    → 返回结果
    │
    └─▶ 日志记录、性能统计
```

---

## 9. 错误处理策略

### 9.1 层级错误处理

| 层级 | 策略 |
|---|---|
| Rust 核心 | 使用 Result 类型，错误通过 napi 转换为 JS Error |
| 适配器桥接 | 捕获所有 Rust 错误，包装为 AdapterError |
| 插件沙箱 | 插件崩溃不影响主进程，仅丢弃该插件结果并通知用户 |
| 主进程 | 全局异常捕获，重试或降级 |
| UI | 错误边界 (ErrorBoundary)，显示友好提示 |

### 9.2 插件错误隔离

```
插件 WebView 崩溃 → 主进程收到 'crashed' 事件
    → 记录日志
    → 重新创建 WebView（可选）
    → 向用户显示"插件 x 出现错误"

插件死循环 → 主进程设置超时（默认 5s）
    → 超时未响应 → 销毁 WebView
    → 显示"插件 x 无响应"
```

---

## 10. 性能目标

| 指标 | 目标 |
|---|---|
| 搜索框呼出 | < 200ms |
| 第一次搜索结果展示 | < 100ms |
| 文件索引 10 万文件 | < 30s（后台） |
| 应用启动时间 | < 3s |
| 插件激活 | < 500ms |
| 内存占用（空闲） | < 200MB |
| 打包体积 | < 100MB |

---

## 11. 开发计划建议

### Phase 1: 核心框架
- Monorepo 初始化（pnpm workspace）
- Rust 核心模块 (napi-rs) 搭建
- Electron 主进程 + 搜索框 UI
- 适配器接口定义 + macOS 文件搜索实现
- 基本搜索交互闭环

### Phase 2: 插件系统
- 插件加载器 + 沙箱 WebView
- 插件生命周期管理
- 插件 SDK 脚手架
- 1-2 个内置插件（计算器、应用启动器）

### Phase 3: 系统能力完善
- 剪贴板监控与历史
- 全局快捷键
- 屏幕取色
- 模糊搜索引擎

### Phase 4: 插件商店
- 商店后端 / 用 npm registry
- 客户端商店界面
- 插件安装/更新/卸载

### Phase 5: 跨平台适配
- Windows 适配器实现
- Linux 适配器实现
- 平台特性调试

---

## 12. 待决策项

- [ ] 插件商店使用 npm registry 还是自建 registry
- [ ] Rust 文件索引引擎的具体方案（自定义 SQLite FTS / Tantivy / macOS SpotLight 包装）
- [ ] 搜索框 UI 设计细节（主题、字号、布局）
- [ ] 应用自动更新机制
- [ ] 是否使用 Turborepo
- [ ] CI/CD 流水线配置
- [x] ✅ 技术栈: Electron + Rust(napi-rs) + React + Monorepo pnpm
- [x] ✅ 插件模型: sandbox WebView + manifest.json + 关键词直搜
- [x] ✅ 系统能力: 适配器模式，macOS 优先

---

## 13. 附录

### 相关项目参考
- [uTools](https://u.tools) — 插件化桌面启动器
- [Raycast](https://raycast.com) — macOS 生产力工具
- [Alfred](https://alfredapp.com) — macOS 工作流启动器
- [napi-rs](https://napi.rs) — 用 Rust 构建 Node.js 原生模块
