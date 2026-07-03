# 插件运行时端到端可见 MVP — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让插件从"搜索到结果"到"选中后显示在 Launcher 中"完整跑通

**Architecture:** WebContentsView 通过 `BrowserWindow.contentView.addChildView` 挂载到主窗口；Launcher 通过"占位 div + 主进程定 bounds"模式展示插件视图；RuntimeManager 协调激活/分离流程。

**Tech Stack:** Electron 43 (WebContentsView API), React 19, zustand, @szybko/shared

## 全局约束

- 新常量 `SEARCHBAR_HEIGHT = 68` 加在 `packages/shared/src/constants/window.ts` 中（与 `DEFAULT_WINDOW_WIDTH` 等并列）
- 插件目录从 `plugins/example-plugin` 移至 `plugins/built-in/example-plugin`
- 单例插件（`single: true`）复用已有 Runtime，不允许多实例
- WebContentsView 始终只有一个可见（attach 前先 detach）
- 窗口隐藏/关闭时不销毁 WebContentsView，保留状态

---

### Task 1: 添加 SEARCHBAR_HEIGHT 常量

**Files:**
- Modify: `packages/shared/src/constants/window.ts`
- Test: `pnpm typecheck`

**Interfaces:**
- Produces: `SEARCHBAR_HEIGHT = 68`（命名导出，re-export 链已存在）

- [ ] **Step 1: 添加常量**

```typescript
// packages/shared/src/constants/window.ts
export const DEFAULT_WINDOW_WIDTH = 820;
export const MIN_WINDOW_HEIGHT = 96;
export const MAX_WINDOW_HEIGHT = 520;
export const WINDOW_TOP_OFFSET_RATIO = 1 / 3;
export const SEARCHBAR_HEIGHT = 68;  // SearchBar 容器 height + padding
```

- [ ] **Step 2: 确认类型检查通过**

```bash
pnpm --filter @szybko/shared typecheck
```
Expected: EXIT CODE 0

- [ ] **Step 3: 提交**

```bash
git add packages/shared/src/constants/window.ts
git commit -m "feat(shared): add SEARCHBAR_HEIGHT constant"
```

---

### Task 2: 插件目录结构调整

**Files:**
- Move: `plugins/example-plugin` → `plugins/built-in/example-plugin`

**Context:** `PluginManager.scan()` 只扫描 `plugins/built-in/` 和 `plugins/user/`，example-plugin 在原位置不会被加载。

- [ ] **Step 1: 移动 example-plugin**

```bash
mkdir -p plugins/built-in
git mv plugins/example-plugin plugins/built-in/example-plugin
```

- [ ] **Step 2: 确认结构正确**

```bash
ls plugins/built-in/example-plugin/
```
Expected: `index.html  package.json  plugin.json  preload.js`

- [ ] **Step 3: 提交**

```bash
git add plugins/built-in/example-plugin plugins/example-plugin
git commit -m "chore: move example-plugin to plugins/built-in/ for PluginManager scan"
```

---

### Task 3: WindowManager — WebContentsView 管理

**Files:**
- Modify: `packages/host/src/window-manager.ts`
- Requires: Task 1 (SEARCHBAR_HEIGHT)

**Interfaces:**
- Produces:
  - `windowManager.attachPluginView(view: Electron.WebContentsView): void`
  - `windowManager.detachPluginView(): void`
  - `windowManager.updatePluginBounds(): void`（private）
  - `windowManager.resize(height)` 内部调用 `updatePluginBounds()`

- [ ] **Step 1: 在 window-manager.ts 中添加 import 和方法**

添加 import：
```typescript
import { DEFAULT_WINDOW_WIDTH, SEARCHBAR_HEIGHT } from '@szybko/shared';
import { BrowserWindow, type WebContentsView, screen } from 'electron';
```

添加属性到类：
```typescript
export class WindowManager {
    private window: BrowserWindow | null = null;
    private hosts: Map<string, Host> = new Map();
    private pluginView: WebContentsView | null = null;  // NEW
```

