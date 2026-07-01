# IPC 协议

渲染进程 ⇄ 主进程 全量走 `contextBridge` + `ipcRenderer.invoke`/`on`。

## channel 汇总

| channel | 方向 | 模式 | 用途 |
|---|---|---|---|
| `search` | R→M | invoke | 提交搜索 |
| `search-batch` | M→R | send | 流式返回结果 |
| `search-cancel` | R→M | invoke | 取消旧查询 |
| `execute` | R→M | invoke | 执行 ActionDescriptor |
| `plugin:activated` | M→R | send | 插件进入运行态（WebContentsView 挂载） |
| `plugin:sleeping` | M→R | send | 插件进入休眠 |
| `plugin:detach` | R→M | invoke | 分离到独立窗口（移动 WebContentsView） |
| `plugin:back-to-search` | R→M | invoke | 返回搜索，插件休眠 |
| `plugin:view-attached` | M→R | send | UI 通知：插件视图已挂载到窗口 |
| `plugin:view-detached` | M→R | send | UI 通知：插件视图已从窗口移除 |
| `window:resize` | R→M | invoke | 动态调整高度 |
| `window:hide` | R→M | invoke | 隐藏窗口 |
| `show-main-window` | M→R | send | Alt+Space 唤出 |
| `theme:changed` | M→R | send | 主题切换 |
| `theme:get` | R→M | invoke | 获取当前主题 |

> R = 渲染进程, M = 主进程

## 关键 channel 签名

### search (R→M)

```typescript
invoke('search', { queryId: string, query: string, timestamp: number })
→ { ok: true }  // 结果通过 search-batch 流式返回
```

### search-batch (M→R)

```typescript
send('search-batch', {
  queryId: string, batchSeq: number,
  source: string,       // "system" | "plugin:{pluginId}"
  results: SearchResult[],
  isFinal: boolean
})
```

### execute (R→M)

```typescript
invoke('execute', { action: ActionDescriptor, source: string })
→ { ok: boolean, result?: any, error?: string, message?: string }
// type "plugin.open" → 主进程激活插件，前一个插件进入休眠
```

### window:resize (R→M)

```typescript
invoke('window:resize', { height: number })
// height 由 ResizeObserver 测量，主进程 clamp 到 [96, 520]
```

### plugin:detach (R→M)

```typescript
invoke('plugin:detach', { pluginId: string })
→ { ok: true, windowId: number }
// 主进程创建新 BrowserWindow，移动同一个 WebContentsView，不重新加载
// 插件的状态不变（仍然是 running），只是窗口不同
```

## 插件 WebView 通信

```typescript
// M→插件: send('plugin:search', { queryId, query, keyword, fullQuery })
// 插件→M: send('plugin:search-result', { queryId, results, isFinal })
// P→M: invoke('system:invoke', { pluginId, method, args })
//       → 主进程校验 permissions → 调适配器 → 返回 { ok, data/error }
```
