# 启动器搜索结果展示升级设计

> 将当前单列扁平列表升级为网格化、分组可展开的搜索结果展示，支持固定项、最近使用、搜索匹配高亮等交互。

---

## 现状

```
搜索栏
  └── 单列 ResultList
        └── ResultItem（图标 + 标题 + 副标题）
```

- 结果无分组，平铺为 `SearchResult[]`
- `SearchResult` 只有 `{ id, title, subtitle, icon, group, score, action }`，无 section/匹配高亮/固定态
- 键盘导航只支持上下方向键
- 无右键菜单
- 无固定/历史能力

## 目标

```
搜索栏
  └── SectionList
        ├── PinnedSection (grid, 可拖拽排序)
        │     └── ResultTile × N
        ├── RecentSection (grid)
        │     └── ResultTile × N（可展开）
        ├── AppSection (grid)
        │     └── ResultTile × N（可展开）
        └── PluginSection (grid)
              └── ResultTile × N（可展开）
```

- 9 列 CSS Grid 布局，每项 82px 行高
- 按 section 分组，可展开/收起
- 固定项独立 section，支持拖拽排序
- 最近使用 section，自动跟踪使用记录
- 搜索命中文本高亮
- 方向键上下左右网格导航
- 右键菜单（固定、在访达中显示）

---

## 设计原则

- **后端驱动 sections**：section 分组、排序、固定态来自数据层，前端纯渲染
- **增量升级**：当前 `SearchResult[]` 扁平结构可扩展为 section 结构，不破坏现有搜索流程
- **UI 与交互解耦**：渲染组件纯展示，键盘导航/右键菜单为独立 hooks
- **轻量无锁**：不使用复杂状态库，zustand + props drilling 足够

---

## 数据模型扩展

### SearchResult 扩展

```typescript
// packages/shared/src/search/types.ts

export interface SearchResult {
    id: string;
    title: string;
    subtitle?: string;
    icon?: string;
    group?: string;          // 现有，仍保留
    score: number;
    action: ActionDescriptor;

    // ── 新增 ──
    section?: string;        // section 标识，如 "pinned" | "recent" | "apps" | "plugins"
    sectionTitle?: string;   // section 显示名，如 "固定" | "最近使用"
    matches?: TextMatches;   // 搜索命中高亮范围
    isPinned?: boolean;      // 是否被用户固定
    canPin?: boolean;        // 是否可固定/取消固定
    provider?: string;       // 来源标识，如 "system" | "plugin:xxx"
}

export interface TextMatches {
    title?: MatchRange[];
    subtitle?: MatchRange[];
}

export interface MatchRange {
    start: number;
    end: number;
}
```

### Section 模型（前端使用）

```typescript
// packages/shell/src/types/index.ts

export interface ResultSection {
    id: string;                    // "pinned" | "recent" | "apps" | "plugin:xxx"
    title: string;                 // 显示名 "固定" | "最近使用"
    items: SearchResult[];
    isPinned?: boolean;            // 是否固定 section
    totalCount: number;           // 完整数量（展开前 > items.length）
    canExpand: boolean;           // 是否有更多可展开（totalCount > items.length）

    // ⚠️ 注意：expanded 不在此处定义，展开/收起是纯 UI 状态，
    //    由 Shell 中的 expandedSectionIds: Set<string> 管理。
    //    数据层不感知展开态，参见下方「展开/收起」章节。
}
```

---

## 组件架构

```
Shell.tsx
  ├── SearchBar
  ├── SectionList                    ← 新组件
  │     ├── SectionHeader            ← section 标题 + 展开/收起 + 计数
  │     ├── PinnedGrid               ← 固定项网格（可拖拽）
  │     │     └── ResultTile × N
  │     └── ResultGrid               ← 普通结果网格
  │           └── ResultTile × N
  └── PluginView / PluginScene
```

### SectionList

