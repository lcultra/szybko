# 插件规范

> 本文定义 Szybko 插件格式、SDK API 和开发指南。
> plugin.json 以 uTools 格式为兼容目标；实际支持范围按 `12-utools-compat-matrix.md` 分阶段落地。

## 1. plugin.json 规范

文件必须放置在插件目录的根目录，命名 `plugin.json`。

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

### 字段说明

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `main` | ✅ | string | index.html 路径，插件 UI 入口 |
| `logo` | ✅ | string | 插件图标路径 |
| `preload` | ❌ | string | 预加载脚本（可调 Node.js API） |
| `pluginSetting.single` | ❌ | boolean | 默认 true 单例模式 |
| `pluginSetting.height` | ❌ | number | 初始高度，默认 544 |
| `features` | ✅ | array | 功能指令集合，最小 1 条 |
| `features[].code` | ✅ | string | 功能编码，唯一 |
| `features[].explain` | ❌ | string | 功能描述 |
| `features[].icon` | ❌ | string | 功能图标 |
| `features[].cmds` | ✅ | array | 指令集合（字符串或匹配对象） |
| `permissions` | ❌ | string[] | szybko 扩展，权限声明 |

### cmds 匹配类型

支持 uTools 全部匹配类型。参见 `02-data-model.md` 中 `MatchCommand` 定义。

## 2. 插件目录结构

```
my-plugin/
├── plugin.json          # 必填
├── preload.js           # 可选；compat 模式可访问 Node.js，sandbox 模式不可访问
├── index.html           # 插件 UI
├── index.js             # 业务逻辑
├── icon.png             # 图标
└── package.json         # 可选，开发依赖
```

## 3. SDK API

插件通过 `window.utools` 访问宿主能力。完整 API 签名见下。

### 3.0 运行模式

```typescript
type PluginRuntimeMode = 'compat' | 'sandbox'
```

- `compat`: 默认模式，优先兼容 uTools 插件；允许插件 preload 使用 Node.js/Electron 能力，适合本地可信插件。
- `sandbox`: 安全模式，禁用 Node.js，仅注入受控 `window.utools` API；适合插件市场和不可信插件。
- 两种模式都由主进程使用 `WebContentsView` 承载插件 UI，渲染进程不直接嵌入插件页面。
- 权限系统在 `sandbox` 模式强制执行；`compat` 模式只能做宿主 API 鉴权，不能阻止插件直接使用 Node.js 能力。

### 3.1 生命周期

```typescript
// 进入插件时触发
utools.onPluginEnter(callback: (action: PluginEnterAction) => void): void

// 插件退出（隐藏或销毁）时触发
utools.onPluginOut(callback: (isKill: boolean) => void): void

// 分离为独立窗口时触发
utools.onPluginDetach(callback: () => void): void

// 挂起时触发
utools.onPluginSuspend(callback: () => void): void

// 从挂起恢复时触发
utools.onPluginResume(callback: () => void): void

// 初始化完成时触发
utools.onPluginReady(callback: () => void): void

// 搜索匹配时触发（返回搜索结果）
utools.onSearch(callback: (context: SearchContext) => SearchResult[]): void
```

### 3.2 窗口控制

```typescript
utools.setExpendHeight(height: number): void
utools.hideMainWindow(): void
utools.showMainWindow(): void
utools.outPlugin(): void

// 子输入框（插件自定义搜索）
utools.setSubInput(onChange: (text: string) => void, placeholder?: string, isFocus?: boolean): void
utools.removeSubInput(): void
utools.setSubInputValue(text: string): void
utools.subInputFocus(): void
utools.subInputBlur(): void
utools.subInputSelect(): void

// 窗口信息
utools.getWindowType(): 'main' | 'detach' | 'browser'
utools.isDarkColors(): boolean

// 重定向到其他插件指令
utools.redirect(label: string | [string, string], payload?: any): void
```

### 3.3 系统操作

```typescript
utools.shellOpenPath(fullPath: string): void
utools.shellShowItemInFolder(fullPath: string): void
utools.shellOpenExternal(url: string): void
utools.shellTrashItem(fullPath: string): void
utools.showNotification(body: string, clickFeatureCode?: string): void
utools.getNativeId(): string
utools.getAppName(): string
utools.getAppVersion(): string
utools.getPath(name: string): string
utools.getFileIcon(filePath: string): string
utools.isMacOS(): boolean
utools.isWindows(): boolean
utools.isLinux(): boolean
utools.isDev(): boolean
```

### 3.4 剪贴板

```typescript
utools.copyText(text: string): boolean
utools.copyFile(filePath: string | string[]): boolean
utools.copyImage(image: string | Uint8Array): boolean
utools.getCopyedFiles(): CopiedFile[]
utools.hideMainWindowPasteText(text: string): void
utools.hideMainWindowPasteImage(image: string | Uint8Array): void
utools.hideMainWindowPasteFile(filePath: string | string[]): void
utools.hideMainWindowTypeString(text: string): void
```

### 3.5 数据存储

```typescript
utools.db: {
  put(doc: DbDoc): DbResult
  get(id: string): DbDoc | null
  remove(doc: DbDoc | string): DbResult
  bulkDocs(docs: DbDoc[]): DbResult[]
  allDocs(idStartsWith?: string | string[]): DbDoc[]
  promises: { /* 异步版本同上 */ }
}
utools.dbStorage: { setItem(key: string, value: any): void; getItem(key: string): any; removeItem(key: string): void }
utools.dbCryptoStorage: { setItem(key: string, value: any): void; getItem(key: string): any; removeItem(key: string): void }
```

### 3.6 搜索与结果

```typescript
// 搜索结果格式
interface SearchResult {
  id: string
  title: string            // 主标题
  subtitle?: string        // 副标题
  icon?: string            // 图标
  group?: string           // 分组名
  score: number            // 0-1
  action: ActionDescriptor
}

// ActionDescriptor 定义见 02-data-model.md
```

### 3.7 开发示例

```javascript
// index.js
utools.onPluginEnter(({ code, type, payload, from }) => {
  console.log(`进入: ${code}`)
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
  console.log(`退出: ${isKill ? '销毁' : '隐藏后台'}`)
})
```

## 4. 插件与宿主的通信架构

```
插件 index.html (运行在 WebContentsView 中)
    ↕ window.utools.xxx()
插件 preload.js (compat 模式可访问 Node.js)
    ↕ ipcRenderer (Electron IPC)
主进程 plugin-runtime.ts
    → 权限校验
    → 调用适配器桥接 / 执行系统操作
    → 返回结果
```

插件不直接接触 Rust 核心。`sandbox` 模式下所有系统操作经主进程鉴权后执行；`compat` 模式保留 uTools 插件兼容性，安全边界按可信本地插件处理。
