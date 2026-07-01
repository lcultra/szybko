# Szybko

跨平台桌面生产力启动器，类似 uTools / Raycast。
技术栈: Electron + Rust(napi-rs) + React + Tailwind CSS v4 + pnpm monorepo

## 初次会话引导

本项目所有设计文档位于 `docs/superpowers/specs/szybko/`。在修改代码前，请依次阅读：

1. **`00-project-overview.md`** — 项目概览、技术选型、核心原则
2. **`04-file-map.md`** — 完整文件树、每个文件的职责、包依赖关系
3. **`02-data-model.md`** — 所有 TypeScript / Rust 类型定义
4. **`03-api-contracts.md`** — IPC 协议（18 个 channel 请求/响应格式）
5. **`05-milestones.md`** — 构建里程碑、当前进度、下一步执行目标

构建阶段参考：
- **`07-config-templates.md`** — 各包配置模板（package.json / vite / tailwind / Cargo）
- **`06-plugin-spec.md`** — plugin.json 规范与插件 API
- **`08-error-handling.md`** — 错误处理策略
- **`09-testing-guide.md`** — 验收条件与测试

## 开发命令

| 命令 | 用途 |
|---|---|
| `pnpm install` | 安装所有依赖 |
| `pnpm dev` | 启动 Electron 开发模式 |
| `pnpm build` | 构建所有 TS 包 |
| `pnpm --filter @szybko/core-rust build` | 构建 Rust 核心 (napi-rs) |
| `pnpm --filter @szybko/shared typecheck` | 类型检查 |
| `pnpm --filter @szybko/desktop dev` | 仅启动桌面端开发 |

## 架构速览

```
渲染进程 (React)  ↔  IPC (contextBridge)  ↔  主进程 (Node/TS)  ↔  napi-rs  ↔  Rust 核心
   @szybko/launcher         preload.ts         @szybko/host          @szybko/core-rust
   @szybko/design-system
```

- 所有功能都是插件，主渲染进程只提供搜索外壳
- 插件格式完全兼容 uTools plugin.json
- 系统能力走适配器模式，macOS 优先

## 关键约束

- 窗口: 820px 固定宽度，96-520px 动态高度，屏幕 1/3 处定位
- IPC: 全量走 contextBridge，不启用 nodeIntegration
- 前端: React 19 + Tailwind CSS v4 + lucide-react + @radix-ui/react
- 工具: dayjs / uuid / zustand
