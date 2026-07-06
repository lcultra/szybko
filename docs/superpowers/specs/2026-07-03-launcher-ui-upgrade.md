# 启动器搜索结果展示升级设计

> 将当前单列扁平列表升级为网格化、分组可展开的搜索结果展示，支持固定项、最近使用、搜索匹配高亮等交互。

---

## 现状

### UI 层

```
搜索栏
  └── 单列 ResultList
        └── ResultItem（图标 + 标题 + 副标题）
```

- 结果无分组，平铺为 `SearchResult[]`
- `SearchResult` 只有 `{ id, title, subtitle, icon, group, score, action }`，无 section/匹配高亮/固定态
- 键盘导航只支持上下方向键
- 无右键菜单
- 无固定/历史 UI 交互

### 数据层

当前 `pinned_trigger` 和 `usage_history` 表依赖 `(pluginId, featureCode, cmdKey)` 三元组，把固定和最近使用绑死在插件命令域上。**直接废弃**，由通用 `pinned_item` / `usage_event` 表替代，不做双写迁移。

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

- **Provider 驱动**：搜索结果来自多个 Provider（PluginProvider、AppProvider、FileProvider 等），每个 Provider 声明自己的 capability，renderer 只按能力渲染，不按类型分支
- **后端分组**：section 分组、排序、layout 由 Search Orchestrator 决定，renderer 不根据 item 类型自行归类
- **通用标识**：所有结果使用统一的 `LauncherItemId`，pin/recent/execute 都指向这个 id，不绑定任何 provider 的具体数据结构
- **Capability 代替类型判断**：UI 交互通过能力的声明式描述（pin? reveal? contextMenu?），不是 `if provider === 'apps'`

---

## 数据模型

### LauncherItemId（统一标识）

所有搜索结果共用一个标识联合类型，pin/recent/execute 等都基于它：

```typescript
// packages/shared/src/search/types.ts

export type LauncherItemId =
  | `plugin://${string}/${string}/${string}`   // pluginId / featureCode / cmdKey
  | `app://${string}`                          // bundleId
  | `file://${string}`                         // absolute path
  | `url://${string}`;                         // url hash
```

Provider 负责构造和解析自己的 id 格式。其他系统（pin、recent、context menu）只消费 `LauncherItemId`，不解析内部结构。

### LauncherItem（代替 SearchResult）

```typescript
export interface LauncherItem {
    id: LauncherItemId;              // 统一标识
    ownerProvider: string;           // "plugin" | "app" | "file" | "url"
    title: string;
    subtitle?: string;
    icon?: IconDescriptor;
    score: number;

    // ── 能力声明 ──
    capabilities: LauncherItemCapabilities;

    // ── 运行时状态 ──
    state: LauncherItemState;

    // ── 搜索匹配元数据 ──
    matches?: TextMatches;
    matchLevel?: number;
}

export interface LauncherItemCapabilities {
    pin?: boolean;               // 用户可固定
    reveal?: boolean;            // 可在系统文件管理器中显示
    dragSort?: boolean;          // 可在固定区拖拽排序
    contextMenu?: boolean;       // 有右键菜单
    preview?: boolean;           // 可预览（未来）
}

export interface LauncherItemState {
    pinned: boolean;             // 当前是否已被固定
}

