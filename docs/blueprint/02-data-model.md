# 数据模型

> 本文定义 Szybko 项目中所有共享的 TypeScript 类型、Rust 结构体和枚举。
> AI 在创建 IPC 通道、适配器接口、插件 SDK 时，所有类型签名以此为准。

## 1. 搜索相关类型

```typescript
// 搜索请求
interface SearchRequest {
  queryId: string        // UUID v4，每次输入变化生成新 ID
  query: string          // 用户输入的完整文本
  timestamp: number      // Date.now()
}

// 搜索结果批次（流式返回）
interface SearchBatch {
  queryId: string
  batchSeq: number       // 从 0 开始递增
  source: string         // "system" | "plugin:{pluginId}"
  results: SearchResult[]
  isFinal: boolean       // 该 source 是否还有后续结果
}

// 单个搜索结果（插件返回的格式）
interface SearchResult {
  id: string
  title: string
  subtitle?: string
  icon?: string           // 兼容字段：data: URL / 插件内相对路径；搜索热路径避免大体积 base64
  iconKey?: string        // 推荐字段：图标缓存 key，由 UI 异步解析为实际图片
  group?: string          // 结果分组名（分节展示）
  score: number           // 0-1，越高越靠前
  action: ActionDescriptor
}

// 执行动作描述符（取代函数，可序列化跨 IPC）
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

// 搜索上下文（插件 onSearch 接收）
interface SearchContext {
  queryId: string
  keyword: string        // 匹配的 plugin.json 中 feature.cmds 条目
  query: string          // keyword 之后的搜索文本
  fullQuery: string      // 用户输入的完整内容
}
```

## 2. 插件相关类型

```typescript
// 插件元数据（对应 plugin.json）
interface PluginManifest {
  main: string                    // index.html 路径
  logo: string                    // 图标路径
  preload?: string                // preload.js 路径（可选）
  runtimeMode?: 'compat' | 'sandbox' // szybko 扩展字段，默认 compat
  pluginSetting?: {
    single?: boolean               // 默认 true
    height?: number                // 插件 Tab 态初始高度，默认 544
  }
  features: PluginFeature[]
  permissions?: string[]           // szybko 扩展字段
}

interface PluginFeature {
  code: string
  explain?: string
  icon?: string
  cmds: (string | MatchCommand)[]
  mainHide?: boolean
  mainPush?: boolean
  platform?: ('win32' | 'darwin' | 'linux')[]
}

// 匹配指令（uTools 兼容）
type MatchCommand = RegexMatch | OverMatch | ImgMatch | FilesMatch | WindowMatch

interface RegexMatch {
  type: 'regex'
  label: string
  match: string           // 正则表达式
  minLength?: number
  maxLength?: number
}

interface OverMatch {
  type: 'over'
  label: string
  exclude?: string        // 排除正则
  minLength?: number
  maxLength?: number
}

interface ImgMatch {
  type: 'img'
  label: string
}

interface FilesMatch {
  type: 'files'
  label: string
  fileType?: 'file' | 'directory'
  extensions?: string[]
  match?: string
  minLength?: number
  maxLength?: number
}

interface WindowMatch {
  type: 'window'
  label: string
  match: {
    app: string[]
    title?: string
    class?: string[]
  }
}

// 插件进入动作
interface PluginEnterAction {
  code: string
  type: 'text' | 'img' | 'file' | 'regex' | 'over' | 'window'
  payload: string | MatchFile[] | MatchWindow
  from: 'main' | 'detach'
}

interface MatchFile {
  isFile: boolean
  isDirectory: boolean
  name: string
  path: string
}

interface MatchWindow {
  id: string
  class: string
  title: string
  x: number
  y: number
  width: number
  height: number
  appPath: string
  pid: number
  app: string
}

// 插件运行时状态
type PluginState = 'registered' | 'sleeping' | 'activating' | 'searching' | 'tab' | 'detached' | 'suspended' | 'uninstalled'

interface PluginInstance {
  id: string                    // pluginId
  manifest: PluginManifest
  state: PluginState
  view?: Electron.WebContentsView // 仅 activated/tab/detached/suspended 时有
  windowId?: number              // 当前挂载的 BrowserWindow id
  runtimeMode: 'compat' | 'sandbox'
  features: PluginFeature[]     // 含动态注册的
  warm: boolean                  // 是否在预热池中
  lastUsedAt?: number            // LRU 回收排序
  suspendedAt?: number          // 挂起时间戳（用于超时销毁）
}

// 插件视图边界，由渲染进程上报给主进程，主进程调用 WebContentsView.setBounds()
interface PluginViewBounds {
  pluginId: string
  x: number
  y: number
  width: number
  height: number
}

// 搜索索引项：宿主内存索引和 Rust 索引共享的最小结构
interface IndexedItem {
  id: string
  kind: 'app' | 'file' | 'directory' | 'plugin-command' | 'clipboard' | 'recent'
  title: string
  subtitle?: string
  keywords: string[]
  path?: string
  pluginId?: string
  featureCode?: string
  iconKey?: string
  lastUsedAt?: number
  modifiedAt?: number
}

interface SearchSession {
  queryId: string
  query: string
  startedAt: number
  cancelled: boolean
  deadlineMs: number
  sources: ('memory' | 'rust' | 'plugin')[]
}
```

