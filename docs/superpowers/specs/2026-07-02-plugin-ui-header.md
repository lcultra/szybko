# 插件视图头部（WorkspaceHeader）

## 概要

插件激活后，Launcher 的搜索栏替换为插件头部，显示当前插件信息和操作按钮。

## 布局

```
idle/searching mode:           plugin mode:
┌─ WindowFrame ────────┐      ┌─ WindowFrame ────────────────────┐
│ SearchBar (68px)      │      │ [←] 首选项 · 设置     [⊞] [✕]  │  68px
│ ResultList             │      │ PluginScene + WebContentsView  │
└───────────────────────┘      └────────────────────────────────┘
```

WebContentsView 的 y=68 不变，无需调整 `updatePluginBounds()`。

## 组件

### PluginScene（原名 PluginContainer）

纯占位 div，无可见内容。仅重命名，功能不变。

### PluginHeader（新建）

| 区域 | 元素 | 功能 |
|---|---|---|
| 左侧 | ← 返回 | 点击退出插件模式 |
| 中左 | 插件名 | 如 "首选项" |
| 中右 | · 功能名 | 如 "设置" |
| 右侧 | ⊞ 分离 | UI 占位，功能后续实现 |
| 右侧 | ✕ 关闭 | 退出插件模式，同 Escape |
| 全行 | — | 窗口拖拽区 |

高度 68px，与 SearchBar 一致。

### Shell（App.tsx）

插件模式下 `<SearchBar />` 替换为 `<PluginHeader />`。

## IPC 扩展

`runtime:state-changed` payload 增加字段：

```typescript
// 当前
{ runtimeId, pluginId, state }

// 扩展
{ runtimeId, pluginId, state, pluginName, featureExplain }
```

`RuntimeManager.attachToWindow()` 发送前从 `PluginManager` 查询插件信息。

## 状态管理

`useAppStore` 扩展：

```typescript
interface AppStore {
    state: AppState;
    activePluginId: string | null;
    activePluginName: string;
    activeFeatureExplain: string;
    setActivePlugin: (id: string | null, name?: string, explain?: string) => void;
}
```

`onRuntimeStateChanged` 回调中提取 `pluginName` 和 `featureExplain` 存入 store。

## 交互

- **← / ✕ / Escape** → `clearActivePlugin()` → detach WebContentsView → 回到搜索态
- **⊞** → 仅渲染按钮，点击无功能（后续实现分离窗口）

## 改动文件

| 文件 | 改动 |
|---|---|
| `packages/shell/src/components/PluginContainer.tsx` | 重命名文件 + 组件名为 PluginScene |
| `packages/shell/src/components/PluginHeader.tsx` | 新建 |
| `packages/shell/src/App.tsx` | PluginContainer → PluginScene；条件渲染 PluginHeader |
| `packages/shell/src/stores/app-store.ts` | 增加 activePluginName, activeFeatureExplain |
| `packages/shell/src/index.ts` | 更新导出 |
| `packages/host/src/runtime/runtime-manager.ts` | attachToWindow 发送 pluginName + featureExplain |

## 不包含

- 分离窗口功能（⊞ 后续实现）
- 插件头部动画
- 面包屑点击导航
