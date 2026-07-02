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

## 已知问题

**pnpm + Electron 模块解析**: `require('electron')` 在 pnpm 的 symlink 结构下会解析到 npm 包的 `index.js`（返回路径字符串），而非 Electron 内置 API。标准解法是使用 `electron-vite` 或 `tsx` + esbuild 打包 main 进程。当前 desktop 的 `src/main.ts` 直接从 `electron` import，需要等工具链方案落地后才能运行。
