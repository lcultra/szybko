# 插件运行时：端到端可见 MVP

## 概要

让插件从"搜索到结果"到"选中后显示在 Launcher 中"完整跑通。当前 WebContentsView 创建后从未挂载到 BrowserWindow，导致插件不可见。

## 目标

1. WebContentsView 通过 `BrowserWindow.contentView.addChildView` 挂载到主窗口
2. Launcher 从搜索视图切换到插件视图（显示插件 UI 区域）
3. 用户在搜索中选中插件结果 → 激活 Runtime → 插件可见
4. 基础运行时变更通知（state → renderer）

## 状态机（Phase 1 子集）

当前只使用 `created` / `attached` / `detached`，Phase 1 新增：

| 转换 | 触发 | 动作 |
|---|---|---|
| `created` → `activated` | Runtime 创建完成，首次 loadFile 成功 | WebContents ready |
| `activated/created` → `attached` | 用户选中插件结果 | `WindowManager.attachPluginView(view)` |
| `attached` → `detached` | 插件关闭/离开 | `WindowManager.detachPluginView(view)` |

后续 Phase 再补 `suspended` 和 `destroyed`。

## 架构

```
用户输入 → search:query
  → ipc-handlers: runtimeManager.sendPluginSearch(req)
    → plugin:search → 插件 WebContents
      → plugin:search-result → ipc-handlers → search:batch → launcher 渲染

用户选中插件结果 → execute({ type: 'plugin.open' })
  → ipc-handlers: runtimeManager.attachToWindow(runtimeId)
    → WindowManager.attachPluginView(view)
      → contentView.addChildView(view) + setBounds
    → plugin:runtime-state → launcher: state = 'plugin'
    → plugin:enter → 插件收到 onPluginEnter
```

## 模块改动

### 1. host/src/window-manager.ts — View 管理

新增方法：

```typescript
class WindowManager {
  private pluginView: WebContentsView | null = null;

  /** 挂载插件 View 到主窗口内容区 */
  attachPluginView(view: WebContentsView): void {
    this.detachPluginView(); // 先移除旧的
    this.window?.contentView.addChildView(view);
    this.pluginView = view;
    this.updatePluginBounds();
  }

  /** 从主窗口移除插件 View */
  detachPluginView(view?: WebContentsView): void {
    const target = view ?? this.pluginView;
    if (target && this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(target);
    }
    if (target === this.pluginView) this.pluginView = null;
  }

  /** 计算 View 位置：Y=搜索框高度(~56), 宽=820, 高=窗口高度-56 */
  private updatePluginBounds(): void {
    if (!this.pluginView || !this.window) return;
    const [, height] = this.window.getSize();
    this.pluginView.setBounds({ x: 0, y: SEARCHBAR_HEIGHT, width: DEFAULT_WINDOW_WIDTH, height: height - SEARCHBAR_HEIGHT });
  }
}
```

`resize()` 和 `repositionToCursor()` 内部调用 `updatePluginBounds()`（如果 view 存在）。

### 2. host/src/runtime-manager.ts — 激活/分离

新增方法：

```typescript
class RuntimeManager {
  /** 激活插件 — 挂载 view 到窗口，通知渲染进程 */
  async attachToWindow(runtimeId: string): Promise<void> {
    const entry = this.entries.get(runtimeId);
    if (!entry) throw new Error(`Runtime ${runtimeId} not found`);

    this.windowManager.attachPluginView(entry.view);

    // 发送 runtime:state-changed 到渲染进程
    const win = this.windowManager.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
        runtimeId: entry.runtime.id,
        pluginId: entry.runtime.pluginId,
        state: 'attached',
      });
    }

    // 通知插件
    entry.view.webContents.send(IPC.PLUGIN_ENTER, {});
  }

  /** 分离插件 — 从窗口移除 view */
  detachFromWindow(runtimeId: string): void {
    const entry = this.entries.get(runtimeId);
    if (!entry) return;
    this.windowManager.detachPluginView(entry.view);
  }

  /** 获取或创建 Runtime（支持按 pluginId 查找首例） */
  getOrCreate(pluginId: string): PluginRuntime | null {
    const existing = Array.from(this.entries.values())
      .find(e => e.runtime.pluginId === pluginId);
    if (existing) return existing.runtime;
    return this.create(pluginId);
  }
}
```

