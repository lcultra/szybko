# IPC 协议

渲染进程 ⇄ 主进程 全量走 `contextBridge` + `ipcRenderer.invoke`/`on`。

## channel 汇总

| channel                 | 方向 | 模式   | 用途                               |
| ----------------------- | ---- | ------ | ---------------------------------- |
| `search`                | R→M  | invoke | 提交搜索                           |
| `search-batch`          | M→R  | send   | 流式返回结果                       |
| `search-cancel`         | R→M  | invoke | 取消旧查询                         |
| `execute`               | R→M  | invoke | 执行 ActionDescriptor              |
| `runtime:state-changed` | M→R  | send   | Runtime 状态变更通知               |
| `runtime:create`        | R→M  | invoke | 创建新 Runtime（非单例插件）       |
| `runtime:destroy`       | R→M  | invoke | 销毁 Runtime                       |
| `host:view-attached`    | M→R  | send   | WebContentsView 已挂载到当前 Host  |
| `host:view-detached`    | M→R  | send   | WebContentsView 已从当前 Host 移除 |
| `host:switch`           | R→M  | invoke | 切换 Host（分离/合并）             |
| `window:resize`         | R→M  | invoke | 动态调整高度                       |
| `window:hide`           | R→M  | invoke | 隐藏窗口                           |
| `show-main-window`      | M→R  | send   | Alt+Space 唤出                     |
| `theme:changed`         | M→R  | send   | 主题切换                           |
| `theme:get`             | R→M  | invoke | 获取当前主题                       |

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
// type "plugin.open" → RuntimeManager 创建/激活 Runtime，挂载到当前 Host
```

### host:switch (R→M)

```typescript
invoke('host:switch', { pluginId: string, targetHost: 'launcher' | 'floating' })
→ { ok: true, hostId: string }
// WindowManager 用 pluginId 查找 Runtime，切换 Host、迁移 WebContentsView
// 渲染进程不感知 runtimeId，由主进程维护映射
```

### runtime:state-changed (M→R)

```typescript
send('runtime:state-changed', {
  runtimeId: string,
  pluginId: string,
  state: 'attached' | 'detached' | 'suspended' | 'destroyed',
  hostId?: string
})
// 渲染进程据此更新 UI 状态
```

### window:resize (R→M)

```typescript
invoke('window:resize', { height: number });
// height 由 ResizeObserver 测量，主进程 clamp 到 [96, 520]
```

## 插件 WebView 通信

```typescript
// M→插件: send('plugin:search', { queryId, query, keyword, fullQuery })
// 插件→M: send('plugin:search-result', { queryId, results, isFinal })
// P→M: invoke('system:invoke', { pluginId, method, args })
//       → 主进程调适配器 → 返回 { ok, data/error }
```