```tsx
interface SectionListProps {
    sections: ResultSection[];
    selectedIndex: number;
    onSelect: (globalIndex: number) => void;
    onExecute: (globalIndex: number) => void;
    onToggleExpand: (sectionId: string) => void;
    onPinToggle: (resultId: string) => void;
    onContextMenu: (item: SearchResult, x: number, y: number) => void;
}
```

- 遍历 `sections`，渲染每个 section 的 header + grid
- 选中的 item 在当前 section 内用 `scrollIntoView` 确保可见

### SectionHeader

```tsx
interface SectionHeaderProps {
    title: string;
    shownCount: number;
    totalCount: number;
    expanded: boolean;
    canExpand: boolean;
    onToggle: () => void;
}
```

- 左侧：section 标题 + `(shownCount / totalCount)`
- 右侧：如果 `canExpand`，显示"展开全部"按钮

### ResultGrid

```tsx
interface ResultGridProps {
    items: SearchResult[];
    startIndex: number;        // 全局索引起点
    selectedIndex: number;
    onSelect: (globalIndex: number) => void;
    onExecute: (globalIndex: number) => void;
    onPinToggle: (resultId: string) => void;
}
```

- CSS Grid 布局：`grid-cols-9`（或响应式列数）
- `auto-rows-[82px]`，每个 tile 固定行高 82px
- 选中态用 `selected` prop 标记

### ResultTile

```tsx
interface ResultTileProps {
    item: SearchResult;
    selected: boolean;
    isPinned: boolean;
    onSelect: () => void;
    onExecute: () => void;
    onPinToggle: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
}
```

- 网格单元格：`flex-col items-center justify-center`
- 图标（48x48）+ 标题（截断，居中）
- 选中时 `border-ring/40 bg-surface-hover` 高亮
- 支持 `HighlightedText` 渲染匹配文本

### PinnedGrid

- 同 `ResultGrid` 布局，但使用 `@dnd-kit/core` + `@dnd-kit/sortable`
- 拖拽结束后通过 IPC `reorderPinned` 持久化顺序
- 1 个 pin 时不显示拖拽把手，正常显示

### HighlightedText

```tsx
interface HighlightedTextProps {
    text: string;
    ranges?: MatchRange[];
}
```

- 将 `text` 按 `ranges` 拆分为 `normal + highlight` 片段
- 高亮片段用 `<span className="text-primary font-semibold">` 渲染
- 用 `Array.from(text)` 正确处理多字节字符

---

## 数据流

### 搜索流程（改造后）

```
Shell: 输入查询
  → useSearch: debounce 80ms → IPC search:query
    → Main: runBuiltinSearch + CommandCatalog.match()
      → 结果以 section 形式组织返回
        → search:batch { source, section, results }
          → Shell: 按 section 合并到 SectionList
            → SectionList 渲染网格
```

`search:batch` 扩展 payload：

```typescript
interface SearchBatch {
    queryId: string;
    batchSeq: number;
    source: string;          // "builtin" | "plugin:{pluginId}"
    section?: string;        // 新增：所属 section
    sectionTitle?: string;   // 新增：section 显示名
    results: SearchResult[];
    isFinal: boolean;
}
```

### 关于 queryId 的注意事项

当前 `useSearch` 的 batch 处理存在一个已知问题：**没有按 queryId 过滤**。如果用户连续快速输入，前一次查询的结果 batch 可能在后一次到达，导致结果污染。

