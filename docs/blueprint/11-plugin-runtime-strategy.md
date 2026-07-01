# 插件运行时策略

> 本文定义插件容器、生命周期、预热池、分离窗口和搜索分发策略。实现时以 `WebContentsView` 为唯一插件视图容器，不使用 `<webview>` tag 或 `BrowserView`。

参考 Electron 官方 API：
- `WebContentsView`: https://www.electronjs.org/docs/latest/api/web-contents-view
- `BrowserView` deprecated: https://www.electronjs.org/docs/latest/api/browser-view
- `webview` tag warning: https://www.electronjs.org/docs/latest/api/webview-tag

## 1. 容器模型

```
BrowserWindow(main)
  ├─ React WebContents: 搜索框、结果列表、Tab 头
  └─ WebContentsView(plugin): 插件页面，由主进程挂载

BrowserWindow(detached)
  └─ WebContentsView(plugin): 从主窗口移动过来的同一个视图
```

关键约束：
- React 渲染进程不创建插件页面，只上报插件内容区域 bounds。
- 主进程通过 `BrowserWindow.contentView.addChildView()` 挂载插件视图。
- 插件分离时移动同一个 `WebContentsView`，保留 DOM、JS heap、滚动位置和插件状态。
- 插件返回搜索时从窗口移除，但可保留在预热池。

## 2. 运行模式

| 模式 | Node.js | 适用场景 | 权限边界 |
|---|---|---|---|
| `compat` | 允许 preload 使用 | uTools 兼容、本地可信插件 | 只能约束 `window.utools` API，不能阻止插件直接用 Node |
| `sandbox` | 禁用 | 插件市场、不可信插件 | 所有系统能力必须经主进程鉴权 |

默认先使用 `compat`，保证早期可加载更多 uTools 插件；插件市场上线前必须补齐 `sandbox` 模式。

## 3. 生命周期

| 状态 | 说明 | 资源 |
|---|---|---|
| `registered` | manifest 已加载，feature 已注册 | 无视图 |
| `sleeping` | 可被搜索命中，未创建视图 | 无视图 |
| `activating` | 正在创建或复用 `WebContentsView` | 视图创建中 |
| `tab` | 挂载在主窗口内容区 | 视图可见 |
| `detached` | 挂载在独立窗口 | 视图可见 |
| `suspended` | 从窗口移除，保留在预热池 | 视图不可见 |
| `uninstalled` | 插件卸载，资源释放 | 无视图 |

## 4. 预热池

默认策略：
- 最大保留 3 个 `WebContentsView`
- 挂起 TTL 10 分钟
- 内存压力高时立即按 LRU 回收
- 最近使用、固定插件、刚发生命中的插件优先保留

预热触发：
- 用户刚进入过插件并返回搜索
- 插件指令被高频命中
- 用户输入精确 keyword 且停顿超过 150ms

不会预热：
- 模糊输入连续变化时
- 插件声明为不允许后台运行时
- 插件最近崩溃或连续超时时

## 5. 搜索分发

搜索优先级：
1. 宿主内存索引：应用、插件指令、最近项目、剪贴板文本。
2. Rust 索引：文件、目录、模糊排序。
3. 插件搜索：仅已激活、已预热、或显式允许后台搜索的插件。

插件搜索限制：
- 休眠插件不因普通输入创建视图。
- 每次搜索携带 `queryId`，插件返回旧 `queryId` 时主进程丢弃。
- 150ms 软超时后 UI 不等待该插件。
- 800ms 硬超时后本次插件搜索结束。

## 6. 分离窗口

分离流程：
1. 用户点击 Tab 头的分离按钮。
2. 渲染进程 invoke `plugin:detach`。
3. 主进程创建新的 `BrowserWindow`。
4. 主进程从主窗口移除插件 `WebContentsView`。
5. 主进程把同一个 `WebContentsView` 添加到新窗口。
6. 主窗口回到搜索态并隐藏。
7. 插件收到 `onPluginDetach`。

禁止行为：
- 禁止通过重新 loadURL/loadFile 实现分离。
- 禁止把插件页面交给 React `<webview>` 承载。
- 禁止在分离时丢失插件 JS 状态。

## 7. 边界同步

React 负责计算插件区域：
- Tab 头高度
- 主窗口内容区宽高
- DPI / 多屏位置变化

主进程负责执行：
- `WebContentsView.setBounds()`
- 主窗口 resize 后更新 view bounds
- 分离窗口 resize 后更新 view bounds

对应 IPC 见 `03-api-contracts.md` 的 `plugin:view-bounds`。