export interface IconDescriptor {
    type: 'emoji' | 'url' | 'asset';
    value: string;
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

**关键区分**：
- `capabilities.pin` = 这个 item **能被固定**（由 ownerProvider 决定）
- `state.pinned` = 这个 item **当前已被固定**（由数据库状态决定）
- `ownerProvider` = 产生这个 item 的 provider（"plugin" / "app" / "file"），不会变成 "pinned" 或 "recent"

### SearchResponse — Section 快照模型

```typescript
// packages/shared/src/search/types.ts

export interface SearchResponse {
    queryId: string;
    sessionId: string;
    status: 'loading' | 'partial' | 'final';
    sections: ResultSection[];
    itemsById: Record<LauncherItemId, LauncherItem>;  // section 只惦记，item 在此处定义
}

export interface ResultSection {
    id: string;                    // "apps" | "plugins" | ...
    title: string;                 // "应用" | "插件" | ...
    source: 'pinned' | 'recent' | 'search';  // 来源分类
    layout: 'grid' | 'list' | 'compact';
    itemIds: LauncherItemId[];     // 只引用 LauncherItem.id，不内嵌
    totalCount: number;            // 该 section 结果总数（可能 > itemIds.length）
    hasMore?: boolean;             // 是否有更多可加载（用于分页/展开）
    priority: number;              // 排序权重，越小越靠前
}
```

**为什么 `itemsById` + `itemIds`？**

- `ResultSection` 只负责**摆放**（按 source/layout 决定显示位置）
- `itemsById` 是搜索 session 内的 item registry，所有 section 共享
- renderer 做 `itemIds.map(id => itemsById[id])` 拿到实际数据
- 后续加 app/file/AI action/preview，section 和 item 都不改主结构

每次 `SearchResponse` 携带完整 section 快照。renderer 替换式更新，不 append。
`status` 让 UI 可以展示加载态：`loading` 展示骨架屏，`partial` 展示已有结果，`final` 冻结。

### 新增 IPC 合约

```typescript
// packages/shared/src/ipc/contract.ts

[IPC.SEARCH_QUERY]: {
    request: { queryId: string; query: string; timestamp: number };
    response: { ok: boolean; sessionId?: string };
};

[IPC.SEARCH_RESPONSE]: SearchResponse;   // main → renderer（事件推送，多次）

[IPC.ITEM_PIN]: {
    request: { itemId: LauncherItemId; pin: boolean };
    response: { ok: boolean };
};

[IPC.ITEM_REORDER]: {
    request: { itemId: LauncherItemId; toIndex: number };
    response: { ok: boolean };
};

[IPC.ITEM_CONTEXT_MENU]: {
    request: { itemId: LauncherItemId; screenX: number; screenY: number };
    response: { ok: boolean };
};

[IPC.ITEM_EXECUTE]: {
    request: { sessionId: string; queryId: string; itemId: LauncherItemId };
    response: { ok: boolean; error?: string };
};
```

**安全边界**：`ITEM_EXECUTE` 只传 `itemId`，不传 `ActionDescriptor`。Main 侧通过 session 恢复 item，由 `ownerProvider` 解析并执行。Renderer 不接触 action 细节。

---

## 组件架构

```
Shell.tsx
  ├── SearchBar
  ├── SectionList                    ← 接收 section 快照
  │     ├── SectionHeader            ← layout 感知（grid/list/compact）
  │     ├── ResultGrid               ← items + NavigationMap
  │     │     └── ResultTile × N     ← capability 驱动交互
  │     └── PinnedGrid               ← 可拖拽（capabilities.dragSort）
  └── PluginView / PluginScene
```

### SectionList

```tsx
interface SectionListProps {
    sections: ResultSection[];
    navigationMap: NavigationMap;      // 由 SectionList 根据可见 items 生成
    onExecute: (itemId: LauncherItemId) => void;
    onToggleExpand: (sectionId: string) => void;
    onPinToggle: (itemId: LauncherItemId) => void;
    onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}
```

- 遍历 `sections`，根据 `layout` 选择渲染方式（grid/list/compact）
- 每次渲染后生成 `NavigationMap` 注入键盘 hook
- 选中项通过 `scrollIntoView` 确保可见

### NavigationMap

不依赖 `selectedIndex +/- columns` 解决 section 边界问题。SectionList 根据当前可见 items 生成导航映射：

```typescript
interface NavigationMap {
    current: number;            // 当前选中全局索引
    total: number;              // 可见总数
    up: number | null;          // 上一行同列（跨 section）
    down: number | null;        // 下一行同列（跨 section）
    left: number | null;        // 左一个（section 内，边界不变）
    right: number | null;       // 右一个（section 内，边界不变）
}
```

生成逻辑：

```typescript
function buildNavigationMap(
    sections: { layout: string; items: LauncherItem[] }[],
    selectedGlobalIndex: number,
    columns: number,
): NavigationMap {
    // 1. 展平所有 visible items（收起状态的 section 只取前 rows*columns）
    // 2. 计算 selectedIndex 所在行/列
    // 3. 上下：selectedIndex ± columns，clamp 到展平数组范围
    // 4. 左右：selectedIndex ± 1，检查是否跨 section
}
```

**为何不用直接的索引算术？**

- 不同 section 可能用不同列数（fixed grid vs list）
- 收起/展开后可见 items 变化，算术逻辑需要不断重算 section 偏移
- NavigationMap 将空间布局固化为指针，键盘 hook 只管消费

### SectionHeader

```tsx
interface SectionHeaderProps {
    title: string;
    shownCount: number;
    totalCount: number;
    expanded: boolean;
    canExpand: boolean;
    layout: 'grid' | 'list' | 'compact';
    onToggle: () => void;
}
```

- 左侧：section 标题 + `(shownCount / totalCount)`
- 右侧：如果 `canExpand`，显示"展开全部"按钮
- `layout` 决定 header 间距和样式变体

### ResultGrid

```tsx
interface ResultGridProps {
    items: LauncherItem[];
    startIndex: number;              // 全局索引起点
    selectedIndex: number;
    columns: number;
    onSelect: (globalIndex: number) => void;
    onExecute: (itemId: LauncherItemId) => void;
    onPinToggle: (itemId: LauncherItemId) => void;
    onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}
```

- CSS Grid 布局：`grid-cols-9`（当前固定 9 列）
- `auto-rows-[82px]`，每个 tile 固定行高 82px
- 选中态用 `selected` prop 标记

### ResultTile

```tsx
interface ResultTileProps {
    item: LauncherItem;
    selected: boolean;
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
- **交互按钮根据 `item.capabilities` 渲染**：`capabilities.pin` → 显示固定按钮；`capabilities.reveal` → 右键菜单有"在访达中显示"

### PinnedGrid

- 同 `ResultGrid` 布局，但使用 `@dnd-kit/core` + `@dnd-kit/sortable`
- 仅当 `item.capabilities.dragSort` 时启用拖拽
- 拖拽结束后通过 IPC `ITEM_REORDER` 持久化 `sort_order`
- 1 个 pin 时不显示拖拽把手

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

### 三层架构

```
┌─────────────────────────────────────────────────┐
│  Renderer (Shell.tsx)                           │
│  - 接收 SearchResponse.sections 直接渲染         │
│  - 消费 NavigationMap 做键盘导航                  │
│  - 触发 execute(itemId) / pin(itemId) / context  │
└──────────────────────┬──────────────────────────┘
                       │ IPC
┌──────────────────────▼──────────────────────────┐
│  Search Orchestrator (host)                     │
│  - 管理 SearchSession（queryId → provider 集合） │
│  - 合并各 provider 的结果                        │
│  - 去重、排序、组装 ResultSection[]               │
│  - 输出 SearchResponse（section 快照）           │
└──┬─────────┬──────────┬──────────┬──────────────┘
   │         │          │          │
┌──▼──┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│Plugin│ │ App   │ │ File  │ │Recent │  ← Provider 层
│Prov. │ │ Prov. │ │ Prov. │ │Prov.  │
└──────┘ └───────┘ └───────┘ └───────┘
```

### Provider 层

每个 Provider 拥有完整生命周期，不只是 search：

```typescript
interface SearchProvider {
    readonly id: string;                 // "plugin" | "app" | "file"
    readonly priority: number;
    search(snapshot: InputContextSnapshot, signal?: AbortSignal): Promise<SearchProviderResult>;
    resolve(itemId: LauncherItemId): Promise<LauncherItem | null>;
    execute(itemId: LauncherItemId, ctx: ExecuteContext): Promise<ExecuteResult>;
    getContextMenu(itemId: LauncherItemId): Promise<ContextMenuItem[]>;
}

interface SearchProviderResult {
    items: LauncherItem[];
    section: { id: string; title: string; source: 'search'; layout: 'grid' | 'list' | 'compact' };
}
```

**Section source 与 ownerProvider 的区分**：

- `ownerProvider`（在 `LauncherItem` 上） = 产生这个 item 的规范 provider，固定值不会变
- `section.source`（在 `ResultSection` 上） = 这个 section 的来源分类，可能是 `pinned` / `recent` / `search`

一个 plugin item 被固定后：`ownerProvider = "plugin"`，它出现在 `source = "pinned"` 的 section 中。语义清晰。

内置 Provider：

| Provider | 角色 | 数据来源 |
|----------|------|---------|
| `PluginProvider` | Owner provider | `CommandCatalog` / `SearchService` |
| `PinnedSectionProvider` | Section source（引用已有 item） | `pinned_item` 表 → `resolve(itemId)` |
| `RecentSectionProvider` | Section source（引用已有 item） | `usage_event` 表聚合 → `resolve(itemId)` |
| `AppProvider` | Owner provider（未来） | `NativeCapabilityService` |
| `FileProvider` | Owner provider（未来） | `NativeCapabilityService` |

Section Provider（Pinned / Recent）不实现 `execute()` 和 `getContextMenu()`，它们委托给 `ownerProvider`。

### Search Orchestrator

```typescript
class SearchSession {
    readonly queryId: string;
    readonly sessionId: string;
    readonly status: 'active' | 'finalized';

