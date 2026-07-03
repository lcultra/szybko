# 前端架构重构 Implementation Plan

> **Goal:** 配合后端核心抽象精炼（RuntimeHost 接口、状态机双轴、新 IPC 合约），同步重构前端的目录架构、概念模型和 IPC 类型安全，保证前后端一致且可持续演进。
>
> **与后端计划的关系：** 前端独立重构，不改后端代码。F-1 ~ F-3 不依赖后端，可立即执行；F-4 需后端 Phase 2（IPC 合约更新）就绪后做。
>
> **Required reading:** 后端计划 `2026-07-03-core-abstraction-refinement.md`

**Architecture:**
- `packages/shell` — UI 呈现和用户交互，保持零 Electron 依赖
- `packages/shared` — IPC 合约类型是前后端的唯一契约
- `apps/desktop/src/preload` — API 适配层，桥接 Electron IPC 和前端 API

**Tech Stack:** Electron 43, pnpm monorepo, TypeScript 5.x, Zustand, React 19

## Global Constraints

- 不解耦 shell 的 `hostType` 属性和后端 host type 的概念一致
- IPC 合约类型必须从 `unknown` 收敛到具体 payload 类型，shell 不再使用 `any`
- 每步可独立合入，不破坏现有功能
- 每步通过 `pnpm -r run typecheck`
- 每步可回退

---

## 最终目录结构

```
packages/shell/src/
├── index.ts
├── global.d.ts
│
├── types/                        # Shell 自有业务类型
│   └── index.ts
│
├── services/                     # IPC 抽象层（对标后端 RuntimeCoordinator）
│   └── plugin-runtime.ts
│
├── stores/
│   ├── app-store.ts              # UI 状态（search, results, selectedIndex）
│   └── runtime-store.ts          # 插件运行时状态（RuntimeSlot）
│
├── hooks/
│   ├── usePluginRuntime.ts       # 封装 IPC 事件 → store 更新
│   └── useSearch.ts              # 从 pages/shell/hooks/ 提升
│
├── components/
│   ├── SurfaceFrame.tsx
│   └── plugin/                   # 插件相关组件分组
│       ├── PluginView.tsx
│       ├── PluginHeader.tsx
│       └── PluginScene.tsx
│
└── pages/
    ├── shell/
    │   ├── Shell.tsx
    │   ├── SearchBar.tsx
    │   ├── ResultList.tsx
    │   ├── ResultItem.tsx
    │   └── hooks/
    │       ├── useKeyboard.ts
    │       └── useWindowHeight.ts
    └── floating/
        └── FloatingApp.tsx
```

---

## 文件结构映射

### F-1 后（概念统一：`detached` → `floating`）

| 文件 | 改动 |
|------|------|
| `packages/shared/src/api/internal.ts` | `showPluginMenu` 的 `variant` 类型 → `hostType` |
| `packages/shell/src/pages/shell/Shell.tsx` | `PluginView` 不用传 `variant`（默认 `'launcher'` 不变） |
| `packages/shell/src/pages/detached/` → `floating/` | **目录改名** |
| `packages/shell/src/pages/detached/DetachedApp.tsx` → `floating/FloatingApp.tsx` | **文件改名**，组件名 `FloatingApp`，`variant="detached"` → `hostType="floating"` |
| `packages/shell/src/components/PluginView.tsx` | `variant` → `hostType`，类型 `'launcher' \| 'floating'` |
| `packages/shell/src/components/PluginHeader.tsx` | `variant` → `hostType` |
| `packages/shell/src/index.ts` | export `FloatingApp`（保留 `DetachedApp` 别名兼容） |

### F-2 后（目录架构升级）

| 文件 | 改动 |
|------|------|
| `packages/shell/src/types/index.ts` | **新建** shell 自有类型 |
| `packages/shell/src/services/` | **新建** 目录 |
| `packages/shell/src/stores/runtime-store.ts` | **新建** 从 app-store 拆出 |
| `packages/shell/src/hooks/usePluginRuntime.ts` | **新建** |
| `packages/shell/src/hooks/useSearch.ts` | **移动** 从 `pages/shell/hooks/` 提升 |
| `packages/shell/src/components/plugin/` | **新建** 目录，PluginView/PluginHeader/PluginScene 迁入 |
| `packages/shell/src/components/PluginView.tsx` | **移动** 到 `components/plugin/` |
| `packages/shell/src/components/PluginHeader.tsx` | **移动** 到 `components/plugin/` |
| `packages/shell/src/components/PluginScene.tsx` | **移动** 到 `components/plugin/` |
| `packages/shell/src/pages/shell/hooks/useSearch.ts` | **删除**（已提升） |

