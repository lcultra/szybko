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

## 设计原则

- **不兼容历史**：本项目处于早期阶段，无需考虑向后兼容。每次改动都按最长期、最合理的方案实现，不因历史包袱而妥协。
- **质疑架构**：在设计和编程过程中，如果你发现当前代码存在架构不合理、抽象层次错误或设计过度/不足的问题，请及时抛出问题并给出改进建议。我们不追求短期正确，而追求长期可持续性。
- **主动重构**：当发现某个抽象在变厚或变模糊时，主动提出重构方向，而非在旧模式上继续堆砌。

请遵循以下设计原则：

- 严格遵守 DDD（领域驱动设计） 或 MVC/Clean Architecture 架构。
- 遵循 SOLID 原则，确保高内聚、低耦合。必须使用 依赖注入（DI），不要硬编码依赖项。
- 对核心对象使用 设计模式（例如工厂模式、策略模式等），并解释为什么使用。

## 工具链

- **electron-vite** 负责 main + preload 的 esbuild 打包，renderer 指向 `packages/shell`，preload 分 host.ts（宿主窗口）和 plugin.ts（插件运行时）
- `electron` 模块通过 esbuild 的 `external` 处理，避免 pnpm symlink 问题
- 独立的 tsc 编译仅用于 typecheck
