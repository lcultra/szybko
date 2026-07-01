# 错误处理

> 本文定义错误类型、传播路径和各层兜底策略。

## 1. 错误类型

```typescript
// IPC 返回的通用错误结构
interface IPCError {
  ok: false
  error: 'permission_denied' | 'execution_failed' | 'plugin_crashed' | 'timeout' | 'invalid_params'
  message: string
  code?: number
}

// 权限错误
interface PermissionError extends IPCError {
  error: 'permission_denied'
  permission: string       // 缺少的权限名
  pluginId: string
}

// 适配器错误
class AdapterError extends Error {
  constructor(
    message: string,
    public adapter: string,    // 适配器名称
    public method: string,     // 方法名
    public cause?: Error
  ) {
    super(message)
  }
}
```

## 2. 错误传播路径

```
Rust 错误
    ↓ napi::Error → JavaScript Error
    ↓
适配器桥接 (adapter-bridge.ts)
    ↓ 包装为 AdapterError
    ↓
主进程 handler (ipcMain.handle)
    ↓ 返回 { ok: false, error, message }
    ↓
preload.ts 透传
    ↓
渲染进程 / 插件 WebContentsView 处理
```

## 3. 各层级错误处理

| 层级 | 策略 |
|---|---|
| Rust 核心 | 使用 `Result<T, napi::Error>`，所有可能失败的操作都返回 Result |
| 适配器桥接 | 捕获 Rust Error → 包装为 `AdapterError`，附加上下文 |
| IPC handler | `try/catch` 包裹业务逻辑，统一返回 `{ ok: false, error, message }` |
| 插件 WebContentsView | 插件崩溃 → 主进程收到 `render-process-gone` 事件 → 记录日志 → 销毁 WebContentsView |
| 渲染进程 UI | ErrorBoundary 包裹，显示"出现错误"提示，不阻塞其他操作 |

## 4. 插件超时处理

```
插件 WebContentsView 接收搜索请求
    → 150ms 内未返回首批结果：本次查询不再等待该插件，UI 展示其他 source
    → 800ms 内未 final：主进程标记该插件本次搜索超时，丢弃后续同 queryId 结果
    → 连续 3 次超时：插件从后台搜索名单移除，仅保留手动进入
    → 插件继续运行（仅取消本次搜索）
```

## 5. 启动失败兜底

- Electron 窗口创建失败 → 退出进程，显示原生错误对话框
- Rust .node 文件加载失败 → 记录错误，主进程以降级模式运行（无原生能力）
- plugins/ 目录不存在 → 自动创建空目录，不报错