### F-3 后（架构抽象：Service + Hook + Store）

| 文件 | 改动 |
|------|------|
| `packages/shell/src/services/plugin-runtime.ts` | **新建** `PluginRuntimeService` |
| `packages/shell/src/types/index.ts` | **新增** `RuntimeSlot`, `HostType` 类型 |
| `packages/shell/src/stores/runtime-store.ts` | **新建** `useRuntimeStore` |
| `packages/shell/src/hooks/usePluginRuntime.ts` | **新建** |
| `packages/shell/src/stores/app-store.ts` | **精简** 移除 runtime 字段，只保留 UI 状态 |
| `packages/shell/src/pages/shell/Shell.tsx` | **重构** 使用 `usePluginRuntime` 替代 inline IPC |
| `packages/shell/src/components/plugin/PluginHeader.tsx` | **重构** 使用 `PluginRuntimeService` 替代 `window.szybkoInternal` |
| `packages/shell/src/pages/floating/FloatingApp.tsx` | **重构** 使用 `usePluginRuntime` |
| `packages/shell/src/pages/shell/hooks/useSearch.ts` | 已提升到 `hooks/useSearch.ts`（F-2），无需再改 |

### F-4 后（IPC 类型化 + Preload 补全）— 需后端 Phase 2

| 文件 | 改动 |
|------|------|
| `packages/shared/src/ipc/contract.ts` | `PLUGIN_RUNTIME_STATE` / `PLUGIN_ENTER` 从 `unknown` 改为具体类型；新增 `PluginOutPayload` |
| `packages/shared/src/runtime/types.ts` | 新增 `PluginEnterPayload`、`RuntimeStatePayload` 可序列化类型 |
| `packages/shared/src/api/plugin.ts` | 回调类型从 `unknown` → 具体 payload 类型 |
| `packages/shared/src/ipc/channels.ts` | 补 `PLUGIN_OUT` |
| `packages/shell/src/stores/runtime-store.ts` | IPC 事件处理从 `any` 升级为具体类型 |
| `packages/shell/src/hooks/usePluginRuntime.ts` | 从 `any` 升级为具体类型 |
| `apps/desktop/src/preload/api/plugin-lifecycle.ts` | 新增 `onPluginOut` |

---

## F-1：概念统一 — `detached` → `floating`

后端 Phase 2 将 host type 统一为 `'launcher' | 'floating'`，但前端当前用 `'launcher' | 'detached'`。解除这个错位。

**Note:** `Shell.tsx` 和 `useKeyboard.ts` 没有直接传 `variant` 给 `PluginView`，所以只需要改组件定义和 DetachedApp。

### Task F-1.1：更新 PluginView / PluginHeader 的 prop

**Files:**
- Modify: `packages/shell/src/components/PluginView.tsx`
- Modify: `packages/shell/src/components/PluginHeader.tsx`

- [ ] **Step 1: PluginView.tsx — variant → hostType**

```typescript
interface PluginViewProps {
    hostType?: 'launcher' | 'floating';
}

export function PluginView({ hostType = 'launcher' }: PluginViewProps) {
    return (
        <div className="flex flex-col">
            <PluginHeader hostType={hostType} />
            <div className="flex-1">
                <PluginScene />
            </div>
        </div>
    );
}
```

- [ ] **Step 2: PluginHeader.tsx — variant → hostType + 逻辑更新**

```typescript
interface PluginHeaderProps {
    hostType?: 'launcher' | 'floating';
}

export function PluginHeader({ hostType = 'launcher' }: PluginHeaderProps) {
    const isFloating = hostType === 'floating';
    // 替换所有 isDetached → isFloating, variant → hostType
}
```

- [ ] **Step 3: 类型检查**

```bash
pnpm -r run typecheck 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/shell/src/components/PluginView.tsx packages/shell/src/components/PluginHeader.tsx
git commit -m "refactor: unify PluginHeader/PluginView variant -> hostType"
```

---

### Task F-1.2：重命名 DetachedApp → FloatingApp

