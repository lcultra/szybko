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
│  │ plugin.json   │  │ plugin.json   │  │ plugin.json ││
│  │ preload.js     │  │ preload.js     │  │ preload.js   ││
│  │ index.html     │  │ index.html     │  │ index.html   ││
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
│  │ 文件索引   │ │ 模糊搜索  │ │ 剪贴板监控 │ │ 屏幕截图/   ││
│  │ macOS     │ │ macOS    │ │ macOS    │ │ 颜色拾取    ││
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
| 全局快捷键注册 | Electron 主进程 (TS) |
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
  // ADR-001: Phase 1 使用 macOS Spotlight (MDItem) 直接搜索
  //         Phase 2 引入 Tantivy 实现自定义全文索引
  //         理由: Phase 1 不依赖自定义索引，零搭建成本
  //         见 待决策项 章节的 ADR-001
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
    │  [{title, subtitle, icon, action: { type: "shell.openPath", payload: { path: "/path/to/file" } }}]
    ▼
React 搜索框渲染结果列表
    │
用户点击选择
    │  IPC → 主进程 → 权限校验 → 执行 action descriptor
    ▼
主进程解析 descriptor 类型，校验权限后执行
    shell.openPath       → 打开文件
    clipboard.writeText  → 复制文本
    process.launchApp    → 启动应用
    plugin.openUrl       → 打开 URL
```

---

## 6. 插件系统

### 6.1 插件目录结构

```
szybko/plugins/
├── file-search/
│   ├── plugin.json          # 插件元数据 (uTools 兼容格式)
│   ├── preload.js           # 预加载脚本（可选，可调 Node.js API）
│   ├── index.html           # 插件 UI 入口
│   ├── assets/
│   │   └── icon.png
│   └── package.json         # 开发依赖（可选）
│
# 模型: 与 uTools 一致，插件通过 preload.js 暴露 API 到 window
# 宿主同时注入 utools 全局对象（提供系统能力桥接）
├── translate/
└── calculator/
```

### 6.2 plugin.json 定义（完全兼容 uTools 格式）

```json
{
  "main": "index.html",
  "logo": "assets/icon.png",
  "preload": "preload.js",
  "pluginSetting": {
    "single": true,
    "height": 544
  },
  "features": [
    {
      "code": "file-search",
      "explain": "搜索本地文件，支持模糊匹配",
      "cmds": ["file"]
    },
    {
      "code": "find-content",
      "explain": "按内容搜索文件",
      "cmds": ["find"]
    }
  ],
  "permissions": [
    "filesystem:read",
    "filesystem:index"
  ]
}
```

> **兼容说明**: 格式与 uTools `plugin.json` 完全一致。uTools 插件可直接放入 `plugins/` 目录加载。
> `permissions` 为 szybko 扩展字段，uTools 忽略。preload.js 可选，插件可用它暴露 Node.js 能力到前端。

### 6.3 插件生命周期

```
[安装]
    │  从商店下载 / 手动放入 plugins/ 目录 / 从 npm 安装
    ▼
[注册]
    │  插件加载器读取 plugin.json
    │  注册关键词到调度器
    │  校验请求的权限
    ▼
[休眠] ←──── [激活]
    │          用户输入匹配关键词时
    │          创建 WebView
    │          加载 plugin.json 指定的 preload.js
    │          宿主同时注入 utools 全局 API (contextBridge)
    │          加载插件 index.html
    │          调用 utools.onPluginEnter()
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
- 插件通过 `preload.js` 访问 Node.js 原生能力，与 uTools 一致
- 宿主同时通过 `contextBridge` 注入 `utools` 全局对象（系统能力桥接）
- 插件调用系统能力（文件、剪贴板、截图等）走 IPC → 主进程校验 permissions → 执行
- `permissions` 在安装时由用户确认

### 6.5 插件 SDK — API 参考

插件通过宿主注入的 `window.__SZYBKO__` 对象访问所有能力。API 设计参考 uTools，适配 Electron + Rust 架构。

#### 6.5.1 生命周期事件

