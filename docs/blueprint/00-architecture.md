# 架构设计

## 核心原则

> **PluginRuntime 是唯一的运行实体，Host 只是展示容器。**

Runtime 与 BrowserWindow 完全解耦。Runtime 不知道自己在哪个窗口，Host 不知道插件业务逻辑。

## 技术栈

| 层       | 选型                                                     |
| -------- | -------------------------------------------------------- |
| 应用框架 | Electron                                                 |
| 系统核心 | Rust (napi-rs)，编译为 `.node` 模块                      |
| 前端     | React 19 + Tailwind CSS v4                               |
| 设计系统 | `@szybko/design-system` (lucide-react + @radix-ui/react) |
| 工具     | dayjs, uuid, zustand                                     |
| 项目组织 | pnpm monorepo                                            |
| 打包     | electron-builder                                         |

## 架构图

```
                        Electron
                            │
               ┌────────────┴────────────┐
               │                         │
        PluginManager              WindowManager
               │                         │
               │                         │
        RuntimeManager              HostManager
               │                         │
      ┌────────┴────────┐                │
      │                 │                │
 PluginRuntime    PluginRuntime        Host
      │                 │                │
 WebContentsView  WebContentsView  BrowserWindow
      │                 │                │
 WebContents      WebContents         布局/焦点/显示
      │                 │
 插件 App          插件 App
```

## 通信

- **渲染进程 ⇄ 主进程**: `contextBridge` + `ipcRenderer.invoke`/`on`。禁用 nodeIntegration。
- **主进程 ⇄ Rust**: `require(.node)` 同进程调用。
- **插件 Runtime ⇄ 主进程**: 插件可声明 `preload.js`（Node 访问），宿主注入 `utools` 全局 API。

## Runtime 与 Host

### Host 接口

```typescript
interface Host {
  id: string
  attach(runtime: PluginRuntime): void
  detach(runtime: PluginRuntime): void
}
```

Host 的实现：

- **LauncherHost** — 主搜索窗口内容区
- **FloatingHost** — 独立分离窗口
- **SidebarHost / SplitHost / DockHost** — 未来扩展

Host 的职责：创建/管理 BrowserWindow、布局、Focus、显示/隐藏。**永远不知道插件业务**。

### Runtime 接口

```typescript
interface PluginRuntime {
  id: string
  pluginId: string
  instanceId: string        // 多实例时区分
  webContents: WebContents
  webContentsView: WebContentsView
  host: Host | null
  state: RuntimeState
  cache: Map<string, any>
}
```

Runtime 的职责：生命周期、WebContents、插件状态、IPC、缓存、权限。**永远不知道自己在哪个窗口**。

### RuntimeManager

管理所有 Runtime：

```typescript
class RuntimeManager {
  getRuntime(pluginId: string): PluginRuntime[]
  createRuntime(pluginId: string): PluginRuntime
  destroyRuntime(runtimeId: string): void
  attach(runtimeId: string, hostId: string): void
  detach(runtimeId: string): void
}
```

### WindowManager

管理窗口和 Host：

```typescript
class WindowManager {
  createHost(type: 'launcher' | 'floating'): Host
  disposeHost(hostId: string): void
  switchHost(runtimeId: string, targetHostId: string): void
}
```

## 生命周期

### Runtime 生命周期

```
Created → Activated → Attached → Detached → Attached → Suspended → Destroyed
```

| 状态      | 说明                                   |
| --------- | -------------------------------------- |
| Created   | Runtime 已创建，WebContents 初始化完毕 |
| Activated | 插件代码开始执行                       |
| Attached  | 当前挂载到了某个 Host（可见）          |
| Detached  | 从 Host 移除了，但 Runtime 仍在运行    |
| Suspended | Runtime 保留在内存，WebContents 不销毁 |
| Destroyed | 销毁释放所有资源                       |

注意：**Attached 表示"当前挂载到了某个 Host"，不是"插件正在运行"**。插件从 Created 后就一直在运行。

### Host 生命周期

```
Host Created → Attach Runtime → Running → Detach Runtime → Dispose Host
```

Dispose 的只是 Host，不是 Runtime。Runtime 可以切换 Host 继续运行。

### 完整流程

```
安装 → Load → Register → Waiting → Activate → Attach Host → Running
                                                                    │
                                              ┌─────────────────────┤
                                              │                     │
                                          Suspend              Detach
                                              │                     │
                                          Resume           Attach New Host
                                              │                     │
                                          Running              Running
                                              │
                                          Destroy
                                              │
                                          Uninstall
```

## 单例 vs 多实例

插件在 `plugin.json` 的 `pluginSetting` 中声明 `single`：

| single         | 行为                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `true`（默认） | 整个应用只允许一个 Runtime。再次激活复用已有的。分离时移动，不重建。 |
| `false`        | 允许创建多个 Runtime。每次激活创建新实例。互不影响。                 |

### 单例示例（AI Chat）

```
Launcher → Runtime#1 → 分离 → Runtime#1 移动到 Floating → 返回 → Runtime#1 回到 Launcher
```

WebContents 始终不变。聊天记录、AI Session、滚动位置全部保留。

### 多实例示例（Browser）

```
Launcher → Runtime#1 (Browser#1)
Launcher → Runtime#2 (Browser#2)
Floating  → Runtime#3 (Browser#3)
```

每个 Runtime 独立状态，互不影响。

## Launcher 窗口规格

| 属性 | 值                                                  |
| ---- | --------------------------------------------------- |
| 宽度 | 820px 固定                                          |
| 高度 | 96px 最小，520px 最大，由内容撑高                   |
| 定位 | 鼠标所在屏幕 1/3 高度，水平居中                     |
| 装饰 | `frame: false` + `transparent: true`，圆角 + 毛玻璃 |

## Host 切换流程（Launcher → Floating）

```
1. 用户点击"分离"
2. 渲染进程 invoke 'plugin:detach'
3. WindowManager.createHost('floating') → 创建新 BrowserWindow
4. RuntimeManager.detach(runtimeId)      → 从 LauncherHost 移除 WebContentsView
5. WindowManager 将 WebContentsView 添加到新窗口
6. RuntimeManager.attach(runtimeId, floatingHostId)
7. 主窗口回到搜索态
8. 插件收到 onPluginDetach()
```

整个过程 WebContents 不重建，插件 React/Solid 状态、AI Session、输入框内容全部保留。

## 性能预算

| 场景                     | 预算                                 |
| ------------------------ | ------------------------------------ |
| Alt+Space 到输入框可输入 | p95 < 80ms                           |
| 输入到首批结果渲染       | p95 < 30ms（内存）/ < 120ms（文件）  |
| 冷启动 Runtime           | p95 < 300ms                          |
| 切换 Host                | p95 < 80ms（不重建 WebContents）     |
| Runtime 预热池           | 默认最多 3 个，LRU 回收，TTL 10 分钟 |

## 适配器模式

所有系统能力定义在 `@szybko/shared` 中以 TypeScript interface 存在：
`IFileSystemAdapter`, `IClipboardAdapter`, `IProcessAdapter`, `IShellAdapter`, `IImageAdapter`, `INotificationAdapter`。

macOS 用 Rust 实现。每新增一个适配器在 `core-rust/src/adapters/macos/` 下新增文件。
