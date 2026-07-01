# 测试指南

> 本文定义测试策略和每个里程碑的验收条件。AI 在每个里程碑完成后按对应章节验证。

## 1. 测试分层

| 层级 | 工具 | 覆盖内容 |
|---|---|---|
| 单元测试 | Vitest (TS) / cargo test (Rust) | 工具函数、搜索算法、状态管理逻辑 |
| IPC 合约测试 | Vitest + 模拟 ipcMain/ipcRenderer | IPC 消息格式与序列化一致性 |
| Rust 集成测试 | cargo test | napi 函数导入/导出、数据结构序列化 |
| 搜索基准测试 | cargo bench | 模糊搜索性能、索引查询、排序融合 |
| Electron E2E | Playwright + Electron runner | 热键唤起、首批结果、WebContentsView 挂载、分离窗口 |
| 手动验收 | 人工操作 | 窗口行为、UI 视觉效果、插件交互 |

## 2. 每个里程碑的验收条件

### M1: Monorepo + Electron 骨架

```bash
# 安装依赖
pnpm install

# 启动开发模式
pnpm --filter @szybko/desktop dev

# 预期: Electron 窗口打开，820×96，无边框，透明背景
# 确认: 能看到窗口，尺寸正确，无报错
```

### M2: 共享类型包

```bash
pnpm --filter @szybko/shared typecheck
# 预期: 无编译错误
```

### M3: 设计系统

```bash
pnpm --filter @szybko/design-system typecheck
# 预期: 无编译错误
```

### M4: Rust 核心

```bash
pnpm --filter @szybko/core-rust build
# 预期: 生成 .node 文件

node -e "
  const core = require('./packages/core-rust')
  console.log(core.ping('hello'))
"
# 预期输出: pong: hello
```

### M5: 搜索框 UI

```bash
pnpm --filter @szybko/desktop dev
# 预期:
# - 窗口 820×96，毛玻璃背景，20px 圆角
# - 搜索框居中，占位符 "搜索应用、命令、文件、插件..."
# - 无结果区域显示
```

### M6: 主进程

```bash
pnpm --filter @szybko/desktop dev
# 预期:
# - 按 Alt+Space → 窗口弹出（屏幕 1/3 高度处）
# - 再按 Alt+Space → 窗口隐藏
# - 窗口从 96px 到 520px 可调（通过 window:resize IPC）
```

### M7: IPC 通信链路

```bash
# 在 React 开发者工具控制台中执行:
window.utools.search({ queryId: 'test-1', query: 'ping', timestamp: Date.now() })

# 预期: main process handler 被调用, 返回 { ok: true }
# 控制台能看到 "search handler called with: ping"
```

### M8: 插件加载器

```bash
# 启动后查看主进程控制台
# 预期日志:
# [插件加载器] 扫描 plugins/ 目录
# [插件加载器] 找到 1 个插件: example-plugin
# [插件加载器] 注册指令: ["hello", "你好"]
```

### M9: 搜索交互闭环

```bash
# 操作:
# 1. Alt+Space 打开搜索框
# 2. 输入 "hello"
# 3. 预期: 首批内存索引结果快速出现，后续批次流式补充
# 4. 按 ↓ ↓ 选择结果
# 5. 按 Enter → 触发 execute
# 6. 窗口高度随结果数量动态变化
```

### M10: 插件 WebContentsView + Tab 模式

```bash
# 操作:
# 1. 搜索 "hello" → 显示 example-plugin 的搜索结果
# 2. 选择 "hello" 结果 → 按 Enter
# 3. 窗口切换为 Tab 模式
# 4. 头部显示: [← 返回] [example-plugin] [分离]
# 5. 内容区域显示主进程挂载的 WebContentsView，插件加载 index.html
# 6. 点击 ← 返回 → 回到搜索空闲态 (96px)
# 7. 再次搜索并进入插件 → 点击 分离 → 同一个 WebContentsView 移动到独立窗口，页面不 reload
```

### M11: 性能预算

```bash
# 自动基准或人工测量均需输出 p50/p95
# 预期:
# - Alt+Space 到输入框可输入 p95 < 80ms
# - 输入到首批结果 p95 < 30ms
# - 插件热启动 p95 < 80ms
# - 插件冷启动 p95 < 300ms
# - 分离窗口 p95 < 120ms
# - 20 个休眠插件不创建 WebContentsView
```

## 3. Vitest 测试建议

```typescript
// 示例: IPC 合约测试 (vitest)
import { describe, it, expect } from 'vitest'

describe('IPC Search Contract', () => {
  it('SearchRequest format', () => {
    const request = {
      queryId: 'uuid-123',
      query: 'test',
      timestamp: Date.now(),
    }
    expect(request).toHaveProperty('queryId')
    expect(request).toHaveProperty('query')
    expect(typeof request.query).toBe('string')
  })

  it('SearchBatch is serializable', () => {
    const batch = {
      queryId: 'uuid-123',
      batchSeq: 0,
      source: 'plugin:test',
      results: [],
      isFinal: true,
    }
    const json = JSON.stringify(batch)
    expect(() => JSON.parse(json)).not.toThrow()
  })
})
```