**Files:**
- Create: `packages/shell/src/pages/floating/FloatingApp.tsx`
- Delete: `packages/shell/src/pages/detached/DetachedApp.tsx`
- Modify: `packages/shell/src/index.ts`

- [ ] **Step 1: 创建 FloatingApp.tsx**（从 DetachedApp 复制，改组件名 + hostType）

```typescript
export function FloatingApp() {
    // 同 DetachedApp，但组件名改为 FloatingApp
    // <PluginView hostType="floating" />
}
```

- [ ] **Step 2: 更新 index.ts**

```typescript
export { FloatingApp } from './pages/floating/FloatingApp';
// 保留兼容别名
export { FloatingApp as DetachedApp } from './pages/floating/FloatingApp';
```

- [ ] **Step 3: 删除旧文件 + 清理**

```bash
git rm packages/shell/src/pages/detached/DetachedApp.tsx
rmdir packages/shell/src/pages/detached/
```

- [ ] **Step 4: 更新引用**（如有其他位置引用 DetachedApp）

```bash
grep -r 'DetachedApp' apps/desktop/src/ --include='*.ts' --include='*.tsx'
```

- [ ] **Step 5: 类型检查 + Commit**

```bash
pnpm -r run typecheck 2>&1
git add packages/shell/src/pages/floating/FloatingApp.tsx packages/shell/src/index.ts
git rm packages/shell/src/pages/detached/DetachedApp.tsx
git commit -m "refactor: rename DetachedApp to FloatingApp"
```

---

### Task F-1.3：更新 SzybkoInternalApi 的 showPluginMenu

**Files:**
- Modify: `packages/shared/src/api/internal.ts`
- Modify: `apps/desktop/src/preload/api/window.ts`
- Modify: `packages/shell/src/components/PluginHeader.tsx`

- [ ] **Step 1: 修改类型**

```typescript
// shared/api/internal.ts
showPluginMenu: (runtimeId: string, hostType?: 'launcher' | 'floating') => Promise<{ ok: boolean }>;
```

- [ ] **Step 2: preload 映射（IPC wire 层保留 variant 字段名）**

```typescript
// preload/api/window.ts
showPluginMenu: (runtimeId, hostType) => invoke(IPC.SHOW_PLUGIN_MENU)({ runtimeId, variant: hostType }),
```

- [ ] **Step 3: PluginHeader 调用处同步**

```typescript
window.szybkoInternal?.showPluginMenu(activeRuntimeId, hostType);
```

- [ ] **Step 4: 类型检查 + Commit**

```bash
pnpm -r run typecheck 2>&1
git add packages/shared/src/api/internal.ts apps/desktop/src/preload/api/window.ts packages/shell/src/components/PluginHeader.tsx
git commit -m "refactor: sync showPluginMenu parameter name with hostType"
```

---

### F-1 验证清单

| 检查 | 命令 |
|------|------|
| 类型检查 | `pnpm -r run typecheck` |
| 搜索 → 打开插件 | 手动 |
| Escape 隐藏 | 手动 |
| 分离到浮动窗口 | 右键菜单 → 分离 → 窗口正常打开 |
| 关闭浮动窗口 | 窗口关闭，无残留 |
| `variant.*detached` 无残留 | `grep -rnE "'detached'|isDetached" packages/shell/src/ packages/shared/src/api/` — 空 |
| `DetachedApp` 无残留 | `grep -rn 'DetachedApp' packages/shell/src/ apps/desktop/src/` — 只在别名中 |

---

## F-2：目录架构升级

纯目录移动 + 新建空文件，无运行时行为变化。

### Task F-2.1：新建目录结构 + 移动组件文件

**Files:**
- Create: `packages/shell/src/types/`
- Create: `packages/shell/src/services/`
- Create: `packages/shell/src/hooks/`
- Create: `packages/shell/src/components/plugin/`
- Move: `packages/shell/src/components/PluginView.tsx` → `components/plugin/PluginView.tsx`
- Move: `packages/shell/src/components/PluginHeader.tsx` → `components/plugin/PluginHeader.tsx`
- Move: `packages/shell/src/components/PluginScene.tsx` → `components/plugin/PluginScene.tsx`
- Move: `packages/shell/src/pages/shell/hooks/useSearch.ts` → `hooks/useSearch.ts`
- Modify: `packages/shell/src/index.ts`（更新 export 路径）
- Modify: 所有引用被移动文件的 import 路径

**方法建议：**