    // itemsById registry——所有 section 共享
    private itemsById: Map<LauncherItemId, LauncherItem>;
    // section 只存 itemIds，实际数据由 registry 提供
    private sections: ResultSection[];

    async search(query: string): Promise<void> {
        // 1. 并行调用各 SearchProvider
        // 2. 去重（相同 LauncherItemId 取高分）
        // 3. 注册到 itemsById
        // 4. 组装 sections（itemIds 引用 registry）
        // 5. emit SearchResponse { queryId, sessionId, status, sections, itemsById }
    }

    resolveItem(itemId: LauncherItemId): LauncherItem | null {
        return this.itemsById.get(itemId) ?? null;
    }

    async executeItem(itemId: LauncherItemId, ctx: ExecuteContext): Promise<ExecuteResult> {
        const item = this.resolveItem(itemId);
        if (!item) return { ok: false, error: 'Item not found' };
        const provider = this.getProvider(item.ownerProvider);
        return provider.execute(itemId, ctx);
    }
}
```

### 搜索流程

```
Shell: 输入查询 / 打开搜索框（空查询）
  → useSearch: debounce 80ms → IPC SEARCH_QUERY
    → Main: SearchSession.search(query)
      → 平行调用各 SearchProvider
        → PluginProvider:      SearchService.search(snapshot, query)
        → PinnedSectionProvider:  SELECT * FROM pinned_item → resolve(itemId)
        → RecentSectionProvider:  SELECT * FROM usage_event GROUP BY item_id → resolve(itemId)
        → (未来) AppProvider
      → SearchSession 合并、去重、排序、组装 itemsById + sections
      → IPC SEARCH_RESPONSE（可能多次：loading → partial → final）
        → Shell 替换式更新 sections + itemsById
          → SectionList 渲染
```

关键特征：

- **section 快照**：每次 `SearchResponse` 携带完整 sections，renderer 替换而非追加
- **queryId 强制匹配**：renderer 只消费当前 queryId 的响应
- **section 不内嵌 item**：sections 存 `itemIds`，`itemsById` 是共享 registry
- **空查询不走 PluginProvider**：只调 PinnedSectionProvider + RecentSectionProvider

### 展开/收起

- `expandedSectionIds: Set<string>` 在 Shell 中管理（纯 UI 状态）
- 展开时 `itemIds` 全量展示，收起时 renderer 自行 slice 前 N 项（`N = 2 行 × 9 列 = 18`）
- 展开/收起触发 NavigationMap 重建
- `hasMore` = true 时展开按钮变为"加载更多"，触发 IPC 获取下一批 `itemIds`

### 固定/取消固定

```typescript
export const pinnedItem = sqliteTable('pinned_item', {
    itemId: text('item_id').primaryKey(),      // LauncherItemId
    sortOrder: integer('sort_order').notNull().default(0),
    pinnedAt: integer('pinned_at').notNull(),
});
```

- 前端触发 `ITEM_PIN { itemId, pin: true }` → Main 写入 `pinnedItem` → 更新 session 中 `state.pinned = true`
- `ITEM_PIN` 响应后，Orchestrator 重新 emit `SearchResponse`，`state.pinned` 已更新
- 拖拽排序触发 `ITEM_REORDER { itemId, toIndex }` → Main 更新 `sortOrder`
- `PinnedSectionProvider` 每次搜索时读取 `pinnedItem` 表、按 `sortOrder` 排序、`resolve(itemId)` 获取完整 item
- `capabilities.pin` 不变，`state.pinned` 切换

### 最近使用

```typescript
export const usageEvent = sqliteTable('usage_event', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id').notNull(),           // LauncherItemId
    query: text('query'),
    selectedAt: integer('selected_at').notNull(),
});
```

- `ITEM_EXECUTE` handler 执行后调用 `UsageEventRepository.record(itemId, query?)`
- `RecentSectionProvider` 聚合查询 `GROUP BY item_id ORDER BY COUNT(*) DESC, MAX(selectedAt) DESC`，limit 20
- `resolve(itemId)` 获取完整 item，标记 `capabilities.pin = false`（recent 区不允许直接 pin，要进 pinned section 做）

---

## 键盘导航

### NavigationMap 模式

改造方向：`useKeyboard` 不再自己做索引算术，改为消费 SectionList 生成的 `NavigationMap`：

```typescript
interface NavigationMap {
    current: number;          // 当前选中全局索引
    total: number;            // 可见总数
    up: number | null;        // 上一行同列
    down: number | null;      // 下一行同列
    left: number | null;      // 左一个
    right: number | null;     // 右一个
}