添加方法：
```typescript
    // ── Plugin WebContentsView management ─────────────────────────

    /** 挂载插件 View 到主窗口搜索栏下方 */
    attachPluginView(view: WebContentsView): void {
        this.detachPluginView();
        this.window?.contentView.addChildView(view);
        this.pluginView = view;
        this.updatePluginBounds();
    }

    /** 从主窗口移除插件 View（不销毁） */
    detachPluginView(): void {
        if (this.pluginView && this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(this.pluginView);
        }
        this.pluginView = null;
    }

    /** 将插件 View 定位到搜索栏下方的区域 */
    private updatePluginBounds(): void {
        if (!this.pluginView || !this.window) return;
        const [, height] = this.window.getSize();
        this.pluginView.setBounds({
            x: 0,
            y: SEARCHBAR_HEIGHT,
            width: DEFAULT_WINDOW_WIDTH,
            height: Math.max(height - SEARCHBAR_HEIGHT, 0),
        });
    }
```

修改 `resize()` 以同步更新 view bounds：
```typescript
    resize(height: number) {
        const clamped = Math.min(Math.max(height, MIN_WINDOW_HEIGHT), MAX_WINDOW_HEIGHT);
        this.window?.setSize(DEFAULT_WINDOW_WIDTH, clamped);
        this.updatePluginBounds();
    }
```

- [ ] **Step 2: 确认类型检查通过**

```bash
pnpm --filter @szybko/host typecheck
```
Expected: EXIT CODE 0

- [ ] **Step 3: 提交**

```bash
git add packages/host/src/window-manager.ts
git commit -m "feat(host): add WebContentsView management (attach/detach/bounds) to WindowManager"
```

---

### Task 4: RuntimeManager — 激活/分离/查找

**Files:**
- Modify: `packages/host/src/runtime-manager.ts`
- Requires: Task 3 (WindowManager view management)

**Interfaces:**
- Produces:
  - `runtimeManager.attachToWindow(runtimeId: string): void`
  - `runtimeManager.detachFromWindow(runtimeId: string): void`
  - `runtimeManager.getOrCreate(pluginId: string): PluginRuntime | null`
  - create 中监听 `did-finish-load` → set state to `'activated'`

- [ ] **Step 1: 更新 runtime-manager.ts**

添加 `WebContentsView` 到 import（WebContentsView 来自 electron，但 entry 中存的是 view 属性。当前 RuntimeEntry 已有 view: WebContentsView）：

```typescript
import { IPC } from '@szybko/shared';
import { WebContentsView } from 'electron';  // 已有的 import（检查是否已导入）
```

在 `create()` 方法中，添加 WebContents `did-finish-load` 监听以设置 activated 状态（在 `loadFile` 调用之后）：

```typescript
    create(pluginId: string): PluginRuntime | null {
        // ... 现有代码 ...

        // 监听加载完成 → 设置为 activated
        view.webContents.on('did-finish-load', () => {
            runtime.state = 'activated';
        });

        view.webContents.loadFile(indexPath);
        return runtime;
    }
```

新增方法：
```typescript
    // ── Activation / Deactivation ───────────────────────────

    /** 激活插件：挂载 view 到窗口，通知 Launcher 和插件自身 */
    attachToWindow(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) {
            console.warn(`[RuntimeManager] attachToWindow: runtime ${runtimeId} not found`);
            return;
        }

        this.windowManager.attachPluginView(entry.view);
        entry.runtime.state = 'attached';
        entry.runtime.host = this.windowManager.getHost('launcher') ?? null;
        // Note: launcher host 创建窗口时注册。确保持续可用。

        // 通知渲染进程状态变更
        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
                runtimeId: entry.runtime.id,
                pluginId: entry.runtime.pluginId,
                state: 'attached',
            });
        }

        // 通知插件进入
        entry.view.webContents.send(IPC.PLUGIN_ENTER, {});
    }

    /** 分离插件：从窗口移除 view，保留 Runtime 状态 */
    detachFromWindow(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) return;

        this.windowManager.detachPluginView();
        entry.runtime.state = 'detached';
        entry.runtime.host = null;
    }

    /** 获取或创建 Runtime — 先查找已有实例，没有再创建 */
    getOrCreate(pluginId: string): PluginRuntime | null {
        const existing = Array.from(this.entries.values())
            .find(e => e.runtime.pluginId === pluginId);
        if (existing) return existing.runtime;
        return this.create(pluginId);
    }
```