```typescript
interface SzybkoAPI {
  /** 用户通过搜索进入插件时触发 */
  onPluginEnter(callback: (action: PluginEnterAction) => void): void

  /** 插件退出（隐藏或销毁）时触发 */
  onPluginOut(callback: (isKill: boolean) => void): void

  /** 用户点击"分离"按钮，插件弹出独立窗口时触发 */
  onPluginDetach(callback: () => void): void

  /** 插件从活动→挂起（用户切换到其他插件或返回搜索）时触发 */
  onPluginSuspend(callback: () => void): void

  /** 插件从挂起→活动时触发 */
  onPluginResume(callback: () => void): void

  /** 插件初始化完成（WebView 加载完成）时触发 */
  onPluginReady(callback: () => void): void

  /** 用户搜索匹配到本插件时触发—返回搜索结果 */
  onSearch(callback: (context: SearchContext) => SearchResult[]): void
}

interface PluginEnterAction {
  code: string       // manifest.features[].code
  type: 'text' | 'img' | 'file' | 'regex' | 'over' | 'window'
  payload: string | MatchFile[] | MatchWindow
  from: 'main' | 'detach'
}

interface SearchContext {
  queryId: string
  keyword: string      // 匹配的 keyword
  query: string        // keyword 之后的搜索文本
  fullQuery: string    // 完整内容
}
```

#### 6.5.2 窗口控制

```typescript
interface SzybkoAPI {
  /** 设置插件在主窗口中的显示高度 */
  setExpendHeight(height: number): void

  /** 隐藏主窗口 */
  hideMainWindow(): void

  /** 显示主窗口 */
  showMainWindow(): void

  /** 退出插件，返回搜索模式 */
  outPlugin(): void

  /** 设置子输入框（插件自定义搜索框） */
  setSubInput(onChange: (text: string) => void, placeholder?: string, isFocus?: boolean): void

  /** 移除子输入框 */
  removeSubInput(): void

  /** 设置子输入框的值 */
  setSubInputValue(text: string): void

  subInputFocus(): void
  subInputBlur(): void
  subInputSelect(): void

  /** 获取窗口类型 */
  getWindowType(): 'main' | 'detach' | 'browser'

  /** 判断当前是否为深色主题 */
  isDarkColors(): boolean

  /** 创建新浏览器窗口 */
  createBrowserWindow(url: string, options?: BrowserWindowOptions): Promise<void>

  /** 弹出系统文件选择对话框 */
  showOpenDialog(options?: OpenDialogOptions): Promise<string[] | undefined>

  showSaveDialog(options?: SaveDialogOptions): Promise<string | undefined>

  /** 重定向到另一个插件的指令 */
  redirect(label: string | [string, string], payload?: any): void
}
```

#### 6.5.3 系统操作

```typescript
interface SzybkoAPI {
  /** 以系统默认方式打开文件 */
  shellOpenPath(fullPath: string): void

  /** 在文件管理器中显示文件 */
  shellShowItemInFolder(fullPath: string): void

  /** 用默认浏览器打开 URL */
  shellOpenExternal(url: string): void

  /** 将文件移到回收站 */
  shellTrashItem(fullPath: string): void

  /** 弹出系统通知（点击可进入指定插件功能） */
  showNotification(body: string, clickFeatureCode?: string): void

  /** 获取设备 ID */
  getNativeId(): string

  getAppName(): string
  getAppVersion(): string

  /** 获取系统路径（home, appData, desktop, downloads 等） */
  getPath(name: 'home' | 'appData' | 'desktop' | 'documents' | 'downloads' | string): string

  /** 获取文件系统图标（返回 base64 Data URL） */
  getFileIcon(filePath: string): string

  isMacOS(): boolean
  isWindows(): boolean
  isLinux(): boolean
  isDev(): boolean
}
```

#### 6.5.4 剪贴板与输入

```typescript
interface SzybkoAPI {
  /** 复制文本到剪贴板 */
  copyText(text: string): boolean

  /** 复制文件到剪贴板 */
  copyFile(filePath: string | string[]): boolean

  /** 复制图像到剪贴板（支持路径/base64/Buffer） */
  copyImage(image: string | Uint8Array): boolean

  /** 获取剪贴板中的文件列表 */
  getCopyedFiles(): CopiedFile[]

  /** 隐藏主窗口，粘贴文本到前台应用 */
  hideMainWindowPasteText(text: string): void

  /** 隐藏主窗口，粘贴图像 */
  hideMainWindowPasteImage(image: string | Uint8Array): void

  /** 隐藏主窗口，粘贴文件 */
  hideMainWindowPasteFile(filePath: string | string[]): void

  /** 模拟输入法输入文本（不触发键盘事件） */
  hideMainWindowTypeString(text: string): void
}
```

#### 6.5.5 屏幕与图像

