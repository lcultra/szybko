# 里程碑

> 本文定义 Szybko 项目的构建顺序。AI 按编号依次执行，每个里程碑产出可验证的结果。
> 每步涉及的文件路径见 `04-file-map.md`，接口签名见 `02-data-model.md` 和 `03-api-contracts.md`。

## 执行顺序总览

```
M1  Monorepo + Electron 骨架     → 空 Electron 窗口
M2  共享类型包 (@szybko/shared)  → 所有类型定义
M3  设计系统 (@szybko/design-system) → 可复用的组件库
M4  Rust 核心 (core-rust)        → napi-rs 绑定可用
M5  搜索框 UI (launcher)        → 静态搜索框 + 毛玻璃窗口
M6  主进程 (host)               → Alt+Space 唤出 + 窗口管理
M7  IPC 通信链路                 → 输入 → IPC → 主进程 → 返回
M8  插件加载器                   → 识别 plugin.json + 注册指令
M9  搜索交互闭环                 → 输入 → 搜索 → 展示结果
M10 插件 WebView + Tab 模式      → 打开插件 UI + 返回搜索
```

---

## M1: Monorepo + Electron 骨架

**目标**: `pnpm dev` 能启动一个 Electron 窗口，显示空白 React 页面。

**文件**:
- 根 `package.json` + `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `apps/desktop/package.json` + `electron-builder.yml` + `resources/`
- `apps/desktop/src/main.ts` — Electron 入口
- `apps/desktop/src/preload.ts` — 空 preload
- `apps/desktop/src/renderer/index.html` + `main.tsx` + `App.tsx`
- `apps/desktop/vite.config.ts` + `tailwind.config.ts`

**参考配置**: `07-config-templates.md` 中的根配置、desktop 配置

**关键代码**:
```typescript
// apps/desktop/src/main.ts
import { app, BrowserWindow } from 'electron'
import path from 'path'