改造时随带修复：
- `useSearch` 持有 `currentQueryId: string | null`
- `onSearchBatch` 回调中 `batch.queryId !== currentQueryId` 时丢弃该 batch
- 新查询开始时 `setCurrentQueryId(newId)` 并 `setResults([])`
```

### 展开/收起

- `sections` 状态在 `Shell.tsx` 中用 `useState` 管理
- `expandedSectionIds: Set<string>` 跟踪已展开的 section（纯 UI 状态，不在 `ResultSection` 模型中定义）
- `onToggleExpand(sectionId)` → toggle Set → 触发重渲染
- 默认每个 section 显示 `2 行 × 9 列 = 18` 项
- 展开/收起不改变数据层返回的 section 内容，只控制前端展示数量

### 固定/取消固定

- 固定态由后端（`PluginRegistry`/`CommandCatalog`）持久化
- 前端通过 IPC `pinResult(resultId)` / `unpinResult(resultId)` 触发
- 固定 section 每次搜索时由数据层返回（`section: "pinned"`）
- 前端不做乐观更新以防止状态漂移

### 最近使用

- 用户执行结果时计数 + 时间戳记录到数据库
- 搜索时按使用频率/时间排序，取 top N → `section: "recent"`
- 首次搜索输入为空时返回 pinned + recent 作为默认页

---

## 键盘导航

改造 `useKeyboard`：

| 键 | 当前行为 | 目标行为 |
|----|---------|---------|
| 上下方向键 | 选中上/下一个 | 选中上/下一行，列位置不变 |
| 左右方向键 | 不支持 | 选中左/右一个 |
| Enter | 执行选中项 | 同左 |
| Escape | 隐藏/清空 | 同左 |

```typescript
interface UseKeyboardOptions {
    // ── 新字段 ──
    columns: number;           // 当前网格列数
    totalItems: number;
    selectedIndex: number;
    onSelect: (index: number) => void;
    onExecute: () => void;
    onEscape: () => void;
}
```

行切换逻辑：
- `ArrowUp`: `selectedIndex - columns`，最小值 0
- `ArrowDown`: `selectedIndex + columns`，最大值 `totalItems - 1`
- `ArrowLeft`: `selectedIndex - 1`，最小值 0
- `ArrowRight`: `selectedIndex + 1`，最大值 `totalItems - 1`

### Section 边界处理

`selectedIndex` 是跨所有 section 的全局线性索引。SectionList 内部需要维护一个 **section → 全局索引范围** 的映射来处理导航边界：

```
Section A: [0..17]    (9列 × 2行 = 18项，未展开)
Section B: [18..26]   (9列 × 1行 = 9项)
    ↓ 从第18项按 ↑       → selectedIndex = 18 - 9 = 9（Section A 最后一行开头）
    ↓ 从第17项按 ↓       → selectedIndex = 17 + 9 = 26（Section B 最后一项）
    ↓ 从第26项按 ↓       → 已到 totalItems - 1，不变
```

Section 边界行为矩阵：

| 操作 | 位置 | 行为 |
|------|------|------|
| `ArrowDown` | 当前 section 最后一行 | 跳到下一 section 第一行的同列位置（如果下一行列数不够，跳到下一行第一列） |
| `ArrowUp` | 当前 section 第一行 | 跳到上一 section 最后一行的同列位置 |
| `ArrowLeft` | section 内第一个元素 | 不变 |
| `ArrowRight` | section 内最后一个元素 | 不变 |

展开/收起时索引修正：
- 收起 section → 该 section 的 visible 数量减少 → 后续 section 的全局 index 前移
- 展开 section → 该 section 的 visible 数量增加 → 后续 section 的全局 index 后移
- 实现时需维护 `sectionOffsets: number[]` 并在展开/收起时重新计算

当前 useKeyboard 只有上下键。升级需要增加左右键支持，**列数从 `columns` prop 传入，不硬编码**。

---

## 右键菜单

使用 Electron 原生 `Menu.popup()`（与当前 PluginHeader 菜单一致的方式）：

```
右击 ResultTile
  → IPC result:context-menu { resultId, x, y, provider }
    → Main 构建菜单：
      ├── 固定到搜索栏 / 取消固定    (所有结果)
      ├── 在访达中显示               (provider === 'apps')
      └── (插件相关菜单项，由插件声明)
    → 菜单点击 → IPC + action
