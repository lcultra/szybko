# Workspace Architecture Migration Design

- **日期**: 2026-07-06
- **状态**: 设计稿
- **涉及范围**: `packages/design-system`, `packages/core-rust`, `packages/plugin-sdk`, `packages/shell`, `apps/desktop`

---

## 1. 背景

当前仓库已经是 pnpm workspace，并且具备清晰的平台雏形：

- `apps/desktop` 承载 Electron 壳层、main/preload/renderer 入口和打包配置。
- `packages/host` 承载后台平台逻辑，包括插件目录、运行时、搜索、窗口宿主和持久化。
- `packages/shell` 承载主搜索框、浮动窗口、插件容器等 renderer 应用代码。
- `packages/design-system` 同时承载设计 token、全局 CSS 和基础 React 组件。
- `packages/plugin-sdk` 承载插件侧 API 类型。
- `packages/core-rust` 承载 napi-rs 原生能力。

这些边界已经接近目标架构，但包名和代码位置仍有几处认知成本：

1. `packages/shell` 实际只服务 desktop renderer，没有独立产品复用需求。
2. `design-system` 这个名字偏宽，当前职责更像官方 UI kit。
3. `core-rust` 暴露给 JS 侧时更应表达为 native capability package，而不是 Rust 实现细节。
4. `plugin-sdk` 后续会扩展为应用/插件安全边界与类型入口，`sdk` 名称更准确。

本设计将这些问题收敛为一次低风险结构迁移，不改变运行时行为。

---

## 2. 目标

- 将 renderer 应用代码从共享包迁回 Electron app 内部。
- 将基础包重命名为更贴近职责的名称。
- 保持 `packages/host` 作为后台平台内核，不把插件、搜索、窗口运行时逻辑塞回 `apps/desktop/src/main`。
- 保持当前 Electron app 结构，不拆成独立的 `apps/main` 和 `apps/renderer` workspace 包。
- 保持双 preload 行为不变，`sdk` 只做重命名和类型入口收敛，不在本轮迁入 preload 构建。

---

## 3. 最终结构

本轮迁移完成后的目标结构：

```text
apps/
└── desktop/
    ├── src/
    │   ├── main/                 # Electron main 入口，保持薄壳
    │   ├── preload/              # 现有 host/plugin 双 preload，本轮不迁移
    │   └── renderer/             # 原 packages/shell 源码迁入这里
    │       ├── components/
    │       ├── hooks/
    │       ├── pages/
    │       ├── services/
    │       ├── stores/
    │       ├── types/
    │       ├── main.tsx
    │       ├── floating.tsx
    │       └── main.css
    ├── electron.vite.config.ts
    ├── tsconfig.json
    ├── tsconfig.web.json
    └── package.json

packages/
├── host/                         # 后台平台内核，保留现有职责
├── shared/                       # IPC、manifest、跨进程类型契约
├── sdk/                          # 原 plugin-sdk，插件/API 类型入口
├── ui-kit/                       # 原 design-system，CSS tokens + React 基础组件
└── native/                       # 原 core-rust，napi-rs 原生能力
```

---

## 4. 迁移映射

### 4.1 包和目录重命名

| 当前路径 | 目标路径 | 当前包名 | 目标包名 |
|---|---|---|---|
| `packages/design-system` | `packages/ui-kit` | `@szybko/design-system` | `@szybko/ui-kit` |
| `packages/core-rust` | `packages/native` | `@szybko/core-rust` | `@szybko/native` |
| `packages/plugin-sdk` | `packages/sdk` | `@szybko/plugin-sdk` | `@szybko/sdk` |
| `packages/shell` | `apps/desktop/src/renderer` | `@szybko/shell` | 不再作为独立包存在 |

### 4.2 Import 更新

| 当前引用 | 目标引用 |
|---|---|
| `@szybko/design-system` | `@szybko/ui-kit` |
| `@szybko/design-system/index.css` | `@szybko/ui-kit/index.css` |
| `@szybko/core-rust` | `@szybko/native` |
| `@szybko/plugin-sdk` | `@szybko/sdk` |
| `@szybko/shell` | `apps/desktop/src/renderer` 内部本地相对引用 |

`apps/desktop/src/renderer/main.tsx` 和 `floating.tsx` 不再从 `@szybko/shell` 导入 `mountMain` / `mountFloating`，而是直接挂载本地 renderer 应用组件。

---

## 5. 包边界设计

### 5.1 `apps/desktop`

`apps/desktop` 继续作为唯一 Electron app workspace 包。

职责：