使用 `git mv` 确保 git 识别移动：

```bash
mkdir -p packages/shell/src/{types,services,hooks,components/plugin}

git mv packages/shell/src/components/PluginView.tsx packages/shell/src/components/plugin/
git mv packages/shell/src/components/PluginHeader.tsx packages/shell/src/components/plugin/
git mv packages/shell/src/components/PluginScene.tsx packages/shell/src/components/plugin/

git mv packages/shell/src/pages/shell/hooks/useSearch.ts packages/shell/src/hooks/
```

- [ ] **Step 1: 按上述命令移动文件**
- [ ] **Step 2: 更新所有 import 路径**

```bash
# 受影响文件预估
packages/shell/src/index.ts               # 可能未直接引用
packages/shell/src/pages/shell/Shell.tsx   # import PluginView
packages/shell/src/components/PluginView.tsx   # import PluginHeader, PluginScene
packages/shell/src/pages/floating/FloatingApp.tsx  # import PluginView
packages/shell/src/pages/shell/hooks/useSearch.ts  # 已移走
```

- [ ] **Step 3: 新建空 placeholder 文件供后续 F-3 填充**

```typescript
// packages/shell/src/types/index.ts
export type HostType = 'launcher' | 'floating';
```

```typescript
// packages/shell/src/hooks/usePluginRuntime.ts
// Placeholder — F-3 实现
```

```typescript
// packages/shell/src/services/plugin-runtime.ts
// Placeholder — F-3 实现
```

- [ ] **Step 4: 类型检查**

```bash
pnpm -r run typecheck 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add packages/shell/
git commit -m "refactor: restructure shell directory layout

- Move plugin components to components/plugin/
- Lift useSearch hook to hooks/ (shared across pages)
- Create types/, services/ directories (F-3 placeholders)
- No behavior changes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### F-2 验证清单

| 检查 | 命令 |
|------|------|
| 类型检查 | `pnpm -r run typecheck` |
| 无 import 断链 | `pnpm -r run build 2>&1` |
| 旧路径无残留 | `ls packages/shell/src/components/PluginView.tsx` — expected: 不存在 |
| 新路径存在 | `ls packages/shell/src/components/plugin/PluginView.tsx` — expected: 存在 |

---

## F-3：架构抽象 — Service + RuntimeStore + usePluginRuntime

引入服务层和 store 拆分，消除 IPC 调用在前端代码中的散落。

### Task F-3.1：新建 PluginRuntimeService

**Files:**
- Modify: `packages/shell/src/services/plugin-runtime.ts`（从 placeholder 填充）
- Modify: `packages/shell/src/types/index.ts`（补充 RuntimeSlot）

- [ ] **Step 1: 定义 RuntimeSlot 类型**

```typescript
// packages/shell/src/types/index.ts
import type { LoadState, MountState } from '@szybko/shared';

export type HostType = 'launcher' | 'floating';

/** 当前激活的插件运行时快照 — 镜像后端 RuntimeInfo 的可序列化子集 */
export interface RuntimeSlot {
    runtimeId: string | null;
    pluginId: string | null;
    pluginName: string;
    featureExplain: string;
    loadState: LoadState;
    mountState: MountState;
}
```

- [ ] **Step 2: 创建 PluginRuntimeService**

```typescript
// packages/shell/src/services/plugin-runtime.ts

/**
 * 插件运行时操作服务层。
 * 所有针对插件运行时的 IPC 调用集中在此，
 * 组件和页面不直接调用 window.szybkoInternal。
 */
export const PluginRuntimeService = {
    hide(runtimeId: string): Promise<{ ok: boolean }> {
        return window.szybkoInternal?.hidePlugin(runtimeId) ?? Promise.resolve({ ok: false });
    },

    destroy(runtimeId: string): Promise<{ ok: boolean }> {
        return window.szybkoInternal?.destroyPlugin(runtimeId) ?? Promise.resolve({ ok: false });
    },

    pin(runtimeId: string, pin: boolean): Promise<{ ok: boolean }> {
        return window.szybkoInternal?.pinPlugin(runtimeId, pin) ?? Promise.resolve({ ok: false });
    },

    showMenu(runtimeId: string, hostType: HostType): Promise<{ ok: boolean }> {
        return window.szybkoInternal?.showPluginMenu(runtimeId, hostType) ?? Promise.resolve({ ok: false });
    },

    switchHost(pluginId: string, targetHost: HostType): Promise<{ ok: boolean; hostId?: string; error?: string }> {
        return window.szybko?.switchHost(pluginId, targetHost) ?? Promise.resolve({ ok: false });
    },
};
```

- [ ] **Step 3: 类型检查**

```bash
pnpm -r run typecheck 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/shell/src/services/plugin-runtime.ts packages/shell/src/types/index.ts
git commit -m "refactor: add PluginRuntimeService and RuntimeSlot types

