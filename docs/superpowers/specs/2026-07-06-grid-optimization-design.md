# Grid 组件合并与交互优化

## 概要

合并 `PinnedGrid` + `ResultGrid` 为统一 `Grid` 组件，补齐拖拽视觉反馈、焦点锁定、图标降级等交互细节，提升启动器网格的整体品质。

## 动机

当前启动器网格存在以下问题：

1. **代码重复**：`PinnedGrid` 和 `ResultGrid` 结构几乎相同，拖拽版仅多了一层 `DndContext`/`SortableContext` 和 `SortableTile` 包装
2. **拖拽无目标反馈**：拖动 pinned item 时没有 `drop target` 高亮，用户不知道会落在哪
3. **拖拽后误触**：没有 `suppressClick` 机制，拖拽结束时可能触发 item 的 `onClick`
4. **焦点逃逸**：点击搜索结果可能让搜索输入框失焦
5. **图标无容错**：图片加载失败没有任何降级显示
6. **`NavigationMap` 跨 section bug**：`down` 方向未过滤 `sectionId`，底部会错误跳到下一 section 同列

## 设计

### 组件树（变更后）

```
Shell
  └── SurfaceFrame
       ├── SearchBar
       └── 结果区域 (max-h-[424px] 可滚动)
            └── SectionList
                 └── section
                      ├── SectionHeader
                      └── Grid (统一网格)
                           ├── SortableGridTile (draggable=true 时)
                           └── GridTile (draggable=false 时)
                                ├── ResultIcon (新提取)
                                └── HighlightedText
```

### Grid 组件

合并 `PinnedGrid` 和 `ResultGrid`，通过 `draggable` 和 `onReorder` 的 discriminated union 区分行为。

```tsx
// 共同 props
interface GridBaseProps {
  items: LauncherItem[];
  startIndex: number;
  selectedIndex: number;
  columns: number;
  onSelect: (globalIndex: number) => void;
  onExecute: (itemId: LauncherItemId) => void;
  onPinToggle: (itemId: LauncherItemId) => void;
  onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}

// 非拖拽版
interface GridStaticProps extends GridBaseProps {
  draggable: false;
  onReorder?: undefined;
}

// 拖拽版 — onReorder 必填
interface GridDraggableProps extends GridBaseProps {
  draggable: true;
  onReorder: (itemId: LauncherItemId, toIndex: number) => void;
}

type GridProps = GridStaticProps | GridDraggableProps;
```

- `draggable=true` → `DndContext` + `SortableContext` 包裹，渲染 `SortableGridTile`
- `draggable=false` → 纯静态网格，渲染 `GridTile`
- 内部维护 `suppressClickId` state + ref（ref 用于 unmount 时清除 timer），`onDragEnd` 时设置 250ms 压制窗口
- `onDragEnd` 覆盖所有路径：drop on target、drop outside（cancel）、same item（cancel），统一压制原 item 的点击

### GridTile（纯展示）

```tsx
interface GridTileProps {
  item: LauncherItem;
  selected: boolean;
  suppressClick: boolean;
  onSelect: () => void;
  onExecute: (itemId: LauncherItemId) => void;
  onPinToggle: (itemId: LauncherItemId) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function GridTile({ item, selected, suppressClick, onExecute, onPinToggle, onContextMenu }: GridTileProps) {
  // 不调用任何 hook。
  // suppressClick=true 时 onExecute 被跳过。
  // tile root 用 <div role="button">，避免嵌套 <button> 问题。
}
```

- 条件式 hook 违反规则 → `GridTile` 是纯函数组件，不调用 `useSortable`
- 拖拽逻辑完全由 `SortableGridTile` wrapper 封装

### SortableGridTile（私有 wrapper）

```tsx
function SortableGridTile(props: GridTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isDropTarget } = useSortable({
    id: props.item.id,
  });

  // 固定调用 useSortable，不条件式调用。
  // 透明委托给 GridTile 做渲染，drag 状态通过 style 和 class 注入。
  return (
    <div ref={setNodeRef} style={/* transform + transition */} {...attributes} {...listeners}>
      <GridTile {...props} />
    </div>
  );
}
```

### GridTile 样式

| 状态 | 样式 |
|------|------|
| 选中 | `border-primary/40 bg-primary/15 text-text` |
| 悬停 | `hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60` |
| 拖拽中（SortableGridTile 裹上） | `opacity-45 will-change-transform pointer-events-none` |
| 拖拽目标槽（SortableGridTile 裹上） | `border-primary/70` |
| 静态 | `border-transparent` |

### tile 结构（修复嵌套 button）

