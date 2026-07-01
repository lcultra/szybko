# 架构设计

## 技术栈

| 层 | 选型 |
|---|---|
| 应用框架 | Electron 33 |
| 系统核心 | Rust (napi-rs)，编译为 `.node` 模块 |
| 前端 | React 19 + Tailwind CSS v4 |
| 设计系统 | `@szybko/design-system` (lucide-react + @radix-ui/react) |
| 工具 | dayjs, uuid, zustand |
| 项目组织 | pnpm monorepo |
| 打包 | electron-builder |

## 分层

```
渲染进程 (React)  ↔  IPC (contextBridge)  ↔  主进程 (Node/TS)  ↔  napi-rs  ↔  Rust 核心
```

1. **渲染进程**只提供搜索外壳，不内置任何业务功能。所有功能（设置、剪贴板、计算器等）都是插件。
2. **主进程**统一管理窗口、插件生命周期、权限校验，封装所有 Rust 调用为 `system.xxx()` API。
3. **Rust 核心**只被主进程调用，不直接和渲染进程或插件通信。

## 通信

- **渲染进程 ⇄ 主进程**: `contextBridge` + `ipcRenderer.invoke`/`on`。禁用 nodeIntegration。
- **主进程 ⇄ Rust**: `require(.node)` 同进程调用，零序列化开销。
- **插件 WebView ⇄ 主进程**: 插件可声明 `preload.js`（Node 访问），宿主同时注入 `utools` 全局 API。

## 窗口

| 属性 | 值 |
|---|---|
| 宽度 | 820px 固定 |
| 高度 | 96px 最小，520px 最大，由内容撑高 |
| 定位 | 鼠标所在屏幕 1/3 高度，水平居中 |
| 装饰 | `frame: false` + `transparent: true`，圆角 + 毛玻璃 |

## 插件生命周期

`registered → sleeping ⇄ activating → tab ⇄ suspended`，支持 `detached`（独立窗口）。

- **休眠态**: 已注册关键词，未创建视图，0 资源
- **激活**: 匹配关键词 → 创建/复用 `WebContentsView`
- **Tab 态**: 挂载在主窗口内容区
- **挂起**: 从窗口移除，保留在预热池（默认最多 3 个，LRU 回收，TTL 10 分钟）
- **容器**: 使用 `WebContentsView`（不是 `<webview>` tag 或已废弃的 `BrowserView`）

## 性能预算

| 场景 | 预算 |
|---|---|
| Alt+Space 到输入框可输入 | p95 < 80ms |
| 输入到首批结果渲染 | p95 < 30ms（内存）/ < 120ms（文件） |
| 插件冷启动到 Tab 态 | p95 < 300ms |
| 预热插件到 Tab 态 | p95 < 80ms |
| 休眠插件数 | 不创建 WebContentsView |
| 预热池 | 默认最多 3 个 |

## 适配器模式

所有系统能力定义在 `@szybko/shared` 中以 TypeScript interface 存在：
`IFileSystemAdapter`, `IClipboardAdapter`, `IProcessAdapter`, `IShellAdapter`, `IImageAdapter`, `INotificationAdapter`。

macOS 用 Rust 实现。每新增一个适配器在 `core-rust/src/adapters/macos/` 下新增文件。
