# 架构设计

> 本文定义 Szybko 的分层架构、通信模式、系统边界和适配器模式。
> AI 实现 IPC 通道、适配器桥接、插件运行时等模块时，以本文为准。

## 1. 分层架构

```
┌──────────────────────────────────────────────────────────────┐
│  渲染进程 (React)  — 搜索外壳                                 │
│                                                              │
│  @szybko/launcher          @szybko/design-system              │
│  ├─ SearchBar              ├─ Button / Input / Switch / Tabs │
│  ├─ ResultList / ResultItem├─ tokens (colors/typography/...)  │
│  └─ WindowFrame            └─ lucide-react re-exports         │
│          │                                                    │
│     preload.ts (contextBridge)                                 │
│     暴露 window.utools 全局 API                               │
├──────────┴───────────────────────────────────────────────────┤
│  主进程 (Node/TypeScript)  — 中枢层                           │
│                                                              │
│  @szybko/host                                                 │
│  ├─ main.ts               Electron 入口                       │
│  ├─ window-manager.ts     窗口创建/定位/大小/显隐              │
│  ├─ shortcut-manager.ts   全局快捷键 (Alt+Space)              │
│  ├─ plugin-loader.ts      扫描 plugins/ 目录 → 读取plugin.json │
│  ├─ plugin-runtime.ts     插件生命周期/搜索分发/预热池         │
│  ├─ plugin-view-manager.ts WebContentsView 挂载/分离/销毁      │
│  ├─ adapter-bridge.ts     TS 调用 → Rust napi-rs 映射         │
│  └─ permission.ts         权限校验（当前简化版字符串匹配）      │
│          │                                                    │
│     直接 require 调用 (同一进程)                                │
├──────────┴───────────────────────────────────────────────────┤
│  Rust 核心 (napi-rs)  — 系统能力实现层                         │
│                                                              │
│  @szybko/core-rust                                            │
│  ├─ adapters/macos/         macOS 原生实现                    │
│  │   ├─ fs.rs              Spotlight 文件搜索                 │
│  │   ├─ clipboard.rs       剪贴板监控                         │
│  │   └─ process.rs         应用启动/进程管理                   │
│  ├─ search.rs              模糊搜索引擎                       │
│  └─ lib.rs                 导出所有 #[napi] 函数               │
└──────────────────────────────────────────────────────────────┘
```

## 2. 三层通信模式

### 2.1 渲染进程 ↔ 主进程 (IPC)

全量走 Electron `contextBridge` + `ipcRenderer.invoke`/`on`。

- **请求-响应**：`ipcRenderer.invoke(channel, payload)` → `ipcMain.handle(channel, handler)`
- **事件推送**：`webContents.send(channel, data)` → `ipcRenderer.on(channel, handler)`
- **安全**：渲染进程启用 `contextIsolation: true` + `sandbox: true`，`preload.ts` 是唯一的桥接通道

### 2.2 主进程 ↔ Rust 核心 (进程内调用)

Rust 通过 napi-rs 编译为 `.node` 文件，主进程 `require` 加载。

```typescript
// 同进程直接调用，零序列化开销
const native = require('@szybko/core-rust')
const results = native.searchFiles('query', { limit: 10 })
```

错误通过 napi 的 `Result<T, napi::Error>` 自动转为 JavaScript Error。

### 2.3 插件 WebContentsView ↔ 主进程 (独立 IPC)

每个已激活插件运行在主进程管理的 `WebContentsView` 中，而不是渲染进程内嵌 `<webview>`：
- 主窗口和分离窗口都是 `BrowserWindow`
- 插件内容是 `WebContentsView`，由主进程挂载到对应 `BrowserWindow.contentView`
- 渲染进程只负责搜索 UI、Tab 头和占位区域，通过 IPC 上报插件视图 bounds
- 插件 preload 注入 `window.utools`，系统能力调用走 IPC → 主进程鉴权 → 适配器/Rust
- `compat` 模式允许插件 preload 使用 Node.js 以兼容 uTools；`sandbox` 模式禁 Node，只开放受控 API

## 3. 适配器模式

所有系统能力定义在 `@szybko/shared` 包中，以 TypeScript interface 形式存在。

### 3.1 适配器注册

```typescript
class AdapterRegistry {
  register<T>(name: string, adapter: T): void
  get<T>(name: string): T
}
```

### 3.2 实现方式

macOS 适配器：Rust (napi-rs) 实现，编译为 `.node`，通过 `adapter-bridge.ts` 适配为 TS interface。
Windows/Linux 适配器：相同接口，后续按需实现。

## 4. 窗口规格

| 属性 | 值 |
|---|---|
| 宽度 | 820px 固定 |
| 最小高度 | 96px |
| 最大高度 | 520px |
| 初始定位 | 鼠标所在屏幕 1/3 高度处，水平居中 |
| 窗口装饰 | `frame: false` + `transparent: true`，圆角 + 毛玻璃 |
| 高度策略 | 渲染进程 `ResizeObserver` → IPC → 主进程 `setBounds()` |
| 插件视图策略 | 渲染进程上报内容区域 bounds → 主进程调用 `WebContentsView.setBounds()` |

## 5. 插件生命周期

```
[安装] → [注册] ⇄ [休眠] → [预热] → [激活] → [Tab 态] ⇄ [挂起]
                                      ↓             ↓
                                  [运行搜索]      [分离] → 独立窗口
```

- **休眠态**: 插件已注册关键词和静态索引，未创建 `WebContentsView`
- **预热**: 高频插件或刚命中的插件在后台创建 `WebContentsView`，受 LRU 和内存预算限制
- **激活**: 用户执行 `plugin.open` 或精确进入指令后，将插件视图挂载到主窗口内容区域
- **运行搜索**: 只有已激活、已预热或声明可后台搜索的插件接收 `plugin:search`
- **Tab 态**: 插件 `WebContentsView` 接管主窗口内容区域，React 仍负责 Tab 头
- **挂起**: 用户返回搜索或打开其他插件，视图从窗口移除但保留在预热池，超过 TTL 后销毁
- **分离**: 主进程把同一个 `WebContentsView` 从主窗口移动到独立 `BrowserWindow`，不得重新加载插件页面

## 6. 快速路径原则

1. **热键唤起不等待搜索**: `Alt+Space` 只做定位、显示、聚焦，索引刷新和插件扫描不得阻塞窗口显示。
2. **本地静态结果先返回**: 应用、插件指令、最近项目、剪贴板文本走内存索引，先发首批 `search-batch`。
3. **Rust 搜索流式补充**: 文件索引、模糊排序和图标 key 生成在 Rust 或后台任务中完成，分批返回。
4. **插件不冷启动参与每次输入**: 搜索框连续输入时，不为每个匹配关键词创建插件视图。
5. **图标异步加载**: `SearchResult` 优先返回 `iconKey`，UI 延迟请求或使用缓存，避免 base64 图标拖慢 IPC。

性能预算、测量点和失败处理见 `10-performance-budget.md`。