```tsx
<div
  role="button"
  tabIndex={-1}
  className="relative grid size-full cursor-pointer grid-rows-[1fr_auto] place-items-center gap-1.5 rounded-2xl border p-2 text-center text-inherit outline-none transition-[opacity,background-color,border-color] duration-150"
  // ... 选中/拖拽 class
  onClick={handleClick}
  onContextMenu={handleContextMenu}
  onMouseEnter={onSelect}
  onKeyDown={/* Enter/Space trigger execution */}
  data-interactive
>
  <ResultIcon icon={item.icon} title={item.title} />
  <HighlightedText text={item.title} ranges={item.matches?.title} />
  {item.capabilities.pin && (
    <button
      tabIndex={-1}
      className="absolute top-0.5 right-0.5 ..."
      onClick={e => { e.stopPropagation(); onPinToggle(); }}
      type="button"
    >
      <Pin size={12} />
    </button>
  )}
</div>
```

- root 是 `<div role="button">` — 不再嵌套 `<button>`
- pin 是独立的 `<button>`，`tabIndex={-1}` 避免 Tab 把焦点从搜索框移走

### ResultIcon（新）

```tsx
function ResultIcon({ icon, title }: { icon?: IconDescriptor; title: string }) {
  // icon.type === 'emoji'  → <span> 直接渲染 value
  // icon.type === 'url'    → <img src={value} onError={→ 降级到首字母} />
  // icon.type === 'asset'  → <img src={value} onError={→ 降级到首字母} />，和 url 行为一致
  // !icon / onError        → 首字母 (title.charAt(0))
}
```

三种 icon 类型的行为：

| `type` | 渲染 | 降级 |
|--------|------|------|
| `emoji` | `<span>{value}</span>` | 无降级（纯文本不会失败） |
| `url` | `<img src={value} />` | onError → 首字母 |
| `asset` | `<img src={value} />` | onError → 首字母 |
| 无 icon | 首字母 | — |

### 焦点管理

Shell 的结果容器绑定事件：

```tsx
// 避免点击结果时搜索框失焦
function handleMouseDown(event: React.MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  // 不干扰 ① pin 按钮的点击（stopPropagation 已处理）
  //          ② 右键菜单（onContextMenu 自行处理）
  //          ③ 拖拽启动（@dnd-kit PointerSensor 内部使用 pointer events）
  // 只阻止 mousedown 的默认焦点转移行为
  event.preventDefault();
}

function handleFocusCapture(event: React.FocusEvent) {
  const target = event.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  event.preventDefault();
}
```

- 使用 `onMouseDown`（React 合成事件，类型安全）和 `onFocusCapture`（捕获阶段阻止焦点逃逸）
- `onFocusCapture` 在焦点到达目标元素前的捕获阶段拦截，比 React 无 `onFocusIn` 更干净

### 键盘导航修正

`buildNavigationMap` 中 `down` 方向查询补上 `sectionId` 过滤：

```typescript
// 修改前：可跨 section
const down = cells.find(c => c.col === current.col && c.row === current.row + 1);

// 修改后：同 section 内找下一行
const down = cells.find(
  c => c.col === current.col && c.row === current.row + 1 && c.sectionId === current.sectionId,
);
// 若同 section 内无下一行（到底了），尝试找下一 section 同列第一行
const down = cells.find(
  c => c.col === current.col && c.row === current.row + 1 && c.sectionId === current.sectionId,
) ?? cells.find(
  c => c.col === current.col && c.row === 0 && c.sectionId !== current.sectionId
);
// ↑ 到底时跳到下一 section 首行同列
```

`sortedBy(sectionOffsets)` 确保跨 section 跳转时找的是最近的下一 section。

### 拖拽传感器

仅 `PointerSensor`，`activationConstraint: { distance: 8 }`。无需 `KeyboardSensor`。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/shell/src/pages/shell/ResultTile.tsx` | 删除 | 被 GridTile 替代 |
| `packages/shell/src/pages/shell/ResultGrid.tsx` | 删除 | 功能并入 Grid |
| `packages/shell/src/pages/shell/PinnedGrid.tsx` | 删除 | 功能并入 Grid |
| `packages/shell/src/pages/shell/ResultIcon.tsx` | **新建** | 独立图标组件，处理 emoji/url/asset + 首字母降级 |
| `packages/shell/src/pages/shell/GridTile.tsx` | **新建** | 纯展示 tile，无 hook，`<div role="button">` 无嵌套 |
| `packages/shell/src/pages/shell/SortableGridTile.tsx` | **新建** | 固定调用 `useSortable`，委托 GridTile 渲染 |
| `packages/shell/src/pages/shell/Grid.tsx` | **新建** | 统一网格，discriminated union props，选 wrapper |
| `packages/shell/src/pages/shell/SectionList.tsx` | 修改 | 引用 Grid，移除 PinnedGrid/ResultGrid 分支 |
| `packages/shell/src/pages/shell/hooks/navigation.ts` | 修改 | down 补 sectionId 过滤，到底时跨 section 跳 |
| `packages/shell/src/pages/shell/Shell.tsx` | 修改 | 加 `onMouseDown` + `onFocusCapture` 焦点锁定 |

## 测试要点

- `buildNavigationMap` — 跨 section 边界导航行为
- `ResultIcon` — url/asset 加载失败 → 首字母降级
- `Grid` — 拖拽结束后 `suppressClick` 正确压制原 item 的 onClick