- PluginRuntimeService centralizes all IPC calls to plugin runtime
- RuntimeSlot type mirrors backend RuntimeInfo for frontend store
- No behavior changes, existing code still calls window.szybkoInternal directly

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task F-3.2：从 AppStore 拆出 RuntimeStore

**Files:**
- Create: `packages/shell/src/stores/runtime-store.ts`
- Modify: `packages/shell/src/stores/app-store.ts`（精简，移除 runtime 字段）
- Modify: `packages/shell/src/hooks/usePluginRuntime.ts`（填充实现）
- Modify: `packages/shell/src/pages/shell/Shell.tsx`（改用 usePluginRuntime + RuntimeStore）

- [ ] **Step 1: 创建 RuntimeStore**

```typescript
// packages/shell/src/stores/runtime-store.ts
import type { RuntimeSlot } from '../types';
import { create } from 'zustand';

interface RuntimeStore {
    slot: RuntimeSlot;
    setSlot: (slot: Partial<RuntimeSlot>) => void;
    clearSlot: () => void;
}

const INITIAL_SLOT: RuntimeSlot = {
    runtimeId: null,
    pluginId: null,
    pluginName: '',
    featureExplain: '',
    loadState: 'loading',
    mountState: 'detached',
};

export const useRuntimeStore = create<RuntimeStore>(set => ({
    slot: INITIAL_SLOT,
    setSlot: (partial) => set(s => ({ slot: { ...s.slot, ...partial } })),
    clearSlot: () => set({ slot: INITIAL_SLOT }),
}));
```

- [ ] **Step 2: 精简 AppStore**

```typescript
// packages/shell/src/stores/app-store.ts
import { create } from 'zustand';

type AppState = 'idle' | 'searching' | 'plugin';

interface AppStore {
    state: AppState;
    query: string;
    results: SearchResult[];
    selectedIndex: number;
    // 移除了 activePluginId / activePluginName / activeFeatureExplain / activeRuntimeId
    // 这些现在在 RuntimeStore 中

    setQuery: (query: string) => void;
    setResults: (results: SearchResult[]) => void;
    setSelectedIndex: (index: number) => void;
    setState: (state: AppState) => void;
}
```

- [ ] **Step 3: 填充 usePluginRuntime hook**

```typescript
// packages/shell/src/hooks/usePluginRuntime.ts
import { useEffect } from 'react';
import { useRuntimeStore } from '../stores/runtime-store';
import { useAppStore } from '../stores/app-store';

/**
 * 插件运行时生命周期管理 hook。
 * 订阅 onRuntimeStateChanged → 同步更新 RuntimeStore + AppStore state。
 * 提供 hide/destroy/pin/showMenu 便捷方法。
 */
export function usePluginRuntime() {
    const setSlot = useRuntimeStore(s => s.setSlot);
    const clearSlot = useRuntimeStore(s => s.clearSlot);
    const setAppState = useAppStore(s => s.setState);

    useEffect(() => {
        // 监听后端状态变更
        const cleanup = window.szybko?.onRuntimeStateChanged?.((payload: any) => {
            if (payload.state === 'attached') {
                setSlot({
                    runtimeId: payload.runtimeId,
                    pluginId: payload.pluginId,
                    pluginName: payload.pluginName ?? '',
                    featureExplain: payload.featureExplain ?? '',
                    loadState: payload.loadState ?? 'loaded',
                    mountState: payload.mountState ?? 'attached',
                });
                setAppState('plugin');
            } else if (payload.state === 'detached' || payload.state === 'destroyed') {
                clearSlot();
                setAppState('idle');
            }
        });
        return () => cleanup?.();
    }, [setSlot, clearSlot, setAppState]);

    return {
        // 从 store 暴露必要数据
        slot: useRuntimeStore(s => s.slot),
    };
}
```

- [ ] **Step 4: 重构 Shell.tsx**