interface UseKeyboardOptions {
    navigationMap: NavigationMap;
    onExecute: () => void;
    onEscape: () => void;
}
```

`useKeyboard` 只做：

```typescript
switch (e.key) {
    case 'ArrowUp': e.preventDefault(); map.up !== null && onSelect(map.up); break;
    case 'ArrowDown': e.preventDefault(); map.down !== null && onSelect(map.down); break;
    case 'ArrowLeft': e.preventDefault(); map.left !== null && onSelect(map.left); break;
    case 'ArrowRight': e.preventDefault(); map.right !== null && onSelect(map.right); break;
    case 'Enter': e.preventDefault(); onExecute(); break;
    case 'Escape': e.preventDefault(); onEscape(); break;
}
```

### VisualCell 模型

不依赖全局列数算术。SectionList 根据每个 section 的 `layout` 生成视觉网格：

```typescript
interface VisualCell {
    globalIndex: number;         // 可见列表中的位置
    sectionId: string;
    row: number;                 // 所在视觉行
    col: number;                 // 所在视觉列
    colSpan: number;             // 跨列（list layout 可跨整行）
}

interface NavigationMap {
    currentCell: VisualCell;
    cells: VisualCell[];         // 所有可见单元格
    up:    number | null;        // 上一行同列 nearest 的 globalIndex
    down:  number | null;        // 下一行同列 nearest 的 globalIndex
    left:  number | null;        // 左侧邻居的 globalIndex
    right: number | null;        // 右侧邻居的 globalIndex
}
```

`SectionList` 在渲染后遍历 DOM 或虚拟网格生成 `cells`：

```typescript
function buildNavigationMap(cells: VisualCell[], selectedIndex: number): NavigationMap {
    const current = cells.find(c => c.globalIndex === selectedIndex);
    if (!current) return { currentCell: cells[0], cells, up: null, down: null, left: null, right: null };

    // 按 (row, col) 找最近邻居，不依赖列数
    const up    = cells.find(c => c.col === current.col && c.row === current.row - 1);
    const down  = cells.find(c => c.col === current.col && c.row === current.row + 1);
    const left  = cells.find(c => c.row === current.row && c.col === current.col - 1);
    const right = cells.find(c => c.row === current.row && c.col === current.col + 1);

    return {
        currentCell: current,
        cells,
        up:    up?.globalIndex ?? null,
        down:  down?.globalIndex ?? null,
        left:  left?.globalIndex ?? null,
        right: right?.globalIndex ?? null,
    };
}
```

### 为什么这样好

| 场景 | 全局列数算术 | VisualCell |
|------|-------------|-----------|
| 不同 section 不同列数 | 需要跨区偏移计算 | 每个区独立生成 cells，拼接到一起 |
| grid + list 混合 | 行/列公式不统一 | `list` layout 的 cell 占 `colSpan = 列总数` |
| 收起/展开 section | 重新计算所有偏移 | 收起时去掉该 section 的 cells，重建 map |
| 跨 section 边界 | 特殊边界判断 | cells 连续排列，按空间坐标找邻居 |

当前 useKeyboard 只有上下键。升级后完全由 VisualCell NavigationMap 驱动，**不硬编码列数或 section 边界逻辑**。

---

## 右键菜单

### 能力驱动模型

Main 侧根据 `capabilities` + `state` + `ownerProvider` 构建菜单：

```typescript
// packages/host/src/ipc/register-handlers.ts