```typescript
interface SzybkoAPI {
  /** 屏幕取色，弹出取色器 */
  screenColorPick(callback: (color: { hex: string; rgb: string }) => void): void

  /** 屏幕截图，进入截图模式框选区域 */
  screenCapture(callback: (dataUrl: string) => void): void

  /** 获取主/所有显示器信息 */
  getPrimaryDisplay(): Display
  getAllDisplays(): Display[]

  /** 获取鼠标屏幕绝对位置 */
  getCursorScreenPoint(): { x: number; y: number }

  /** 获取录屏源（用于录屏或截取屏幕） */
  desktopCaptureSources(options: DesktopCaptureOptions): Promise<DesktopCaptureSource[]>
}
```

#### 6.5.6 数据存储

```typescript
interface SzybkoAPI {
  db: {
    put(doc: DbDoc): DbResult
    get(id: string): DbDoc | null
    remove(doc: DbDoc | string): DbResult
    bulkDocs(docs: DbDoc[]): DbResult[]
    allDocs(idStartsWith?: string | string[]): DbDoc[]
    postAttachment(id: string, attachment: Uint8Array, type: string): DbResult
    getAttachment(id: string): Uint8Array | null
    promises: { /* 同上，异步版本 */ }
  }

  /** 基于 db 的键值对存储（类似 localStorage） */
  dbStorage: { setItem(key: string, value: any): void; getItem(key: string): any; removeItem(key: string): void }

  /** 加密存储 */
  dbCryptoStorage: { setItem(key: string, value: any): void; getItem(key: string): any; removeItem(key: string): void }
}

interface DbDoc { _id: string; _rev?: string; [key: string]: unknown }
interface DbResult { id: string; rev?: string; ok?: boolean; error?: boolean; name?: string; message?: string }
```

#### 6.5.7 动态指令

```typescript
interface SzybkoAPI {
  /** 获取/设置/删除动态指令 */
  getFeatures(codes?: string[]): Feature[]
  setFeature(feature: Feature): void
  removeFeature(code: string): boolean
}

interface Feature {
  code: string
  explain?: string
  icon?: string
  cmds: (string | MatchCommand)[]
  mainHide?: boolean
  mainPush?: boolean
  platform?: ('win32' | 'darwin' | 'linux')[]
}
```

#### 6.5.8 模拟按键

```typescript
interface SzybkoAPI {
  simulateKeyboardTap(key: string, ...modifiers: ('shift' | 'ctrl' | 'alt' | 'meta')[]): void
  simulateMouseMove(x: number, y: number): void
  simulateMouseClick(x: number, y: number): void
  simulateMouseDoubleClick(x: number, y: number): void
  simulateMouseRightClick(x: number, y: number): void
}
```

#### 6.5.9 搜索结果格式

```typescript
interface SearchResult {
  id: string
  title: string            // 主标题（支持高亮标记）
  subtitle?: string        // 副标题
  icon?: string            // 图标（data: URL / 插件内相对路径）
  group?: string           // 分组名
  score: number            // 排序权重 0-1
  action: ActionDescriptor // 执行动作
}

type ActionDescriptor =
  | { type: "shell.openPath",       payload: { path: string } }
  | { type: "shell.openUrl",        payload: { url: string } }
  | { type: "shell.trashItem",      payload: { path: string } }
  | { type: "clipboard.writeText",  payload: { text: string } }
  | { type: "process.launchApp",    payload: { bundleId: string } }
  | { type: "plugin.open",          payload: { pluginId: string; url: string } }
  | { type: "plugin.runCommand",    payload: { pluginId: string; command: string; args?: any[] } }
  | { type: "plugin.search",        payload: { query: string } }
  | { type: "text.paste",           payload: { text: string } }
  | { type: "text.typeString",      payload: { text: string } }
  | { type: "redirect",             payload: { label: string; payload?: any } }
```

#### 6.5.10 脚手架与开发示例

```bash
# 创建插件项目
npx create-szybko-plugin my-plugin
cd my-plugin
npm install
npm run dev   # 启动热更新开发
```

```javascript
// index.js

utools.onPluginEnter(({ code, type, payload, from }) => {
  console.log(`进入插件: ${code}, 来源: ${from}`)
})

utools.onSearch(({ keyword, query }) => {
  return utools.db.allDocs('note/')
    .filter(doc => doc.title.includes(query))
    .map(doc => ({
      id: doc._id,
      title: doc.title,
      subtitle: doc._id,
      score: 0.8,
      action: { type: "shell.openPath", payload: { path: doc.path } }
    }))
})

utools.onPluginOut((isKill) => {
  console.log(`插件退出: ${isKill ? '销毁' : '隐藏后台'}`)
})

utools.onPluginDetach(() => {
  console.log('插件分离为独立窗口')
  utools.setExpendHeight(600)
})
```