- Electron main 入口和生命周期编排。
- Electron preload 构建入口。
- Desktop renderer 页面入口。
- Electron dev/build/preview 配置。
- 引用 `packages/host`, `packages/shared`, `packages/ui-kit`, `packages/sdk`。

不负责：

- 插件目录、运行时、搜索索引、窗口宿主的核心实现。这些继续属于 `packages/host`。
- 原生能力实现。这些继续属于 `packages/native`。

### 5.2 `packages/host`

`packages/host` 不参与本轮结构移动。

它继续作为后台平台内核，负责：

- 插件发现、安装同步和目录。
- 插件运行时生命周期。
- Runtime host 附着、迁移和状态发布。
- 搜索、指令目录和执行路由。
- 平台持久化。
- Electron 窗口和快捷键适配。

`apps/desktop/src/main/index.ts` 应保持薄壳，只做实例化和启动编排。

### 5.3 `packages/ui-kit`

`packages/ui-kit` 是原 `design-system` 的直接重命名。

本轮保留当前职责：

- CSS tokens。
- 全局基础样式。
- `initTheme`。
- 基础 React 组件，如 Button、Card、Input。

本轮不拆出独立 `packages/theme`。如果后续出现非 React 消费方或插件只需要 CSS token，可以再把 theme 从 ui-kit 中拆出。

### 5.4 `packages/native`

`packages/native` 是原 `core-rust` 的直接重命名。

JS 包名改为 `@szybko/native`，表达它是平台原生能力包。Rust crate 和 napi 二进制名本轮可以暂时保持 `szybko-core`，避免同时改变构建产物命名和加载路径。

如果后续需要对外发布或统一产物命名，再单独设计 crate/napi artifact rename。

### 5.5 `packages/sdk`

`packages/sdk` 是原 `plugin-sdk` 的直接重命名。

本轮职责：

- 暴露插件侧 API 类型。
- 暴露插件 manifest 和 feature 相关类型。
- 为后续 app/plugin window 类型分离预留位置。

本轮不做：

- 不迁移 `apps/desktop/src/preload`。
- 不改变 `contextBridge` 注入对象。
- 不新增权限模型。
- 不扩大 SDK 承诺面。

后续目标可以逐步演进为：

```text
packages/sdk/src/
├── types/
│   ├── app-window.d.ts
│   └── plugin-window.d.ts
├── api-core.ts
├── api-plugin.ts
├── app-preload.ts
└── plugin-preload.ts
```

但这个目标不属于本轮迁移。

---

## 6. Renderer 迁移设计

### 6.1 移动内容

`packages/shell/src` 下的 renderer 应用源码迁入 `apps/desktop/src/renderer`：

- `components/`
- `hooks/`
- `pages/`
- `services/`
- `stores/`
- `types/`
- `global.d.ts`
- `mount.tsx`
- 现有测试文件

迁移后可以保留 `mount.tsx`，但它应成为 desktop renderer 内部实现，不再作为 workspace 包导出。

### 6.2 Entry 调整

现有入口：

```typescript
import { mountMain } from '@szybko/shell';
import './main.css';

mountMain();
```

迁移后改为本地导入：

```typescript
import { mountMain } from './mount';
import './main.css';

mountMain();
```

`floating.tsx` 同理改为本地 `mountFloating`。

### 6.3 TypeScript 配置

`apps/desktop/tsconfig.web.json` 需要包含迁入后的 renderer 源码、React JSX、`vite/client` 类型和 renderer 全局 Window 类型。

根 `tsconfig.json` references 删除 `packages/shell`，保留：

- `packages/shared`
- `packages/host`
- `packages/ui-kit`
- `packages/sdk`
- `packages/native`
- `apps/desktop`
- `apps/desktop/tsconfig.web.json`
- `apps/desktop/tsconfig.node.json`

### 6.4 测试配置

`packages/shell` 原有 Vitest 配置需要迁移到 `apps/desktop`，或合并进 app 级测试配置。

验收要求是原 `ResultIcon.test.tsx` 继续可以执行，且测试引用路径不再依赖 `@szybko/shell`。

---

## 7. Workspace 和脚本调整

### 7.1 `pnpm-workspace.yaml`

