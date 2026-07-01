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
│  ├─ plugin-runtime.ts     WebView 创建/销毁/生命周期/搜索分发  │
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

### 2.3 插件 WebView ↔ 主进程 (独立 IPC)

每个插件运行在独立的 `<webview>` 中：
- 插件可声明自己的 `preload.js`（访问 Node.js API）
- 宿主同时注入 `utools` 全局对象（系统能力桥接）
- 插件调 `utools.system.xxx()` → IPC → 主进程鉴权 → 执行

## 3. 适配器模式

所有系统能力定义在 `@szybko/adapter-interface` 包中，以 TypeScript interface 形式存在。

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

## 5. 插件生命周期

```
[安装] → [注册] ⇄ [休眠] ← [激活] → [运行] → [挂起] ⇄ [Tab 态]
                                              ↓
                                         [分离] → 独立窗口
```

- **休眠态**: 插件已注册关键词，未加载 WebView，占用 0 资源
- **激活**: 用户输入匹配关键词 → 创建 WebView + 加载 preload + 加载 index.html
- **Tab 态**: 用户点击"打开插件 UI"，插件 WebView 全屏接管主窗口
- **挂起**: 用户返回搜索或打开其他插件，WebView 保留不销毁（可配置超时销毁）
- **分离**: 插件弹出独立窗口，主窗口回到搜索空闲态并隐藏