插件在 `plugin.json` 中以字符串数组声明所需权限：

```json
{
  "permissions": [
    "filesystem:read",
    "filesystem:index",
    "clipboard:read",
    "clipboard:write",
    "shell:openPath"
  ]
}
```

- 安装时由用户确认授权
- 运行时简单校验（检查是否在声明的权限列表内）
- 后续可逐步细化

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
│   │   │   └── indexing/        # 文件索引
│   │   │   # 全局快捷键在 Electron 主进程实现, 见 host/shortcut-manager.ts
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
│   ├── host/                # Electron 主进程 (核心逻辑: main.ts, 插件加载器, 适配器桥接)
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
│   └── desktop/             # Electron 打包入口 (薄壳, 从 host 引入 main)
│       ├── package.json
│       ├── electron-builder.yml  # 打包配置
│       └── resources/
│           ├── icon.icns         # macOS 图标
│           └── icon.ico          # Windows 图标
│
├── plugins/                 # 本地开发插件目录
│   └── example-plugin/
│       ├── plugin.json
│       ├── preload.js
│       └── index.html
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

### 8.1 搜索请求流（流式 + query ID + 取消）

搜索使用**流式分批**协议，避免等待所有插件完成才展示结果：

#### 协议定义

```typescript
// 搜索请求
interface SearchRequest {
  queryId: string        // UUID，每次输入变化生成新 ID
  query: string          // 用户输入
  timestamp: number      // 请求时间戳
}

// 搜索结果批次
interface SearchBatch {
  queryId: string        // 对应请求 ID，(queryId, batchSeq) 唯一标识一批
  batchSeq: number       // 批次序号
  source: string         // 来源: "system" | "plugin:file-search"
  results: SearchResult[]
  isFinal: boolean       // 该 source 是否还有后续结果
}

// 搜索取消
// 主进程收到新 query 时，发送 cancel 给所有活跃插件 WebView
// WebView 内部检查 AbortController.signal，及时中止
```

#### 搜索流程

```
[React 搜索框] 用户输入 "fil"
    │  queryId = uuid()
    │  防抖 80ms (比之前 100ms 更短，靠流式抵消)
    ▼
[IPC] search({ queryId, query: "fil", timestamp })
    │
    ├─▶ [主进程] 发送 cancel(queryId_prev) 给活跃插件
    │          弃置上一个 queryId 的未处理结果
    │
    ├─▶ [系统搜索] （免激活，立即返回）
    │       模糊搜索已安装应用 → batch({ source: "system", results: [...], isFinal: true })
    │       内置计算器匹配 → batch({ source: "system", results: [...], isFinal: true })
    │
    ├─▶ [插件调度器]
    │       匹配关键词 → 无匹配 → 不激活任何插件
    │       此时输入变为 "file abc"
    │
    ▼
用户继续输入 "file abc" → 新 queryId，重复以上

[用户输入 "file abc"]
    │  queryId = uuid()
    │  防抖 80ms
    ▼
[IPC] search({ queryId, query: "file abc", timestamp })
    │
    ├─▶ 系统搜索 → 无匹配
    │
    ├─▶ 插件调度器匹配关键词 "file" → file-search
    │
    ├─▶ [插件加载器]
    │       检查插件 file-search 是否已激活
    │       → 否 → 激活（创建 WebView ~200ms）
    │       → 是 → 直接发送搜索请求
    │
    ├─▶ 发送 search({ queryId }) 到插件 WebView
    │
    ├─▶ [插件 WebView] 边搜索边分批返回
    │       batch({ queryId, batchSeq: 0, source: "plugin:file-search", results: [10 items], isFinal: false })
    │       batch({ queryId, batchSeq: 1, source: "plugin:file-search", results: [10 items], isFinal: false })
    │       batch({ queryId, batchSeq: 2, source: "plugin:file-search", results: [5 items],  isFinal: true })
    │
    └─▶ 主进程持续转发批次到 React UI
            UI 追加显示新批次（不替换已有结果）
    │
    ▼
用户看到前 10 个结果 < 100ms（插件激活时 ~300ms）
后续批次逐步补充
    │
用户按 ↓ 选择结果
    │
    ▼
用户点击 → IPC → 主进程校验 action descriptor 权限后执行
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

## 10. 测试策略

### 10.1 测试分层

| 层级 | 工具 | 覆盖内容 |
|---|---|---|
| 单元测试 | Vitest (TS) / cargo test (Rust) | 适配器接口逻辑、权限校验、搜索算法、工具函数 |
| IPC 合约测试 | Vitest + electron-ipc-mock | 主进程 ↔ 渲染进程 双向 IPC 消息格式与序列化 |
| Rust 集成测试 | cargo test + napi test | napi-rs 模块导入/导出、Rust 层错误转 JS Error |
| 插件沙箱测试 | Vitest + WebView mock | 插件加载/销毁、权限边界隔离、超时处理、崩溃恢复 |
| 搜索基准测试 | bencher (Rust) / Vitest bench | 模糊搜索吞吐量、文件索引速度、结果排序质量 |
| E2E 测试 | Playwright + Electron | 搜索框呼出、插件交互、设置页操作、跨版本升级 |
| 打包冒烟测试 | CI pipeline | electron-builder 打包、安装、首次启动 |

### 10.2 关键测试场景

**插件沙箱安全测试：**
- 插件尝试访问 `process.env` → 应被沙箱拦截
- 插件尝试 `require('fs')` → 应被沙箱拦截
- 插件调用未声明的权限 → 应返回 PermissionDenied
- 插件请求路径 `../../etc/passwd` → 应被路径规范化拒绝
- 插件死循环 → 应在 5s 超时后被销毁

**搜索协议测试：**
- 连续输入 `fi` → `fil` → `file`，验证旧 queryId 结果被丢弃
- 插件返回慢 → 系统搜索结果应在 < 100ms 内显示
- 插件 WebView 崩溃 → 主进程应记录错误，不阻塞其他插件

**IPC 合约测试：**
- `SearchRequest` / `SearchBatch` / `ActionDescriptor` 的序列化/反序列化一致性
- 发送 `cancel` 后插件应停止发送该 queryId 的 batch

### 10.3 CI 流水线

```
提交 / PR
    │
    ├─▶ lint + type-check (TS + Rust)
    ├─▶ 单元测试 (Vitest + cargo test)
    ├─▶ IPC 合约测试
    ├─▶ 插件沙箱测试
    ├─▶ Rust 集成测试
    ├─▶ 搜索基准测试 (对比 baseline，回归告警)
    │
    └─▶ 可选: E2E 测试 + 打包冒烟 (标签触发)

