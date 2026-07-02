# Szybko

跨平台桌面生产力启动器。Electron + Rust(napi-rs) + React + Tailwind CSS v4 + pnpm monorepo。

## 初次会话

在修改代码前，先阅读：

1. `docs/blueprint/00-architecture.md` — 架构、通信、窗口、性能预算
2. `docs/blueprint/01-data-model.md` — 核心类型
3. `docs/blueprint/02-file-map.md` — 文件结构
4. `docs/blueprint/04-api-contracts.md` — IPC 协议
5. `docs/blueprint/03-plugin-spec.md` — 插件格式

## 命令

- `pnpm dev` — Electron 开发模式
- `pnpm build` — 构建 TS 包
- `pnpm --filter @szybko/core-rust build` — 构建 Rust 核心

## 工具链

- **electron-vite** 负责 main + preload 的 esbuild 打包，renderer 指向 `packages/launcher`，preload 分 host.ts（宿主窗口）和 sandbox.ts（插件沙箱）
- `electron` 模块通过 esbuild 的 `external` 处理，避免 pnpm symlink 问题
- 独立的 tsc 编译仅用于 typecheck