- [ ] **Step 2: 确认类型检查通过**

```bash
pnpm --filter @szybko/host typecheck
```

Expected: EXIT CODE 0

- [ ] **Step 3: 提交**

```bash
git add packages/host/src/runtime-manager.ts
git commit -m "feat(host): add RuntimeManager attachToWindow / detachFromWindow / getOrCreate"
```

---

### Task 5: IPC handler — plugin.open 激活插件

**Files:**
- Modify: `packages/host/src/ipc-handlers.ts`
- Requires: Task 4 (RuntimeManager activation)

**Context:** 当前 `executeAction` 对 `plugin.open` 只打 console.warn，不做任何事。改为实际激活 Runtime。

- [ ] **Step 1: 修改 executeAction**

在 `ipc-handlers.ts` 的 `executeAction` 函数中，将 `plugin.open` case 替换为：

```typescript
        case 'plugin.open': {
            if (!runtimeManager) {
                return { ok: false, error: 'RuntimeManager not initialized' };
            }
            const runtime = runtimeManager.getOrCreate(action.payload.pluginId);
            if (!runtime) {
                return { ok: false, error: `Plugin "${action.payload.pluginId}" not found` };
            }
            runtimeManager.attachToWindow(runtime.id);
            return { ok: true };
        }
```

`plugin.runCommand` 也同样需要激活（但 Phase 1 先保持 console.warn，后续补命令匹配）。

注意：`runtimeManager` 已经通过 `registerIpcHandlers` 参数传入，可以直接使用。

- [ ] **Step 2: 确认类型检查通过**

```bash
pnpm --filter @szybko/host typecheck
```
Expected: EXIT CODE 0

- [ ] **Step 3: 提交**

```bash
git add packages/host/src/ipc-handlers.ts
git commit -m "feat(host): activate plugin runtime on plugin.open action"
```

---

### Task 6: Launcher 插件视图模式

**Files:**
- Create: `packages/launcher/src/components/PluginContainer.tsx`
- Modify: `packages/launcher/src/App.tsx`
- Modify: `packages/launcher/src/index.ts`（export PluginContainer）
- Requires: Task 4 (runtime state IPC arrives at renderer)

**Context:** Launcher 收到 `runtime:state-changed` 后切换到 plugin 模式展示占位区，WebContentsView 由主进程（WindowManager）定位在该区域。

- [ ] **Step 1: 新建 PluginContainer 组件**

```typescript
// packages/launcher/src/components/PluginContainer.tsx
/**
 * 插件视图占位容器。
 * 不渲染可见内容，仅预留空间以保持布局稳定。
 * WebContentsView 实际由主进程 WindowManager 定位。
 */
export function PluginContainer() {
    return (
        <div className="w-full" style={{ height: '400px' }} />
    );
}
```

- [ ] **Step 2: 更新 App.tsx — 状态监听 + 视图切换**

