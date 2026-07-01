# IPC 协议

> 本文定义渲染进程 ↔ 主进程之间所有 IPC channel 的通信格式。
> AI 实现 preload.ts 和 ipcMain.handle 时，每条消息的签名以此为准。

## 约定

- **请求-响应**: `ipcRenderer.invoke(channel, payload)` → `ipcMain.handle(channel, handler)`
- **事件推送**: `webContents.send(channel, data)` → `ipcRenderer.on(channel, handler)`
- **pluginId 前缀**: 插件相关 channel 以 `plugin:` 开头
- **空响应**: 无返回值的 handler 返回 `{ ok: true }`

## 1. 搜索 IPC

### search — 提交搜索请求

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `search` |

```typescript
// Renderer → Main
ipcRenderer.invoke('search', {
  queryId: string
  query: string
  timestamp: number
})
// Main → Renderer
// 搜索结果通过事件 search-batch 流式返回
// handler 返回简单确认
{ ok: true }
```

### search-batch — 推送搜索结果批次

| | |
|---|---|
| 方向 | 主进程 → 渲染进程 |
| 模式 | send/on (事件推送) |
| channel | `search-batch` |

```typescript
// Main → Renderer (可多次发送，同一 queryId)
webContents.send('search-batch', {
  queryId: string
  batchSeq: number
  source: string          // "system" | "plugin:{pluginId}"
  results: SearchResult[]
  isFinal: boolean
})
```

### search-cancel — 取消搜索

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `search-cancel` |

```typescript
// Renderer → Main（发送新搜索前取消旧请求）
ipcRenderer.invoke('search-cancel', {
  queryId: string      // 要取消的 queryId
})
```

## 2. 执行动作 IPC

### execute — 执行用户选中的 action

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `execute` |

```typescript
// Renderer → Main
ipcRenderer.invoke('execute', {
  action: ActionDescriptor
  source: string        // "plugin:{pluginId}" | "system"
})

// Main → Renderer
// 正常执行: { ok: true, result?: any }
// 权限不足: { ok: false, error: "permission_denied", message: string }
// 执行失败: { ok: false, error: "execution_failed", message: string }
{ ok: boolean; result?: any; error?: string; message?: string }
```

### execute: 特殊 action 的处理

`type: "plugin.open"` 时，主进程执行以下操作：
1. 如果当前已有活跃插件 Tab → 挂起它（发 `plugin:suspended` 到渲染进程）
2. 激活或复用目标插件 `WebContentsView`
3. 发 `plugin:tab-opened` 到渲染进程（通知切换 UI 为 Tab 模式）

`type: "plugin.runCommand"` 时，主进程直接发送消息到对应插件 `webContents`。

## 3. 插件生命周期 IPC

### plugin:tab-opened — 插件进入 Tab 模式

| | |
|---|---|
| 方向 | 主进程 → 渲染进程 |
| 模式 | send/on |
| channel | `plugin:tab-opened` |

```typescript
webContents.send('plugin:tab-opened', {
  pluginId: string
  title: string
  url: string           // 插件 index.html 路径
  canDetach: boolean    // 是否支持分离
})
```

### plugin:tab-closed — 插件 Tab 关闭

| | |
|---|---|
| 方向 | 主进程 → 渲染进程 |
| 模式 | send/on |
| channel | `plugin:tab-closed` |

```typescript
webContents.send('plugin:tab-closed', {
  pluginId: string
})
```

### plugin:suspended — 插件被挂起

| | |
|---|---|
| 方向 | 主进程 → 渲染进程 |
| 模式 | send/on |
| channel | `plugin:suspended` |

```typescript
webContents.send('plugin:suspended', {
  pluginId: string
  reason: 'new_plugin_opened' | 'user_returned_search' | 'idle_timeout'
})
```

### plugin:detach — 分离插件

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `plugin:detach` |

```typescript
ipcRenderer.invoke('plugin:detach', {
  pluginId: string
})
// 主进程: 创建新 BrowserWindow，将同一个 WebContentsView 从主窗口移动到新窗口
// 返回: { ok: true, windowId: number }
```

### plugin:back-to-search — 返回搜索

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `plugin:back-to-search` |

```typescript
ipcRenderer.invoke('plugin:back-to-search', {})
// 主进程: 当前插件挂起，窗口回到 96px 搜索态
```

## 4. 窗口 IPC

### window:resize — 动态调整窗口高度

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `window:resize` |

```typescript
// Renderer → Main（由 ResizeObserver 触发）
ipcRenderer.invoke('window:resize', {
  height: number      // Content rect 高度，clamped 到 [96, 520]
})
```

### window:hide — 隐藏主窗口

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `window:hide` |

```typescript
ipcRenderer.invoke('window:hide', {})
```

### window:show — 显示主窗口

| | |
|---|---|
| 方向 | 主进程 → 渲染进程（快捷键触发） |
| 模式 | send/on |