保留：

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'plugins/**'
```

不需要新增 workspace pattern。

### 7.2 根脚本

根脚本保持语义不变：

- `dev`
- `build`
- `build:plugins`
- `dev:desktop`
- `dev:plugins`
- `typecheck`
- `lint`
- `check`

如果 `pnpm -r` 因删除 `packages/shell` 出现过滤差异，只更新引用，不改变脚本行为。

### 7.3 `apps/desktop/package.json`

更新依赖：

- 删除 `@szybko/shell`。
- `@szybko/design-system` 改为 `@szybko/ui-kit`。
- 如 desktop 直接消费 SDK 类型，则将 `@szybko/plugin-sdk` 改为 `@szybko/sdk`。

---

## 8. 非目标

本轮不做以下事情：

- 不拆 `apps/desktop` 为多个 workspace app。
- 不把 `packages/host` 合并进 `apps/desktop/src/main`。
- 不迁移 preload 到 `packages/sdk`。
- 不重写 IPC contract。
- 不改变插件生命周期、运行时迁移或搜索行为。
- 不拆出 `packages/theme`。
- 不新增插件市场、安全权限审核或签名机制。
- 不重命名 Rust crate 和 napi artifact，除非构建被包名变更阻断。

---

## 9. 风险和处理

### 9.1 Electron/Vite 输入路径

风险：renderer 代码移动后，`electron.vite.config.ts` 的 `index.html`、`floating.html` 和 preload 构建路径可能失效。

处理：迁移时只移动 renderer 内部源码，不改变 `src/renderer/index.html` 和 `src/renderer/floating.html` 的目标位置。

### 9.2 TypeScript project references

风险：删除 `packages/shell` 后，根 references 或 workspace 递归 typecheck 指向不存在包。

处理：同步更新根 `tsconfig.json`、package dependencies 和 lockfile。

### 9.3 Test 位置

风险：原 `packages/shell` 测试依赖包级 Vitest 配置。

处理：将测试配置迁移到 `apps/desktop`，保持测试文件随 renderer 源码一起移动。

### 9.4 Native build artifact

风险：`core-rust -> native` 后，napi 生成文件、`main/types` 路径或 Node require 路径变化。

处理：优先只改 npm 包名和目录名，保持 `lib/`、Rust crate name、napi name 不变。迁移后运行 native package build/typecheck 验证。

### 9.5 Plugin imports

风险：内置插件可能引用 `@szybko/design-system` 或 `@szybko/plugin-sdk`。

处理：全仓搜索并更新为 `@szybko/ui-kit`、`@szybko/sdk`。

---

## 10. 实施顺序

建议按以下顺序实施，降低回滚成本：

1. 重命名 `packages/core-rust` 为 `packages/native`，更新 `@szybko/core-rust` 引用。
2. 重命名 `packages/design-system` 为 `packages/ui-kit`，更新 UI/CSS 引用。
3. 重命名 `packages/plugin-sdk` 为 `packages/sdk`，更新类型引用。
4. 将 `packages/shell/src` 迁入 `apps/desktop/src/renderer`。
5. 删除 `packages/shell/package.json` 和相关 package references。
6. 更新 `apps/desktop` renderer entry、tsconfig、test config、package dependencies。
7. 更新 lockfile。
8. 跑验证命令并修复路径遗漏。

每一步应保持可单独 review，避免一次提交混合所有路径变化和行为改动。

---

## 11. 验收标准

迁移完成后必须满足：

1. `pnpm typecheck` 通过。
2. `pnpm lint` 通过。
3. `pnpm --filter @szybko/desktop build` 通过。
4. `pnpm --filter @szybko/native build` 通过，或明确记录当前平台无法构建的原因。
5. 原 renderer 测试继续通过。
6. `pnpm dev:desktop` 能启动主窗口。
7. 主搜索框、浮动窗口、插件 runtime attach/detach 行为不变。
8. 全仓不再出现旧包名引用：
   - `@szybko/design-system`
   - `@szybko/core-rust`
   - `@szybko/plugin-sdk`
   - `@szybko/shell`

---

## 12. 回滚方案

本轮迁移不改变数据结构和运行时协议，因此可以通过路径回滚恢复：

- `packages/native` 改回 `packages/core-rust`。
- `packages/ui-kit` 改回 `packages/design-system`。
- `packages/sdk` 改回 `packages/plugin-sdk`。
- `apps/desktop/src/renderer` 中迁入的 shell 源码移回 `packages/shell/src`。
- 恢复 package names、imports、tsconfig references 和 lockfile。

如果只在某一步失败，应优先回滚该步，而不是回滚全部迁移。

---

## 13. 后续演进

本轮完成后，可以单独评估三个后续方向：

1. `packages/sdk` 接管 app/plugin 双 preload 构建和 Window 类型声明。
2. 从 `packages/ui-kit` 中拆出独立 `packages/theme`，让插件可以只消费 CSS token。
3. 为 `packages/native` 建立多平台 artifact 发布和加载策略。

这些方向都依赖本轮结构稳定，但不阻塞本轮迁移。
