# Szybko

跨平台桌面生产力启动器。技术栈: Electron + Rust(napi-rs) + React + Tailwind CSS v4 + pnpm monorepo。

## 初次会话

在修改代码前，先阅读以下文档：

1. `docs/superpowers/specs/szybko/00-project-overview.md` — 项目概览
2. `docs/superpowers/specs/szybko/04-file-map.md` — 文件结构与职责
3. `docs/superpowers/specs/szybko/02-data-model.md` — 类型定义
4. `docs/superpowers/specs/szybko/03-api-contracts.md` — IPC 协议
5. `docs/superpowers/specs/szybko/05-milestones.md` — 构建里程碑与当前进度

## 命令

- `pnpm dev` — 启动 Electron 开发模式
- `pnpm build` — 构建所有 TS 包
- `pnpm --filter @szybko/core-rust build` — 构建 Rust 核心