async function buildContextMenu(
    item: LauncherItem,
    session: SearchSession,
): Promise<Electron.MenuItemConstructorOptions[]> {
    const menu: Electron.MenuItemConstructorOptions[] = [];

    if (item.capabilities.pin) {
        menu.push({
            label: item.state.pinned ? '取消固定' : '固定到搜索栏',
            click: () => pinItem(item.id, !item.state.pinned),
        });
    }
    if (item.capabilities.reveal) {
        menu.push({
            label: '在访达中显示',
            click: () => revealItem(item),
        });
    }

    // 委托给 ownerProvider 获取自定义菜单
    const provider = session.getProvider(item.ownerProvider);
    if (provider?.getContextMenu) {
        const extra = await provider.getContextMenu(item.id);
        if (extra.length > 0) {
            menu.push({ type: 'separator' });
            menu.push(...extra.map(e => ({ label: e.label, click: e.action })));
        }
    }

    return menu;
}
```

**关键修正**：`capabilities.pin` = 可固定，`state.pinned` = 已固定。两者独立，UI 根据 `state.pinned` 决定显示 "取消固定" 还是 "固定到搜索栏"。

### IPC 流程

```
右击 ResultTile
  → IPC ITEM_CONTEXT_MENU { itemId, screenX, screenY }
    → Main:
        1. 从 session.itemsById 恢复 LauncherItem
        2. 读 capabilities + state.pinned
        3. 调用 buildContextMenu(item, session)
        4. Menu.popup({ x, y, window })
      → 点击菜单项 → 触发对应 action