function createWindow() {
  const win = new BrowserWindow({
    width: 820,
    height: 96,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
```

**验收**: `pnpm --filter @szybko/desktop dev` 启动后看到空白 Electron 窗口（820×96，无边框）

---

## M2: 共享类型包

**目标**: `@szybko/shared` 包编译通过，包含所有数据模型定义。

**文件**: `packages/shared/` 下所有文件

**关键约定**:
- 纯 TypeScript 类型，无运行时逻辑
- 所有 IPC channel 名称定义为常量 enum
- `constants.ts` 导出的数字常量在渲染进程和主进程中共享

**验收**: `pnpm --filter @szybko/shared build` 编译成功

---

## M3: 设计系统

**目标**: `@szybko/design-system` 构建成功，launcher 可引用其组件。

**文件**: `packages/design-system/` 下所有文件

**关键输出**:
- Tailwind v4 preset（颜色变量映射到 Tailwind 语义色）
- Button、Input、Card 三个核心组件
- 所有组件 export 自 `src/index.ts`

**验收**: 在 launcher 的 App.tsx 中 `import { Button } from '@szybko/design-system'` 编译通过

---

## M4: Rust 核心

**目标**: `@szybko/core-rust` 编译为 `.node` 文件，主进程可调用一个 ping 函数。

**文件**: `packages/core-rust/` 下所有文件

**Cargo.toml 关键依赖**:
```toml
[dependencies]
napi = { version = "2", features = ["napi6", "async"] }
napi-derive = "2"

[build-dependencies]
napi-build = "2"
```

**Key Rust 代码**:
```rust
// src/lib.rs
use napi_derive::napi;

#[napi]
pub fn ping(message: String) -> String {
    format!("pong: {}", message)
}

// 后续函数在这里扩展
mod types;
mod adapters;
```

**验收**:
```bash
pnpm --filter @szybko/core-rust build
node -e "const n = require('./packages/core-rust'); console.log(n.ping('hello'))"
# 输出: pong: hello
```

---

## M5: 搜索框 UI

**目标**: 渲染进程显示搜索框界面，视觉与 uTools 一致，但无 IPC 交互。

**文件**: `packages/launcher/` 下所有文件

**关键点**:
- WindowFrame: 20px 圆角 + `backdrop-filter: blur(20px)` + `border border-border`
- SearchBar: 68px 高，24px 字号，"搜索应用、命令、文件、插件..." 占位符
- 初始状态：只有搜索框（96px 窗口高度），无结果区域
- 后续迁移：`App.tsx` 中的 `state: 'idle' | 'searching' | 'tab'`

**验收**: 启动后看到居中搜索框，窗口 820×96，毛玻璃效果

---

## M6: 主进程

**目标**: Electron 主进程处理窗口管理 + 快捷键。Alt+Space 唤出/隐藏窗口。

**文件**: `packages/host/src/main.ts` + `window-manager.ts` + `shortcut-manager.ts` + `theme.ts`

**关键行为**:
- `window-manager.ts`: `createMainWindow()` / `resize(height)` / `positionAt(屏幕 1/3` ) / `hide()` / `show()`
- `shortcut-manager.ts`: 注册 `Alt+Space` 快捷键，切换窗口显隐
- 窗口高度：渲染进程通过 IPC `window:resize` 通知，主进程 clamp 到 [96, 520]

**验收**: 按 Alt+Space 弹出窗口，再按隐藏

---

## M7: IPC 通信链路

**目标**: preload.ts + adapter-bridge.ts 联通，搜索请求能从渲染进程走到主进程。

**文件**:
- `packages/host/src/preload.ts` — contextBridge 暴露 `utools` API
- `packages/host/src/adapter-bridge.ts` — 加载 Rust .node 文件 + 适配器接口映射
- 更新 `apps/desktop/src/main.ts` → 引入 `@szybko/host`

**preload.ts 骨架**:
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('utools', {
  // 搜索
  search: (req: { queryId: string; query: string; timestamp: number }) =>
    ipcRenderer.invoke('search', req),
  searchCancel: (queryId: string) =>
    ipcRenderer.invoke('search-cancel', { queryId }),

  // 执行
  execute: (action: any) => ipcRenderer.invoke('execute', { action }),

  // 窗口
  resizeWindow: (height: number) =>
    ipcRenderer.invoke('window:resize', { height }),
  hideWindow: () => ipcRenderer.invoke('window:hide', {}),

  // 插件
  detachPlugin: (pluginId: string) =>
    ipcRenderer.invoke('plugin:detach', { pluginId }),
  backToSearch: () => ipcRenderer.invoke('plugin:back-to-search', {}),

  // 事件监听
  onSearchBatch: (cb: (batch: any) => void) => {
    const handler = (_: any, batch: any) => cb(batch)
    ipcRenderer.on('search-batch', handler)
    return () => ipcRenderer.removeListener('search-batch', handler)
  },
  onPluginTabOpened: (cb: (data: any) => void) => {
    const handler = (_: any, data: any) => cb(data)
    ipcRenderer.on('plugin:tab-opened', handler)
    return () => ipcRenderer.removeListener('plugin:tab-opened', handler)
  },
})
```

**验收**: 在 React 组件中 `window.utools.search({ queryId: '1', query: 'test', timestamp: Date.now() })` 能走到主进程 handler 并返回

---

## M8: 插件加载器

**目标**: 主进程扫描 `plugins/` 目录，读取 `plugin.json`，注册关键词。

**文件**:
- `packages/host/src/plugin-loader.ts` — 扫描/解析/注册
- `plugins/example-plugin/plugin.json` — 示例插件配置

**关键行为**:
```typescript
// plugin-loader.ts
interface LoadedPlugin {
  id: string              // 目录名
  manifest: PluginManifest
  features: PluginFeature[]
  path: string            // 插件目录绝对路径
}

class PluginLoader {
  scan(): LoadedPlugin[]
  getByKeyword(keyword: string): LoadedPlugin[]
  // ...
}
```

**验证**: 在 plugins/ 放入示例插件后，主进程启动时打印 "已注册插件: example-plugin，指令: [hello]"

---

## M9: 搜索交互闭环

**目标**: 输入文本 → 防抖 → IPC 搜索 → 模拟结果 → 展示列表 → 键盘导航。

**文件**:
- 更新 `packages/launcher/src/App.tsx` — 空闲态/搜索态切换
- 更新 `packages/launcher/src/hooks/useSearch.ts` — 防抖 + invoke search + 监听 search-batch
- 更新 `packages/launcher/src/hooks/useKeyboard.ts` — 方向键/Enter/Esc
- 更新 `packages/launcher/src/store.ts` — zustand store

**关键行为**:
- 输入防抖 80ms
- 每个新输入生成新 `queryId`，取消上一个
- 窗口动态高度：`ResizeObserver` → `window:resize` IPC
- 结果列表支持键盘选择（方向键 + Enter）

**验收**: 输入文字 → 展示模拟结果列表 → 键盘导航选中 → Enter 触发 execute

---

## M10: 插件 WebView + Tab 模式

**目标**: 点击结果中的 "打开插件 UI" 动作 → 主窗口切换为 Tab 模式 → 显示插件 WebView。

**文件**:
- `packages/host/src/plugin-runtime.ts` — WebView 创建/销毁/生命周期
- `packages/launcher/src/TabHeader.tsx` — [← 返回] [插件名] [分离]
- `packages/launcher/src/WebViewContainer.tsx` — 嵌入 `<webview>`

**关键行为**:
```
搜索态: 输入 "hello" → 匹配 example-plugin
        → 插件返回 SeachResult: { action: { type: "plugin.open", payload: { pluginId: "example-plugin", url: "index.html" } } }
        → 用户 Enter → 主进程 execute 处理

Tab 态: 窗口切换为 Tab 模式
        头部: [← 返回] [example-plugin] [分离]
        内容: 插件 WebView 加载 index.html
        
返回: 点击 ← → 插件挂起 → 回到搜索空闲态 (96px)
分离: 点击 分离 → 新 BrowserWindow → 主窗口隐藏 → WebView 移动到新窗口
```

**验收**: 搜索 → 选择插件结果 → 看到插件 WebView 加载 → ← 返回搜索态 → 分离 → WebView 在新窗口

---

## 执行顺序依赖图

```
M1 ──→ M2 ──→ M3 ──→ M5 ──→ M7 ──→ M9 ──→ M10
  │              │       │
  └──→ M4 ───────┘       │
                  └──→ M6 ──→ M8 ──→ M9
```

- M1 必须先完成（否则没有可执行环境）
- M2 先于 M3/M5/M7（类型引用）
- M4/M6 可并行于 M3/M5
- M7 需要 M1 + M4 + M6
- M8 需要 M6
- M9 需要 M5 + M7 + M8
- M10 需要 M8 + M9