事件推送（监听 `show-main-window` 来自主进程）：

```typescript
ipcRenderer.on('show-main-window', () => {
  // 重置搜索状态
})
```

### plugin:view-bounds — 同步插件视图区域

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `plugin:view-bounds` |

React 渲染进程不嵌入插件页面，只负责计算 Tab 内容区域的位置和尺寸。主进程收到后调用 `WebContentsView.setBounds()`。

```typescript
ipcRenderer.invoke('plugin:view-bounds', {
  pluginId: string
  x: number
  y: number
  width: number
  height: number
})
// 返回: { ok: true }
```

## 5. 主题 IPC

### theme:changed — 主题变更

| | |
|---|---|
| 方向 | 主进程 → 渲染进程 |
| 模式 | send/on |
| channel | `theme:changed` |

```typescript
webContents.send('theme:changed', {
  isDark: boolean
})
```

### theme:get — 获取当前主题

| | |
|---|---|
| 方向 | 渲染进程 → 主进程 |
| 模式 | invoke/handle |
| channel | `theme:get` |

```typescript
// Main → Renderer
{ isDark: boolean }
```

## 6. 系统能力 IPC（插件 preload 使用）

当插件 preload.js 调用系统能力时，通过以下 channel 通信：

### system:invoke — 调用系统能力

| | |
|---|---|
| 方向 | 插件 WebContentsView → 主进程（通过 preload 的 ipcRenderer） |
| 模式 | invoke/handle |
| channel | `system:invoke` |

```typescript
// Plugin preload → Main
ipcRenderer.invoke('system:invoke', {
  pluginId: string
  method: string      // 如 "filesystem.search", "clipboard.readText"
  args: any[]
})

// Main → Plugin preload
// 成功: { ok: true, data: any }
// 权限不足: { ok: false, error: "permission_denied" }
// 失败: { ok: false, error: string, message: string }
```

主进程 `system:invoke` handler 逻辑：
1. 根据 `pluginId` 查找该插件的 `permissions` 列表
2. 检查 `method` 是否在权限列表中（`"filesystem.search"` → 检查 `"filesystem:read"`）
3. 通过 → 调对应适配器实现
4. 拒绝 → 返回 `{ ok: false, error: "permission_denied" }`

## 7. 插件 WebContentsView ↔ 主进程

### plugin:search — 主进程转发搜索到插件 WebContents

| | |
|---|---|
| 方向 | 主进程 → 插件 WebContents |
| 模式 | send/on |

```typescript
// Main → Plugin WebContents
pluginWebContents.send('plugin:search', {
  queryId: string
  query: string
  keyword: string
  fullQuery: string
})
```

搜索分发限制：
- 休眠插件不参与连续输入搜索
- 只有已激活、已预热、或 manifest 标记可后台搜索的插件接收该事件
- 主进程必须按 `queryId` 丢弃过期结果

### plugin:search-result — 插件 WebContents 返回结果

| | |
|---|---|
| 方向 | 插件 WebContents → 主进程 |
| 模式 | send/on |

```typescript
// Plugin preload → Main
ipcRenderer.send('plugin:search-result', {
  queryId: string
  results: SearchResult[]
  isFinal: boolean
})
```

## 8. Channel 汇总表

| channel | 方向 | 模式 | 用途 |
|---|---|---|---|
| `search` | R→M | invoke/handle | 提交搜索请求 |
| `search-batch` | M→R | send/on | 推送搜索结果批次 |
| `search-cancel` | R→M | invoke/handle | 取消搜索 |
| `execute` | R→M | invoke/handle | 执行 action |
| `plugin:tab-opened` | M→R | send/on | 通知 Tab 模式切换 |
| `plugin:tab-closed` | M→R | send/on | 通知 Tab 关闭 |
| `plugin:suspended` | M→R | send/on | 通知插件挂起 |
| `plugin:detach` | R→M | invoke/handle | 分离插件到独立窗口 |
| `plugin:back-to-search` | R→M | invoke/handle | 返回搜索模式 |
| `plugin:view-bounds` | R→M | invoke/handle | 同步 WebContentsView 挂载区域 |
| `window:resize` | R→M | invoke/handle | 动态调整窗口高度 |
| `window:hide` | R→M | invoke/handle | 隐藏窗口 |
| `show-main-window` | M→R | send/on | 快捷键唤出窗口 |
| `theme:changed` | M→R | send/on | 主题变更通知 |
| `theme:get` | R→M | invoke/handle | 获取当前主题 |
| `system:invoke` | P→M | invoke/handle | 插件调系统能力 |
| `plugin:search` | M→P | send/on | 主进程转发搜索到插件 |
| `plugin:search-result` | P→M | send/on | 插件返回搜索结果 |

> R = 渲染进程, M = 主进程, P = 插件 WebContentsView
