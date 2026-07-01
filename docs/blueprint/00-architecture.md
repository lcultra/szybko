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

```
安装 → 注册 → 等待 → 激活 → 运行 → 休眠
                         ↑         ↓
                         └─────────┘
                         
卸载 → 结束
```

| 阶段 | 说明 |
|---|---|
| 安装 | 放入 `plugins/` 或从商店下载 |
| 注册 | 读取 `plugin.json` → 校验 → 注册关键词 → 建立搜索索引 |
| 等待 | 已注册，可被搜索命中，无视图无资源 |
| 激活 | 用户搜索命中关键词 → 创建/复用 `WebContentsView` |
| 运行 | 搜索/UI/调系统 API，可分离到独立窗口 |
| 休眠 | 用户离开，运行时保留（可配置超时销毁） |
| 卸载 | 删除目录 → 清理关键词 → 销毁运行时 |

**关键原则**:
- 不分 `tab`/`detached`——激活就是运行，分离只是 WebContentsView 移到另一个窗口，插件的状态不变。
- 休眠后再次激活 = 从休眠恢复，不是重新创建。
- 容器使用 `WebContentsView`（不是 `<webview>` tag 或已废弃的 `BrowserView`）。
- 预热池默认最多保留 3 个休眠插件，LRU 回收，TTL 10 分钟。

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