```

需要新增 IPC 通道：
- `result:context-menu`（renderer → main，invoke）：右键触发，传入选中的 result 信息和屏幕坐标
- 菜单项点击对应的 action 复用现有的 `PLUGIN_EXEC` / `executeAction` 机制

**与 plugin menu 的关系**：当前 `SHOW_PLUGIN_MENU` 通道是面向 plugin runtime 的（接收 runtimeId），而结果项右键菜单是完全不同的场景。不复用现有通道，新增独立通道以避免耦合。

---

## 窗口高度管理

当前 `useWindowHeight` 使用 `ResizeObserver` 监听 root div 高度变化并发送 `window:resize`。改造后：

- SectionList 每次渲染后测量实际高度
- 高度 clamp: `[MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT]` = `[96, 520]`
- RAF 去抖 + dedup：同一帧只发一次 resize
- 展开/收起 section 时自动触发高度更新

---

## 实施步骤

### Phase 1：UI 改造（不依赖后端存储变化）

1. **`SearchResult` 扩展** — 添加 `matches`、`section`、`sectionTitle`、`isPinned`、`canPin`、`provider` 等字段
2. **`ResultGrid` + `ResultTile`** — CSS Grid 布局替代单列列表
3. **`SectionList` + `SectionHeader`** — 分组渲染，展开/收起
4. **`HighlightedText`** — 匹配文本高亮组件
5. **`useKeyboard` 扩展** — 增加左右方向键 + 行级上下导航
6. **键盘导航适配网格** — 从当前 `selectedIndex` 计算行/列位置

### Phase 2：交互增强

7. **右键菜单** — `result:context-menu` IPC + 原生菜单
8. **固定/取消固定** — IPC + 数据库持久化
9. **最近使用** — 使用计数跟踪 + `section: "recent"` 返回
10. **空搜索默认页** — 展示 pinned + recent 作为首页
11. **PinnedGrid 拖拽排序** — `@dnd-kit` 集成

### Phase 3：数据层整合（依赖 CommandCatalog 就绪）

12. **`CommandCatalog.match()` 返回 section 结构**
13. **搜索流改造** — `search:batch` 支持 section 元数据
14. **固定态与 CommandCatalog 打通**
15. **最近使用与 CommandCatalog 打通**

---

## 空状态与加载态

### 空搜索默认页（query = ""）

首次打开搜索框无输入时，不显示 "无结果"，而是展示 pinned + recent section：

```
搜索栏（聚焦）
  └── SectionList
        ├── PinnedSection（如有固定项）
        └── RecentSection（如有使用记录）
```

如果 pinned 和 recent 都为空 → 隐藏 SectionList，搜索栏下方留空。

### 搜索无匹配（query 有值但 results 为空）

```
搜索栏
  └── 非空提示区域
        └── "没有找到匹配结果"（淡色文字，居中）
```

当前 ResultList 在 `results.length === 0` 时返回 `null`，改造后仍需保持同样的视觉（无大块空白报错）。

### 搜索中加载态

搜索结果是 batch 流到达的。首个 batch 到达前，不应该显示空状态提示，而是保持上一次搜索结果或显示一个极简的加载指示：

- Phase 1 实现：首个 batch 到达前不做额外 UI，沿用当前行为（显示旧结果直到新结果覆盖）
- Phase 2 可以考虑：在搜索栏右侧显示一个微小的 loading 动画（搜索图标旋转或光点脉冲）

---

## 状态管理说明

`useSearch` 与 `app-store` 在当前代码中存在状态重复：

| 字段 | `useSearch` | `app-store` | 改造后 |
|------|-------------|-------------|--------|
| `query` | ✅ 使用 | 存在但未读 | 保留 useSearch |
| `results` | ✅ 使用 | 存在但未读 | 保留 useSearch |
| `selectedIndex` | ✅ 使用 | 存在但未读 | 保留 useSearch |
| `expandedSectionIds` | 新增 | - | 放入 useSearch 或 Shell 的 useState |

改造后保持单一状态源：`useSearch` 作为搜索相关状态的 owner，废弃 `app-store` 中重复的 query/results/selectedIndex 字段。

---

## 不做的事

- 不做多列适配（固定 9 列，后续可改为响应式）
- 不做搜索结果多选
- 不做 AI Agent tools 展示
- 不做插件市场安装/管理 UI
- 不做用户自定义别名（未来 `command_alias` 落地后再说）
