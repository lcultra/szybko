# Szybko — 项目概述

> 本文件是整个蓝图文档集的入口。AI 执行时首先读取本文以了解项目的全貌和约束。

## 一句话定义

Szybko 是一个跨平台桌面生产力启动器，用户按 `Alt+Space` 唤出搜索框，搜索应用、文件、剪贴板等内容，并通过**插件系统**扩展无限能力。

## 技术选型

| 层 | 选型 | 用途 |
|---|---|---|
| 应用框架 | Electron (`BrowserWindow` + `WebContentsView`) | 桌面窗口、系统托盘、插件视图承载、原生菜单 |
| 系统核心 | Rust (napi-rs) | 编译为 `.node` 原生模块，承载性能敏感的系统调用 |
| 前端 | React + Tailwind CSS v4 | 搜索框 UI、插件 UI |
| 设计系统 | `@szybko/design-system` | 公共 Token、图标(lucide-react)、组件(Radix 原语包装) |
| 工具库 | dayjs, uuid, zustand | 日期、ID 生成、轻量状态 |
| 项目组织 | pnpm monorepo workspace | 统一管理所有包 |
| 打包分发 | electron-builder | 构建安装包、自动更新 |

## 核心原则

1. **宿主负责系统级核心，业务能力插件化** — 设置、插件管理、权限、索引、日志、崩溃恢复属于宿主；剪贴板、计算器等用户能力优先以第一方/第三方插件交付
2. **系统能力走适配器模式** — macOS 优先实现，后续扩展 Windows/Linux
3. **以 uTools 兼容为产品目标** — `plugin.json` 和核心 `window.utools` API 分阶段兼容，兼容范围以 `12-utools-compat-matrix.md` 为准
4. **主进程统一封装系统能力** — Rust 能力、Electron 能力、权限校验和插件视图生命周期都由主进程管理
5. **速度指标先于功能堆叠** — 热键唤起、首条结果、插件热启动、分离窗口都有明确 p95 预算，见 `10-performance-budget.md`

## 分层架构速览

```
渲染进程 (React)        ← 搜索框外壳、结果列表、插件 Tab 头
    ↕ IPC (contextBridge)
主进程 (Node/TS)        ← 窗口管理、WebContentsView 插件运行时、权限校验、Rust 桥接
    ↕ 直接函数调用
Rust 核心 (napi-rs)     ← 文件索引、模糊搜索、剪贴板监控、屏幕取色、性能关键路径
```

## 如何阅读本文档集

| 文件 | 给 AI 提供什么 |
|---|---|
| `00-project-overview.md` | 项目全貌、约束条件、阅读指南 |
| `01-architecture.md` | 分层架构、通信模式、系统边界 |
| `02-data-model.md` | 所有 TypeScript 类型、Rust 结构体、枚举定义 |
| `03-api-contracts.md` | 每个 IPC channel 的请求/响应/事件格式 |
| `04-file-map.md` | 完整的文件树，每个文件的唯一职责 |
| `05-milestones.md` | 构建顺序，每步创建哪些文件、验收条件 |
| `06-plugin-spec.md` | plugin.json schema、SDK API 参考 |
| `07-config-templates.md` | package.json / tsconfig / tailwind / vite / cargo 模板 |
| `08-error-handling.md` | 错误类型、传播路径、兜底策略 |
| `09-testing-guide.md` | 测试策略、里程碑验收场景 |
| `10-performance-budget.md` | 搜索、插件启动、分离窗口、内存的性能预算 |
| `11-plugin-runtime-strategy.md` | WebContentsView 插件运行时、预热池、分离/挂起策略 |
| `12-utools-compat-matrix.md` | uTools 插件兼容范围、分阶段支持矩阵 |

AI 执行顺序：`10 → 11 → 12 → 04 → 02 → 03 → 07 → 05`，遇到类型/接口疑问时回查 `02/03/06/11/12`。
