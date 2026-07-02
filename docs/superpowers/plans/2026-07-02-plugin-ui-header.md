# 插件视图头部实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans.

**Goal:** 替换插件模式的空白占位为带头部信息的插件视图

**Architecture:** 插件模式下 SearchBar 替换为 PluginHeader，PluginContainer 重命名为 PluginScene；IPC payload 扩展携带插件展示信息

**Tech Stack:** React 19, zustand, Electron IPC

## 全局约束

- PluginContainer → PluginScene（文件+组件名）
- PluginHeader 高度 68px（与 SearchBar 一致）
- `runtime:state-changed` payload 增加 `pluginName`, `featureExplain`
- detach [⊞] 仅 UI 占位，不实现功能

---

### Task 1: 重命名 PluginContainer → PluginScene

**Files:**
- Rename: `packages/shell/src/components/PluginContainer.tsx` → `PluginScene.tsx`
- Modify: `packages/shell/src/index.ts` — 更新导出
- Modify: `packages/shell/src/App.tsx` — 更新 import

- [ ] **Step 1: 重命名文件 + 组件名**

```bash
git mv packages/shell/src/components/PluginContainer.tsx packages/shell/src/components/PluginScene.tsx
```

内容改为：
```tsx
export function PluginScene() {
    return <div className="w-full" style={{ height: '400px' }} />;
}
```

- [ ] **Step 2: 更新 App.tsx import**

```typescript
import { PluginScene } from './components/PluginScene.js';
```
将 `PluginContainer` 替换为 `PluginScene`。

- [ ] **Step 3: 更新 shell/index.ts 导出**

```typescript
export { PluginScene } from './components/PluginScene.js';
```
替换 `PluginContainer`。

- [ ] **Step 4: 提交**

```bash
git add packages/shell/
git commit -m "refactor: rename PluginContainer to PluginScene"
```

---

### Task 2: 扩展 IPC payload

**Files:**
- Modify: `packages/host/src/runtime/runtime-manager.ts`

**Context:** `attachToWindow` 发送 `IPC.PLUGIN_RUNTIME_STATE` 时需要带上 `pluginName` 和 `featureExplain`，从 `PluginManager` 查询。

- [ ] **Step 1: 修改 attachToWindow**

```typescript
attachToWindow(runtimeId: string, featureCode?: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) {
        console.warn(`[RuntimeManager] attachToWindow: runtime ${runtimeId} not found`);
        return;
    }

    this.windowManager.attachPluginView(entry.view);
    entry.runtime.state = 'attached';

    // 查询插件展示信息
    let pluginName = entry.runtime.pluginId;
    let featureExplain = '';
    const plugin = this.pluginManager.get(entry.runtime.pluginId);
    if (plugin) {
        pluginName = plugin.manifest.features.find(f => f.code === featureCode)?.explain || plugin.id;
        const feature = plugin.manifest.features.find(f => f.code === featureCode);
        if (feature) {
            pluginName = feature.explain || plugin.id;
            featureExplain = feature.explain || '';
        }
    }

    // 通知渲染进程状态变更
    const win = this.windowManager.getWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId: entry.runtime.id,
            pluginId: entry.runtime.pluginId,
            pluginName,
            featureExplain,
            state: 'attached',
        });
    }

    // 通知插件进入
    entry.view.webContents.send(IPC.PLUGIN_ENTER, {
        pluginId: entry.runtime.pluginId,
        featureCode,
    });
}
```

- [ ] **Step 2: 提交**

```bash
git add packages/host/src/runtime/runtime-manager.ts
git commit -m "feat: extend runtime:state-changed payload with pluginName and featureExplain"
```

---

### Task 3: 扩展 Store

**Files:**
- Modify: `packages/shell/src/stores/app-store.ts`

- [ ] **Step 1: 更新 store 类型和初始值**

```typescript
import { create } from 'zustand';

type AppState = 'idle' | 'searching' | 'plugin';

interface AppStore {
    state: AppState;
    query: string;
    results: SearchResult[];
    selectedIndex: number;
    activePluginId: string | null;
    activePluginName: string;
    activeFeatureExplain: string;
    setQuery: (query: string) => void;
    setResults: (results: SearchResult[]) => void;
    setSelectedIndex: (index: number) => void;
    setState: (state: AppState) => void;
    setActivePlugin: (id: string | null, name?: string, explain?: string) => void;
}

export const useAppStore = create<AppStore>(set => ({
    state: 'idle',
    query: '',
    results: [],
    selectedIndex: 0,
    activePluginId: null,
    activePluginName: '',
    activeFeatureExplain: '',
    setQuery: query => set({ query, state: query ? 'searching' : 'idle' }),
    setResults: results => set({ results }),
    setSelectedIndex: selectedIndex => set({ selectedIndex }),
    setState: state => set({ state }),
    setActivePlugin: (id, name = '', explain = '') => set({
        activePluginId: id,
        activePluginName: name,
        activeFeatureExplain: explain,
        state: id ? 'plugin' : 'idle',
    }),
}));
```