`RuntimeManager.create()` 中 WebContents 的 `did-finish-load` 事件触发 `activated` 状态。

### 3. host/src/ipc-handlers.ts — plugin.open 处理

在 `executeAction` 中 `plugin.open` 不再只是 console.warn：

```typescript
case 'plugin.open': {
  if (!runtimeManager) {
    return { ok: false, error: 'RuntimeManager not initialized' };
  }
  const runtime = runtimeManager.getOrCreate(action.payload.pluginId);
  if (!runtime) {
    return { ok: false, error: `Plugin ${action.payload.pluginId} not found` };
  }
  runtimeManager.attachToWindow(runtime.id);
  return { ok: true };
}
```

### 4. launcher/src/App.tsx — 插件视图切换

```tsx
export default function App() {
  const state = useAppStore(s => s.state);

  return (
    <div ref={rootRef}>
      <WindowFrame>
        <SearchBar ... />
        {state === 'plugin' ? <PluginContainer /> : <ResultList ... />}
      </WindowFrame>
    </div>
  );
}
```

### 5. launcher/src/components/PluginContainer.tsx — 新文件

占位 div，不可见。主进程通过计算 offset 将 WebContentsView 定位到此处。

```tsx
/**
 * 插件视图占位容器。
 * 不渲染可见内容，仅预留空间让主进程知道将 WebContentsView 定位在何处。
 * 宽度 = 窗口宽度(820px)，高度由主进程按窗口高度动态计算。
 */
export function PluginContainer() {
  return (
    <div className="relative w-full" style={{ height: PLUGIN_VIEW_MIN_HEIGHT }} />
  );
}
```

后续可以加 ResizeObserver + IPC 将精确 bounds 传给主进程。Phase 1 用固定偏移（Y=56，高度=窗口高度-56）。

### 6. launcher/src/stores/app-store.ts — 无改动

`setActivePlugin` 和 `setState` 已经定义，App.tsx 消费即可。

### 7. plugins 目录调整

将 `plugins/example-plugin` 移入 `plugins/built-in/example-plugin`，这样 `PluginManager.scan()` 能加载。

## 不包含（未来 Phase）

| 特性 | 原因 |
|---|---|
| FloatingHost 分离窗口 | Phase 1 专注 Launcher 插件可见 |
| Runtime warming pool | 无性能需求先不做 |
| SubInput / 子输入框 | 插件 SDK 完善阶段 |
| plugins/user/ 安装流程 | 需配合安装 UI |
| suspended / destroyed 完整状态 | phase 1 完成后补 |

## 设计细节

### SearchBar 高度与 View Y 偏移

SearchBar 容器高度为 `h-[68px]`（含上下内边距）。`attachPluginView` 将 view 定位在 `y = 68`。

实现时建议将 `SEARCHBAR_HEIGHT = 68` 定义在 `@szybko/shared/src/constants/window.ts` 中，与 `DEFAULT_WINDOW_WIDTH` 等窗口常量并列。后续修改 SearchBar 样式时同步更新。

### PluginContainer 占位区

插件视图模式下，`PluginContainer` 仅作布局占位，高度固定为 `WINDOW_HEIGHT - SEARCHBAR_HEIGHT`。主进程 `updatePluginBounds()` 计算的是实际 `BrowserWindow.getSize()` 减去偏移量，两者保持一致。

Phase 2 可引入 ResizeObserver 将占位 div 的精确 `getBoundingClientRect()` 通过 IPC 发给主进程，消除硬编码偏移。

## 边界情况

- **WebContentsView 重叠**：`attachPluginView` 先 `detachPluginView` 再添加，确保只有一个插件 View 可见
- **窗口关闭/隐藏时**：detach view 不销毁，保留状态
- **插件未安装**：`getOrCreate` 返回 null，给 renderer 返回错误
- **多插件同时激活**：单例插件(single=true)复用已有 Runtime；非单例才创建新实例