---

## 11. 性能目标

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

## 12. 开发计划建议

### Phase 1: 核心框架
- Monorepo 初始化（pnpm workspace）
- Rust 核心模块 (napi-rs) 搭建
- Electron 主进程 + 搜索框 UI
- 适配器接口定义 + macOS 文件搜索 (Spotlight MDItem 封装)
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

## 13. 架构决策记录 (ADR)

### ✅ 已决策

| ID | 决策 | 理由 |
|---|---|---|
| ADR-001 | 文件索引: **Phase 1 用 macOS Spotlight (MDItem)**，Phase 2+ 引入 Tantivy 自定义索引 | Phase 1 零搭建成本，无需维护索引文件；自定义索引是搜索体验优化，非核心功能依赖 |
| ADR-002 | 全局快捷键: **Electron 主进程实现**，不放 Rust | Electron 已有 globalShortcut API，跨平台一致；Rust 在此场景无性能优势，增加 napi 回调复杂度 |
| ADR-003 | 技术栈: Electron + Rust(napi-rs) + React + Monorepo pnpm | 已确认 |
| ADR-004 | 插件模型: sandbox WebView + plugin.json + uTools 兼容指令 | 已确认 |
| ADR-005 | 系统能力: 适配器模式，macOS 优先 | 已确认 |

### 🔲 待决策

| 决策项 | 选项 | 建议 |
|---|---|---|
| 插件商店 Registry | npm registry / 自建 registry | 建议先用 npm registry（低成本），后期自建 |
| 自动更新 | electron-updater / 自建 | 建议 electron-updater + GitHub Releases |
| 构建工具 | Turborepo / Nx / 原生 pnpm | 建议 Turborepo（按需，Phase 1 可选） |
| CI/CD | GitHub Actions / 其他 | 建议 GitHub Actions |
| 搜索框 UI 设计 | 待设计阶段细化 | — |

---

## 14. 附录

### 相关项目参考
- [uTools](https://u.tools) — 插件化桌面启动器
- [Raycast](https://raycast.com) — macOS 生产力工具
- [Alfred](https://alfredapp.com) — macOS 工作流启动器
- [napi-rs](https://napi.rs) — 用 Rust 构建 Node.js 原生模块
