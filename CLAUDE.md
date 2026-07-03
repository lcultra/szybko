# Szybko

跨平台桌面生产力启动器。Electron + Rust(napi-rs) + React + Tailwind CSS v4 + pnpm monorepo。

## 初次会话

在修改代码前，先阅读：

1. `docs/blueprint/00-vision.md` — 产品愿景和长期原则
2. `docs/blueprint/01-architecture.md` — 平台边界和架构规则
3. `docs/blueprint/02-domain-model.md` — 领域对象和关系
4. `docs/blueprint/03-plugin-platform.md` — 插件平台方向
5. `docs/blueprint/04-capability-roadmap.md` — 能力演进路线

## 命令

- `pnpm dev` — Electron 开发模式
- `pnpm build` — 构建 TS 包
- `pnpm --filter @szybko/core-rust build` — 构建 Rust 核心

## 工具链

- **electron-vite** 负责 main + preload 的 esbuild 打包，renderer 指向 `packages/shell`，preload 分 host.ts（宿主窗口）和 plugin.ts（插件运行时）
- `electron` 模块通过 esbuild 的 `external` 处理，避免 pnpm symlink 问题
- 独立的 tsc 编译仅用于 typecheck