```typescript
// packages/shell/src/pages/shell/Shell.tsx
// 移除内联的 useEffect(onRuntimeStateChanged)
// 改用：
const { slot } = usePluginRuntime();
```

- [ ] **Step 5: 更新 PluginHeader.tsx 使用 PluginRuntimeService**

```typescript
// packages/shell/src/components/plugin/PluginHeader.tsx
import { PluginRuntimeService } from '../../services/plugin-runtime';
import { useRuntimeStore } from '../../stores/runtime-store';

// 替换 window.szybkoInternal?.hidePlugin → PluginRuntimeService.hide
// 替换 window.szybkoInternal?.destroyPlugin → PluginRuntimeService.destroy
// 替换 window.szybkoInternal?.pinPlugin → PluginRuntimeService.pin
// 替换 window.szybkoInternal?.showPluginMenu → PluginRuntimeService.showMenu
```

- [ ] **Step 6: 更新 FloatingApp.tsx 使用 RuntimeStore**

```typescript
// packages/shell/src/pages/floating/FloatingApp.tsx
import { useRuntimeStore } from '../../stores/runtime-store';

export function FloatingApp() {
    const { setSlot } = useRuntimeStore(s => ({ setSlot: s.setSlot }));

    useEffect(() => {
        setSlot({
            pluginId: initialPluginId,
            runtimeId: initialRuntimeId,
            pluginName: initialName,
            featureExplain: initialExplain,
            loadState: 'loaded',
            mountState: 'attached',
        });
    }, []);
    // ... rest
}
```

- [ ] **Step 7: 类型检查**

```bash
pnpm -r run typecheck 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add packages/shell/src/stores/runtime-store.ts packages/shell/src/stores/app-store.ts packages/shell/src/hooks/usePluginRuntime.ts packages/shell/src/pages/shell/Shell.tsx packages/shell/src/components/plugin/PluginHeader.tsx packages/shell/src/pages/floating/FloatingApp.tsx
git commit -m "refactor: extract RuntimeStore, PluginRuntimeService, usePluginRuntime

- Split runtime state from app-store into runtime-store (RuntimeSlot)
- Add PluginRuntimeService to centralize IPC calls
- Add usePluginRuntime hook to encapsulate runtime lifecycle
- Shell.tsx and PluginHeader.tsx now use abstractions instead of direct IPC
- No behavior changes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### F-3 验证清单

| 检查 | 命令 |
|------|------|
| 类型检查 | `pnpm -r run typecheck` |
| 搜索 → 打开插件 | 手动 |
| Escape 隐藏 | 手动 |
| 分离到浮动窗口 | 手动 |
| 关闭浮动窗口 | 手动 |
| `window.szybkoInternal` 不在组件中出现 | `grep -rn 'window\\.szybkoInternal' packages/shell/src/components/ packages/shell/src/pages/` — 空（仅 services/ 和 hooks/ 中出现） |
| `window.szybko` 不在组件中出现 | `grep -rn 'window\\.szybko\\.onRuntimeStateChanged' packages/shell/src/components/ packages/shell/src/pages/` — 空 |

---

## F-4：IPC 类型化 + Preload 补全

**Prerequisites:** 后端 Phase 2 已部署，IPC handler 已发送新字段。

### Task F-4.1：补全 IPC contract 类型

**Files:**
- Modify: `packages/shared/src/runtime/types.ts`
- Modify: `packages/shared/src/ipc/contract.ts`
- Modify: `packages/shared/src/api/plugin.ts`

- [ ] **Step 1: shared/runtime/types.ts — 新增 payload 类型**

```typescript
export interface RuntimeStatePayload {
    runtimeId: string;
    pluginId: string;
    state: string;                    // 旧字段
    pluginName?: string;             // 旧字段
    featureExplain?: string;         // 旧字段
    mountState?: MountState;         // 新字段
    loadState?: LoadState;           // 新字段
}

export interface PluginEnterPayload {
    pluginId: string;
    featureCode?: string;
    featureExplain?: string;
}

