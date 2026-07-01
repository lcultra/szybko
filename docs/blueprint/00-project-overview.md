# Szybko — 项目概述

> 本文件是整个蓝图文档集的入口。AI 执行时首先读取本文以了解项目的全貌和约束。

## 一句话定义

Szybko 是一个跨平台桌面生产力启动器，用户按 `Alt+Space` 唤出搜索框，搜索应用、文件、剪贴板等内容，并通过**插件系统**扩展无限能力。

## 技术选型

| 层 | 选型 | 用途 |
|---|---|---|
| 应用框架 | Electron | 桌面窗口、系统托盘、原生菜单 |
| 系统核心 | Rust (napi-rs) | 编译为 `.node` 原生模块，承载性能敏感的系统调用 |
| 前端 | React + Tailwind CSS v4 | 搜索框 UI、插件 UI |
| 设计系统 | `@szybko/design-system` | 公共 Token、图标(lucide-react)、组件(Radix 原语包装) |
| 工具库 | dayjs, uuid, zustand | 日期、ID 生成、轻量状态 |
| 项目组织 | pnpm monorepo workspace | 统一管理所有包 |
| 打包分发 | electron-builder | 构建安装包、自动更新 |

## 核心原则

1. **所有功能都是插件** — 主渲染进程只提供一个搜索外壳，不内置任何业务功能（设置、剪贴板、计算器等都是插件）
2. **系统能力走适配器模式** — macOS 优先实现，后续扩展 Windows/Linux
3. **插件格式兼容 uTools** — `plugin.json` 字段完全对齐 uTools，后续目标是直接加载 uTools 插件
4. **主进程统一封装 Rust 能力** — 插件不直接接触 Rust 或 Node 原生能力，全部经主进程鉴权后调用

## 分层架构速览

```
渲染进程 (React)        ← 搜索框外壳，无业务功能
    ↕ IPC (contextBridge)
主进程 (Node/TS)        ← 窗口管理、插件运行时、权限校验、Rust 桥接
    ↕ 直接函数调用
Rust 核心 (napi-rs)     ← 文件索引、模糊搜索、剪贴板监控、屏幕取色
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

AI 执行顺序：`04 → 02 → 03 → 07 → 05`，遇到类型/接口疑问时回查 `02/03/06`。