## 3. 适配器接口

```typescript
// 文件系统
interface IFileSystemAdapter {
  search(query: string, options?: { paths?: string[]; limit?: number }): Promise<SearchResult[]>
  getFileIcon(filePath: string): Promise<string>           // base64 data URL
  getFileInfo(path: string): Promise<FileInfo>
}

// 进程/应用
interface IProcessAdapter {
  launchApp(bundleId: string): Promise<void>
  getInstalledApps(): Promise<AppInfo[]>
  getRunningApps(): Promise<AppInfo[]>
}

// 剪贴板
interface IClipboardAdapter {
  readText(): Promise<string>
  writeText(text: string): Promise<void>
  getHistory(limit?: number): Promise<ClipboardEntry[]>
  startMonitoring(callback: (entry: ClipboardEntry) => void): Promise<void>
  stopMonitoring(): Promise<void>
}

// Shell 操作
interface IShellAdapter {
  openPath(path: string): Promise<void>
  openUrl(url: string): Promise<void>
  showInFinder(path: string): Promise<void>
  trashItem(path: string): Promise<void>
}

// 屏幕/图像
interface IImageAdapter {
  captureScreen(): Promise<string>     // base64 data URL
  pickColor(): Promise<{ hex: string; rgb: string }>
  getPrimaryDisplay(): Display
  getAllDisplays(): Display[]
  getCursorScreenPoint(): { x: number; y: number }
}

// 通知
interface INotificationAdapter {
  show(title: string, body: string, options?: { clickFeatureCode?: string }): Promise<void>
}

// 窗口信息
interface IWindowAdapter {
  getActiveWindow(): Promise<WindowInfo>
  listWindows(): Promise<WindowInfo[]>
}

// 搜索引擎
interface ISearchEngine {
  fuzzySearch(query: string, items: IndexedItem[]): Promise<ScoredItem[]>
}

// 全局快捷键
interface IGlobalShortcutAdapter {
  register(accelerator: string, callback: () => void): Promise<void>
  unregister(accelerator: string): Promise<void>
  unregisterAll(): Promise<void>
}
```

## 4. 数据存储类型

```typescript
interface DbDoc {
  _id: string
  _rev?: string
  [key: string]: unknown
}

interface DbResult {
  id: string
  rev?: string
  ok?: boolean
  error?: boolean
  name?: string
  message?: string
}
```

## 5. IPC 消息类型

```typescript
// 主进程 → 渲染进程的事件
interface PluginTabOpen {
  pluginId: string
  url: string
  title: string
  canDetach: boolean
}

interface PluginTabClose {
  pluginId: string
}

interface ThemeChange {
  isDark: boolean
}

interface WindowHeightChange {
  height: number
}

// 渲染进程 → 主进程的通知
interface SearchCancel {
  queryId: string
}
```

## 6. Rust 数据结构

```rust
// napi-rs 导出的 Rust 结构体
// 所有 #[napi(object)] 结构体自动映射为 JS 对象

#[napi(object)]
pub struct SearchResult {
  pub id: String,
  pub name: String,
  pub path: String,
  pub kind: String,       // "file" | "directory" | "app" | ...
  pub modified_at: i64,   // unix timestamp
  pub score: f64,
}

#[napi(object)]
pub struct AppInfo {
  pub bundle_id: String,
  pub name: String,
  pub path: String,
  pub icon: String,       // base64 data URL
}

#[napi(object)]
pub struct ClipboardEntry {
  pub id: String,
  pub kind: String,       // "text" | "image" | "file"
  pub content: String,    // text content or base64 or path
  pub timestamp: i64,
}

#[napi(object)]
pub struct ColorInfo {
  pub hex: String,
  pub rgb: String,
}
```