export interface PluginOutPayload {
    pluginId: string;
    reason: 'hide' | 'destroy';
}
```

- [ ] **Step 2: shared/src/ipc/contract.ts — unknown → 具体类型**

```typescript
export interface IpcMainToRendererEventContract {
    // ...
    [IPC.PLUGIN_RUNTIME_STATE]: RuntimeStatePayload;
    [IPC.PLUGIN_ENTER]: PluginEnterPayload;
    [IPC.PLUGIN_OUT]: PluginOutPayload;
}
```

- [ ] **Step 3: shared/src/api/plugin.ts — 回调类型从 unknown 升级**

```typescript
export interface SzybkoPluginApi {
    onRuntimeStateChanged: (cb: (payload: RuntimeStatePayload) => void) => () => void;
    onPluginEnter: (cb: (payload: PluginEnterPayload) => void) => () => void;
}
```

- [ ] **Step 4: 验证 shared 无 Electron leak**

```bash
grep -r 'electron' packages/shared/src/ --include='*.ts' || echo "clean"
pnpm -r run typecheck 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/runtime/types.ts packages/shared/src/ipc/contract.ts packages/shared/src/api/plugin.ts
git commit -m "refactor: type IPC payloads from unknown to concrete types"
```

---

### Task F-4.2：升级 usePluginRuntime 类型安全

**Files:**
- Modify: `packages/shell/src/hooks/usePluginRuntime.ts`

- [ ] **Step 1: 将 `payload: any` 改为 `payload: RuntimeStatePayload`**

```typescript
import type { RuntimeStatePayload } from '@szybko/shared';

useEffect(() => {
    const cleanup = window.szybko?.onRuntimeStateChanged?.((payload: RuntimeStatePayload) => {
        // payload 现在是类型安全的
    });
}, []);
```

- [ ] **Step 2: 类型检查**

```bash
pnpm -r run typecheck 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add packages/shell/src/hooks/usePluginRuntime.ts
git commit -m "refactor: usePluginRuntime now uses typed RuntimeStatePayload"
```

---

### Task F-4.3：Preload 补全 onPluginOut

**Files:**
- Modify: `packages/shared/src/api/plugin.ts`
- Modify: `apps/desktop/src/preload/api/plugin-lifecycle.ts`

- [ ] **Step 1: shared/api/plugin.ts 补 onPluginOut**

```typescript
export interface SzybkoPluginApi {
    // ...
    onPluginOut: (cb: (payload: PluginOutPayload) => void) => () => void;
}
```

- [ ] **Step 2: preload 补实现**

```typescript
// apps/desktop/src/preload/api/plugin-lifecycle.ts
export function createPluginLifecycleApi() {
    return {
        onRuntimeStateChanged: on(IPC.PLUGIN_RUNTIME_STATE),
        onPluginOut: on(IPC.PLUGIN_OUT),
        // ...
    };
}
```

- [ ] **Step 3: 类型检查 + Commit**

```bash
pnpm -r run typecheck 2>&1
git add packages/shared/src/api/plugin.ts apps/desktop/src/preload/api/plugin-lifecycle.ts
git commit -m "feat: add onPluginOut to plugin preload API"
```

---

### F-4 验证清单

| 检查 | 命令 |
|------|------|
| 类型检查 | `pnpm -r run typecheck` |
| Shell 无 `any` payload | `grep 'payload.*any\|: any' packages/shell/src/hooks/usePluginRuntime.ts` — 空 |
| IPC 合约无 `unknown` | `grep 'unknown' packages/shared/src/ipc/contract.ts` — 仅用于非相关通道 |
| onPluginOut 可用 | 插件 preload 能订阅 |

---

## 完整验证命令集

```bash
# 每次 typecheck
pnpm -r run typecheck

# 手动回归清单
echo "1. 搜索→打开插件"
echo "2. Escape 隐藏"
echo "3. 右键菜单→分离"
echo "4. 浮动窗口 pin"
echo "5. 关闭浮动窗口"
echo "6. 再次打开同一插件"
echo "7. 打开不同插件（切换）"

# 概念残留检查
echo "--- variant/detached 残留 ---"
grep -rnE "'detached'|isDetached" packages/shell/src/ packages/shared/src/api/ 2>/dev/null || echo "clean"
echo "--- DetachedApp 残留 ---"
grep -rn 'DetachedApp' packages/shell/src/ apps/desktop/src/ 2>/dev/null || echo "clean"
echo "--- any payload 残留 ---"
grep -rn 'payload.*: any' packages/shell/src/ 2>/dev/null || echo "clean"
echo "--- window.szybkoInternal 在组件中 ---"
grep -rn 'window\.szybkoInternal' packages/shell/src/components/ packages/shell/src/pages/ 2>/dev/null || echo "clean"
```