```typescript
// packages/launcher/src/App.tsx
import { useEffect, useRef } from 'react';
import { PluginContainer } from './components/PluginContainer';
import { ResultList } from './components/ResultList';
import { SearchBar } from './components/SearchBar';
import { WindowFrame } from './components/WindowFrame';
import { useKeyboard } from './hooks/useKeyboard';
import { useSearch } from './hooks/useSearch';
import { useWindowHeight } from './hooks/useWindowHeight';
import { useAppStore } from './stores/app-store';

export default function App() {
    const rootRef = useRef<HTMLDivElement>(null);
    const state = useAppStore(s => s.state);
    const setActivePlugin = useAppStore(s => s.setActivePlugin);
    const setState = useAppStore(s => s.setState);
    const { query, setQuery, results, selectedIndex, setSelectedIndex } = useSearch();

    useWindowHeight(rootRef);

    // 监听运行时状态变更 → 切换 plugin 模式
    useEffect(() => {
        const cleanup = window.szybko?.onRuntimeStateChanged?.((payload: any) => {
            if (payload?.state === 'attached') {
                setActivePlugin(payload.pluginId);
            }
            else if (payload?.state === 'detached') {
                setActivePlugin(null);
            }
        });
        return () => cleanup?.();
    }, [setActivePlugin]);

    useKeyboard({
        selectedIndex,
        totalItems: results.length,
        onSelectUp: () => setSelectedIndex(i => Math.max(0, i - 1)),
        onSelectDown: () => setSelectedIndex(i => Math.min(results.length - 1, i + 1)),
        onExecute: () => {
            if (results[selectedIndex]) {
                window.szybko?.execute(results[selectedIndex].action);
            }
        },
        onEscape: () => {
            if (query) {
                setQuery('');
                setSelectedIndex(0);
            }
            else if (state === 'plugin') {
                setActivePlugin(null);
            }
            else {
                window.szybkoInternal?.hideWindow();
            }
        },
    });

    return (
        <div ref={rootRef}>
            <WindowFrame>
                <SearchBar value={query} onChange={setQuery} />
                {state === 'plugin' ? (
                    <PluginContainer />
                ) : (
                    <ResultList
                        results={results}
                        selectedIndex={selectedIndex}
                        onSelect={setSelectedIndex}
                        onExecute={(i) => {
                            if (results[i])
                                window.szybko?.execute(results[i].action);
                        }}
                    />
                )}
            </WindowFrame>
        </div>
    );
}
```

关键改动：
- 新增 `state` 和 `setActivePlugin` / `setState` 的 store 引用
- useEffect 注册 `onRuntimeStateChanged` 监听
- Escape 在 plugin 模式下先退出 plugin，再隐藏窗口
- 条件渲染：`state === 'plugin'` 时展示 PluginContainer 而非 ResultList

- [ ] **Step 3: 更新 launcher/index.ts 导出 PluginContainer**

```typescript
// packages/launcher/src/index.ts
export { default as App } from './App';
export { PluginContainer } from './components/PluginContainer';  // NEW
// ... 其他导出不变
```

- [ ] **Step 4: 确认类型检查通过**

```bash
pnpm --filter @szybko/launcher typecheck
```
Expected: EXIT CODE 0

- [ ] **Step 5: 提交**

```bash
git add packages/launcher/src/components/PluginContainer.tsx packages/launcher/src/App.tsx packages/launcher/src/index.ts
git commit -m "feat(launcher): add plugin view mode with state change listener"
```

---

### Task 7: 端到端验证

**Context:** 确认整个链路跑通：Alt+Space → 搜索 → 出现插件结果 → 选中 → 插件 WebContentsView 显示在 Launcher 中。

- [ ] **Step 1: 启动 dev 模式**

```bash
pnpm dev
```
Expected: Electron 窗口弹出

- [ ] **Step 2: 验证插件被加载**

按 Alt+Space 调出窗口。
打开 DevTools（主窗口），查看 console 输出。Expected：`Example plugin loaded`（来自 example-plugin 的 preload.js）

- [ ] **Step 3: 验证插件搜索结果**

在搜索框输入 `hello`。Expected：ResultList 中出现"示例结果: hello"（来自 example-plugin 的 onSearch）

- [ ] **Step 4: 验证插件激活**

选中"示例结果: hello"并按回车。
Expected：
1. Launcher 切换到 plugin 模式（ResultList 消失，空白占位区出现）
2. 插件 WebContentsView 出现在搜索栏下方（显示"示例插件"标题和"等待搜索..."文字）
3. Console 输出 `plugin:enter` 相关日志

- [ ] **Step 5: 验证退出插件模式**

按 Escape。Expected：Launcher 回到 idle/搜索模式（或窗口隐藏）

- [ ] **Step 6: 提交整体验证**

无需单独提交，此 task 无代码改动。

---

## 自检清单

- [ ] 每个 Task 有明确的可验证终点
- [ ] Task 间依赖关系正确（3←1, 4←3, 5←4, 6←4）
- [ ] 无占位符或 TODO
- [ ] 导出的函数/常量名称在跨 task 引用时一致
- [ ] 类型检查步骤在每个修改 task 中
