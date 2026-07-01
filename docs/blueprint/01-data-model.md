# 数据模型

## SearchRequest / SearchBatch

```typescript
interface SearchRequest {
  queryId: string       // UUID v4，每次输入变化生成新 ID
  query: string
  timestamp: number
}

interface SearchBatch {
  queryId: string
  batchSeq: number
  source: string        // "system" | "plugin:{pluginId}"
  results: SearchResult[]
  isFinal: boolean
}
```

## SearchResult / ActionDescriptor

```typescript
interface SearchResult {
  id: string; title: string; subtitle?: string; icon?: string
  group?: string; score: number  // 0-1
  action: ActionDescriptor
}

type ActionDescriptor =
  | { type: "shell.openPath",       payload: { path: string } }
  | { type: "shell.openUrl",        payload: { url: string } }
  | { type: "shell.trashItem",      payload: { path: string } }
  | { type: "clipboard.writeText",  payload: { text: string } }
  | { type: "process.launchApp",    payload: { bundleId: string } }
  | { type: "plugin.open",          payload: { pluginId: string; url: string } }
  | { type: "plugin.runCommand",    payload: { pluginId: string; command: string; args?: any[] } }
  | { type: "plugin.search",        payload: { query: string } }
  | { type: "text.paste",           payload: { text: string } }
  | { type: "redirect",             payload: { label: string; payload?: any } }
```

## PluginManifest

```json
{
  "main": "index.html", "logo": "icon.png", "preload": "preload.js",
  "pluginSetting": { "single": true, "height": 544 },
  "features": [{ "code": "...", "explain": "...", "cmds": ["..."] }],
  "permissions": ["filesystem:read"]
}
```

`cmds` 支持 uTools 全部匹配类型：`regex`、`over`、`files`、`img`、`window`。

## PluginInstance

```typescript
interface PluginInstance {
  id: string; manifest: PluginManifest; state: PluginState
  webview?: Electron.WebContentsView; features: PluginFeature[]
}

type PluginState = 'registered' | 'sleeping' | 'activating' | 'tab' | 'detached' | 'suspended' | 'uninstalled'
```

## 适配器接口（核心方法）

| 接口 | 方法 |
|---|---|
| IFileSystemAdapter | `search(query, opts?)` → `SearchResult[]` |
| IClipboardAdapter | `readText/writeText/getHistory/startMonitoring/stopMonitoring` |
| IProcessAdapter | `launchApp/getInstalledApps/getRunningApps` |
| IShellAdapter | `openPath/openUrl/showInFinder/trashItem` |
| IImageAdapter | `captureScreen/pickColor/getPrimaryDisplay/getAllDisplays` |

## 错误类型

```typescript
interface IPCError {
  ok: false
  error: 'permission_denied' | 'execution_failed' | 'plugin_crashed' | 'timeout' | 'invalid_params'
  message: string
}
// 渲染进程 ErrorBoundary 兜底；插件崩溃只影响自身，不阻塞主进程
```