```

- Renderer 传入 `itemId + screenPosition`，不参与菜单构建
- 自定义菜单项由 `ownerProvider.getContextMenu()` 提供，不存在 `if item.provider === 'plugin'` 分支

---

## 窗口高度管理

当前 `useWindowHeight` 使用 `ResizeObserver` 监听 root div 高度变化并发送 `window:resize`。改造后：

- SectionList 每次渲染后测量实际高度
- 高度 clamp: `[MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT]` = `[68, 520]`（当前代码常量）
- RAF 去抖 + dedup：同一帧只发一次 resize
- 展开/收起 section 时自动触发高度更新

---

## 实施步骤

### Phase 1：核心模型 + 搜索架构

1. **定义新数据模型** — `packages/shared/src/search/types.ts`：`LauncherItemId`、`LauncherItem`（`capabilities` + `state`）、`ResultSection`（`itemIds` + `source` + `layout`）、`SearchResponse`（`itemsById` + `sections`）、新 IPC 合约
2. **创建通用数据表** — migration-002：`pinned_item`（主键 `itemId`）+ `usage_event`，直接定义为新真理源，旧表 `pinned_trigger` / `usage_history` 废弃
3. **IPC 通道** — `SEARCH_RESPONSE`、`ITEM_PIN`、`ITEM_REORDER`、`ITEM_CONTEXT_MENU`、`ITEM_EXECUTE`（仅传 `sessionId + queryId + itemId`）
4. **Repository** — `PinnedItemRepository` + `UsageEventRepository`
5. **Provider 接口** — `SearchProvider` 含 `search` / `resolve` / `execute` / `getContextMenu`
6. **PluginProvider** — 包裹现有 `SearchService`，产出 `ownerProvider = "plugin"`
7. **PinnedSectionProvider + RecentSectionProvider** — 从通用表读 `itemId`，走 `resolve()` 获取完整 item
8. **Search Orchestrator + SearchSession** — `itemsById` registry + section 组装 + exec 委托
9. **`register-handlers.ts` 集成** — Orchestrator 替代 flat pipeline

### Phase 2：UI 渲染 + 导航

10. **`useSearch` 改造** — 接收 `SearchResponse`（`itemsById` + `sections`），替换 `SearchBatch` 累加逻辑
11. **`ResultGrid` + `ResultTile`** — CSS Grid 布局，`capabilities` + `state` 控制交互
12. **`HighlightedText`** — 按 `matches` 拆分渲染
13. **`SectionList` + `SectionHeader`** — 遍历 `sections`，`itemIds.map(id => itemsById[id])` 获取数据，`layout` 驱动样式
14. **`VisualCell` NavigationMap** — SectionList 生成视觉网格，`useKeyboard` 只消费 map
15. **`PinnedGrid`（拖拽）** — `@dnd-kit`，`capabilities.dragSort` 控制

### Phase 3：交互 + 持久化

16. **右键菜单** — `ITEM_CONTEXT_MENU` IPC + `buildContextMenu()` 读 `capabilities` + `state.pinned` + `ownerProvider.getContextMenu()`
17. **固定/取消固定** — `ITEM_PIN` IPC → `PinnedItemRepository` + 更新 session 中 `state.pinned`
18. **最近使用记录** — `ITEM_EXECUTE` handler 调用 `UsageEventRepository.record()`
19. **空搜索默认页** — 空查询只调 PinnedSectionProvider + RecentSectionProvider

### Phase 4：新 Provider 扩展（未来）

20. **AppProvider** — 系统应用搜索
21. **FileProvider** — 文件路径搜索
22. **更多 layout 类型** — `list` / `compact` 支持

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

搜索结果是 section 快照流（`SearchResponse`）到达的。renderer 根据 `status` 字段控制 UI：

| `SearchResponse.status` | UI 行为 |
|------------------------|---------|
| `loading` | 保持上一次 sections 不变，搜索栏显示光点脉冲动画 |
| `partial` | 替换 sections 展示已有结果，不显示 "无匹配" |
| `final` | 替换 sections 展示最终结果。如果 sections 为空，显示 "没有找到匹配结果" |

- 首个 `loading` 到达前：沿用当前行为（显示旧结果直到新结果覆盖）
- `loading` → `partial` → `final` 的过渡不闪白，保持内容连续

---

## 状态管理说明

### useSearch 改造

`useSearch` 改造后持有：

```typescript
// packages/shell/src/hooks/useSearch.ts

interface SearchState {
    query: string;
    sections: ResultSection[];           // SearchResponse.sections
    status: 'idle' | 'loading' | 'partial' | 'final';
    currentQueryId: string | null;
    selectedIndex: number;
    expandedSectionIds: Set<string>;
}
```

不再持有 `results: SearchResult[]`，section 分组由 Provider/Orchestrator 完成。

### 与 app-store 的关系

`app-store` 中的 `query`/`results`/`selectedIndex` 字段废弃，只保留 `state: AppState`（'idle' / 'searching' / 'plugin'）控制 Shell 主视图切换。`useSearch` 成为搜索相关状态的唯一 owner。

---

## 不做的事

- 不做多列适配（固定 9 列，后续可改为响应式 per-section）
- 不做搜索结果多选
- 不做 AI Agent tools 展示（Provider 层留了接口位置，UI 层暂不实现）
- 不做插件市场安装/管理 UI
- 不做用户自定义别名（未来 `command_alias` 落地后再说）
- 不做 `pinned_trigger` / `usage_history` 表的迁移或兼容——直接废弃，`pinned_item` / `usage_event` 为唯一真理源
- 不做 SearchResult-to-LauncherItem 的运行时兼容层：IPC 链路直接发送新类型