- [ ] **Step 2: 提交**

```bash
git add packages/shell/src/stores/app-store.ts
git commit -m "feat: add activePluginName and activeFeatureExplain to store"
```

---

### Task 4: 创建 PluginHeader 组件

**Files:**
- Create: `packages/shell/src/components/PluginHeader.tsx`
- Modify: `packages/shell/src/App.tsx`

- [ ] **Step 1: 创建 PluginHeader 组件**

```tsx
import { useAppStore } from '../stores/app-store.js';

export function PluginHeader() {
    const pluginName = useAppStore(s => s.activePluginName);
    const featureExplain = useAppStore(s => s.activeFeatureExplain);
    const clearActivePlugin = useAppStore(s => s.setActivePlugin);

    return (
        <div
            className="flex h-[68px] cursor-default items-center px-4"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            {/* 左侧：返回按钮 */}
            <button
                className="mr-3 flex h-8 w-8 items-center justify-center rounded-md
                           text-text/60 transition-colors hover:bg-surface-hover hover:text-text"
                onClick={() => clearActivePlugin(null)}
                title="返回 (Esc)"
            >
                ←
            </button>

            {/* 中间：插件信息 */}
            <div className="flex flex-1 items-center gap-2 overflow-hidden">
                <span className="truncate text-sm font-medium text-text">
                    {pluginName}
                </span>
                {featureExplain && (
                    <>
                        <span className="text-text/30">·</span>
                        <span className="truncate text-sm text-text/60">
                            {featureExplain}
                        </span>
                    </>
                )}
            </div>

            {/* 右侧：操作按钮 */}
            <div className="flex items-center gap-1">
                <button
                    className="flex h-8 w-8 items-center justify-center rounded-md
                               text-text/40 transition-colors hover:bg-surface-hover hover:text-text"
                    title="分离到独立窗口"
                >
                    ⊞
                </button>
                <button
                    className="flex h-8 w-8 items-center justify-center rounded-md
                               text-text/40 transition-colors hover:bg-surface-hover hover:text-text"
                    onClick={() => clearActivePlugin(null)}
                    title="关闭 (Esc)"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: 更新 App.tsx**

```tsx
import { PluginHeader } from './components/PluginHeader.js';
import { PluginScene } from './components/PluginScene.js';

// 在 render 中：
<WindowFrame>
    {state === 'plugin' ? <PluginHeader /> : <SearchBar value={query} onChange={setQuery} />}
    {state === 'plugin' ? <PluginScene /> : <ResultList ... />}
</WindowFrame>
```

同时更新 `useEffect` 中的 `onRuntimeStateChanged` 回调以提取新字段：

```typescript
useEffect(() => {
    const cleanup = window.szybko?.onRuntimeStateChanged?.((payload: any) => {
        if (payload?.state === 'attached') {
            setActivePlugin(payload.pluginId, payload.pluginName, payload.featureExplain);
        }
        else if (payload?.state === 'detached' || payload?.state === 'destroyed') {
            setActivePlugin(null);
        }
    });
    return () => cleanup?.();
}, [setActivePlugin]);
```

- [ ] **Step 3: 更新 shell/index.ts 导出**

```typescript
export { PluginHeader } from './components/PluginHeader.js';
export { PluginScene } from './components/PluginScene.js';
```

- [ ] **Step 4: 类型检查**

```bash
pnpm --filter @szybko/shell typecheck 2>&1
pnpm --filter @szybko/desktop typecheck 2>&1
```

- [ ] **Step 5: 提交**

```bash
git add packages/shell/
git commit -m "feat: add PluginHeader with back, close, detach buttons and plugin info"
```

---

### Task 5: 端到端验证

- [ ] **Step 1: 构建 + 启动**

```bash
pnpm dev
```

- [ ] **Step 2: 搜 "设置" → 选中"首选项"**

Expected：
1. 搜索栏消失，替换为 PluginHeader
2. 显示 "首选项 · 设置"
3. ← 和 ✕ 按钮可见
4. 点击 ✕ 或 Escape 退出插件模式
