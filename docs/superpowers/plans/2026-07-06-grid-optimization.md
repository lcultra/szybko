# Grid 组件合并与交互优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 合并 PinnedGrid + ResultGrid 为统一 Grid 组件，补齐拖拽视觉反馈、焦点锁定、图标降级等交互细节。

**Architecture:** 保持现有组件树层级不变（Shell → SectionList → Grid → GridTile），将 PinnedGrid（拖拽版）和 ResultGrid（静态版）合并为单一 Grid 组件，使用 discriminated union props 区分拖拽/非拖拽行为。拖拽逻辑封装在 SortableGridTile wrapper 中，GridTile 为纯展示组件。

**Tech Stack:** React + Tailwind CSS v4 + @dnd-kit/core + @dnd-kit/sortable + lucide-react

## 全局约束

- 不引入新的运行时依赖（lucide-react 已存在）
- 所有新建组件使用 discriminated union props 替代可选 prop 模式
- tile root 使用 `<div role="button">`，禁止嵌套 `<button>`
- `useSortable` 只在 `SortableGridTile` 中调用，不允许条件式 hook
- 拖拽传感器仅使用 `PointerSensor`，`activationConstraint: { distance: 8 }`
- 焦点锁定使用 `onMouseDown` + `onFocusCapture`（非 `onFocusIn`）

---
### Task 0: 测试基础设施搭建

**Files:**
- Create: `packages/shell/vitest.config.ts`
- Modify: `packages/shell/package.json`（添加 devDependencies）

**Interfaces:**
- Produces: vitest 可运行。后续任务的测试步骤使用 `pnpm --filter @szybko/shell exec vitest run` 执行。

- [ ] **Step 1: 添加 vitest + happy-dom + @testing-library/react**

编辑 `packages/shell/package.json` 的 `devDependencies` 添加：

```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "happy-dom": "^15.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0"
  }
}
```

- [ ] **Step 2: 创建 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@szybko/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
```

- [ ] **Step 3: 安装依赖**

```bash
cd /Users/pengcheng17/Documents/workspace/ai/szybko && pnpm install
```

- [ ] **Step 4: 验证 vitest 可运行**

```bash
pnpm --filter @szybko/shell exec vitest run --help
```
Expected: 打印 vitest help，无错误。

- [ ] **Step 5: Commit**

```bash
git add packages/shell/vitest.config.ts packages/shell/package.json pnpm-lock.yaml
git commit -m "test: add vitest + happy-dom to shell package"
```

---
### Task 1: 修正 navigation.ts（方向键跨 section 行为）

**Files:**
- Modify: `packages/shell/src/pages/shell/hooks/navigation.ts`
- Create: `packages/shell/src/pages/shell/hooks/navigation.test.ts`

**Interfaces:**
- Produces: 修正后的 `buildNavigationMap`，输出 `down` 在同 section 内找下一行，到底时跳到下一 section 首行同列。

- [ ] **Step 1: 写 failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildNavigationMap } from './navigation';

describe('buildNavigationMap', () => {
  it('down stays within same section when next row exists', () => {
    const map = buildNavigationMap(
      [{ sectionId: 'pinned', count: 18 }],
      9,
      1, // selectedIndex=1, row=0 col=1
    );
    // row 1 col 0 = index 9
    expect(map.down).toBe(10); // row=1 col=1
  });

  it('down jumps to next section first row same col when at section bottom', () => {
    const map = buildNavigationMap(
      [
        { sectionId: 'pinned', count: 12 }, // rows 0-1 (12 items in 9 cols = 2 rows)
        { sectionId: 'apps', count: 18 },    // rows 2-3
      ],
      9,
      11, // pinned last item (row=1 col=2, globalIndex 11)
    );
    // Should jump to apps row=2 col=2 → globalIndex 12 + 2 = 14
    // pinned: 0-11, apps: 12-29
    expect(map.down).toBe(14); // apps row=0 col=2 (globalIndex 12+2)
  });

  it('down returns null when no next section exists', () => {
    const map = buildNavigationMap(
      [{ sectionId: 'pinned', count: 9 }],
      9,
      8, // last item in the only section
    );
    expect(map.down).toBeNull();
  });

  it('up stays within same section', () => {
    const map = buildNavigationMap(
      [{ sectionId: 'pinned', count: 18 }],
      9,
      15, // row=1 col=6
    );
    expect(map.up).toBe(6); // row=0 col=6
  });

  it('up jumps to previous section last row same col at section top', () => {
    const map = buildNavigationMap(
      [
        { sectionId: 'pinned', count: 12 },
        { sectionId: 'apps', count: 18 },
      ],
      9,
      12, // apps first item (globalIndex 12), row=0 col=0
    );
    // pinned: items 0-11 in 9 cols → row 0 idx 0-8, row 1 idx 9-11
    // last row col=0 in pinned = index 9
    expect(map.up).toBe(9);
  });

  it('up returns null at global first item', () => {
    const map = buildNavigationMap(
      [{ sectionId: 'pinned', count: 9 }],
      9,
      0,
    );
    expect(map.up).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，验证失败**

```bash
pnpm --filter @szybko/shell exec vitest run packages/shell/src/pages/shell/hooks/navigation.test.ts
```
Expected: 所有测试 fail（buildNavigationMap 当前 `down` 跨 section，不会跳 section）。

- [ ] **Step 3: 实现修正**

将 `packages/shell/src/pages/shell/hooks/navigation.ts` 中 `down` 的查找逻辑从：

```ts
const down = cells.find(c => c.col === current.col && c.row === current.row + 1);
```

改为：

```ts
// 先查同 section 下一行
const down = cells.find(
  c => c.col === current.col && c.row === current.row + 1 && c.sectionId === current.sectionId,
);
// 若到底（同 section 无下一行），查下一 section 第一行同列
const down = cells.find(
  c => c.col === current.col && c.row === current.row + 1 && c.sectionId === current.sectionId,
) ?? cells.find(
  c => c.col === current.col && c.row === 0 && c.sectionId !== current.sectionId,
);
```

同时 `up` 也做对应改造：

```ts
const up = cells.find(
  c => c.col === current.col && c.row === current.row - 1 && c.sectionId === current.sectionId,
) ?? cells.findLast(
  c => c.col === current.col && c.sectionId !== current.sectionId,
);
```

注意：需要根据 `sectionOffsets` 排序选最近的 section（prev section = sectionOffsets 中 `start` 小于 `currentSection.start` 的最大值，next section = 大于 `currentSection.start` 的最小值）。

完整实现：

```ts
// 找到当前 section 在 sectionOffsets 中的位置
const sectionOrder = sectionOffsets
  .filter(o => o.length > 0)
  .sort((a, b) => a.start - b.start);
const currentSectionIdx = sectionOrder.findIndex(o => o.sectionId === current.sectionId);
const currentSection = sectionOrder[currentSectionIdx];

// down: 同 section 下一行 → 下一 section 第一行同列 → null
const down = cells.find(
  c => c.col === current.col && c.row === current.row + 1 && c.sectionId === current.sectionId,
) ?? (currentSectionIdx < sectionOrder.length - 1
  ? cells.find(
      c => c.col === current.col && c.row === 0 && c.sectionId === sectionOrder[currentSectionIdx + 1].sectionId,
    ) ?? null
  : null);

// up: 同 section 上一行 → 上一 section 最后一行同列 → null
const up = cells.find(
  c => c.col === current.col && c.row === current.row - 1 && c.sectionId === current.sectionId,
) ?? (currentSectionIdx > 0
  ? cells.findLast(
      c => c.col === current.col && c.sectionId === sectionOrder[currentSectionIdx - 1].sectionId,
    ) ?? null
  : null);
```

注意：`buildNavigationMap` 函数签名新增 `sectionOffsets` 参数，但当前调用处 `SectionList.tsx` 已计算 `sectionOffsets`。需将 `sectionOffsets` 作为参数传入，而非依赖 `cells` 推断。

更新函数签名：

```ts
export function buildNavigationMap(
  sectionItemCounts: Array<{ sectionId: string; count: number }>,
  columns: number,
  selectedIndex: number,
  sectionOffsets: Array<{ sectionId: string; start: number; length: number }>,
): NavigationMap {
```

更新 `SectionList.tsx` 中的调用（在 Task 5 中一并改）。

- [ ] **Step 4: 运行测试，验证通过**

```bash
pnpm --filter @szybko/shell exec vitest run packages/shell/src/pages/shell/hooks/navigation.test.ts
```
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/shell/src/pages/shell/hooks/navigation.ts packages/shell/src/pages/shell/hooks/navigation.test.ts
git commit -m "fix: NavigationMap down/up direction respects section boundaries, jumps between sections"
```

---
### Task 2: 创建 ResultIcon 组件

**Files:**
- Create: `packages/shell/src/pages/shell/ResultIcon.tsx`
- Create: `packages/shell/src/pages/shell/ResultIcon.test.tsx`

**Interfaces:**
- Consumes: `IconDescriptor` from `@szybko/shared`
- Produces: `function ResultIcon({ icon, title }: { icon?: IconDescriptor; title: string }): JSX.Element`

- [ ] **Step 1: 写 failing test**

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultIcon } from './ResultIcon';

describe('ResultIcon', () => {
  it('renders emoji icon', () => {
    render(<ResultIcon icon={{ type: 'emoji', value: '🔥' }} title="Test" />);
    expect(screen.getByText('🔥')).toBeDefined();
  });

  it('renders first char fallback when no icon', () => {
    render(<ResultIcon title="Test" />);
    expect(screen.getByText('T')).toBeDefined();
  });

  it('renders first char fallback when icon is undefined', () => {
    render(<ResultIcon icon={undefined} title="Alpha" />);
    expect(screen.getByText('A')).toBeDefined();
  });

  it('renders img for url type', () => {
    render(<ResultIcon icon={{ type: 'url', value: 'https://example.com/icon.png' }} title="Test" />);
    const img = screen.getByRole('img');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/icon.png');
  });

  it('renders img for asset type', () => {
    render(<ResultIcon icon={{ type: 'asset', value: 'assets/icon.svg' }} title="Test" />);
    const img = screen.getByRole('img');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('assets/icon.svg');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm --filter @szybko/shell exec vitest run packages/shell/src/pages/shell/ResultIcon.test.tsx
```
Expected: FAIL (模块未找到)。

- [ ] **Step 3: 实现组件**

```tsx
import { useState } from 'react';
import type { IconDescriptor } from '@szybko/shared';

interface ResultIconProps {
  icon?: IconDescriptor;
  title: string;
}

function firstChar(title: string): string {
  return Array.from(title)[0] ?? '?';
}

export function ResultIcon({ icon, title }: ResultIconProps) {
  const [failed, setFailed] = useState(false);

  if (!icon) {
    return <span className="grid size-10 place-items-center overflow-hidden text-sm font-semibold text-text-muted">{firstChar(title)}</span>;
  }

  if (icon.type === 'emoji') {
    return <span className="grid size-10 place-items-center overflow-hidden text-sm font-semibold text-text-muted">{icon.value}</span>;
  }

  if (failed) {
    return <span className="grid size-10 place-items-center overflow-hidden text-sm font-semibold text-text-muted">{firstChar(title)}</span>;
  }

  return (
    <span className="grid size-10 place-items-center overflow-hidden text-sm font-semibold text-text-muted">
      <img
        alt=""
        className="size-10 object-contain"
        draggable={false}
        onError={() => setFailed(true)}
        src={icon.value}
      />
    </span>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm --filter @szybko/shell exec vitest run packages/shell/src/pages/shell/ResultIcon.test.tsx
```
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/shell/src/pages/shell/ResultIcon.tsx packages/shell/src/pages/shell/ResultIcon.test.tsx
git commit -m "feat: add ResultIcon component with emoji/url/asset + first-char fallback"
```

---
### Task 3: 创建 GridTile + SortableGridTile

**Files:**
- Create: `packages/shell/src/pages/shell/GridTile.tsx`
- Create: `packages/shell/src/pages/shell/SortableGridTile.tsx`

**Interfaces:**
- Consumes: `ResultIcon` from Task 2, `HighlightedText` (existing), `LauncherItem`/`LauncherItemId` from `@szybko/shared`, `Pin` from `lucide-react`
- Produces: `GridTile` (pure presentational), `SortableGridTile` (useSortable wrapper)
- Interfaces → GridTileProps:
  ```ts
  interface GridTileProps {
    item: LauncherItem;
    selected: boolean;
    suppressClick: boolean;
    onSelect: () => void;
    onExecute: (itemId: LauncherItemId) => void;
    onPinToggle: (itemId: LauncherItemId) => void;
    onContextMenu: (e: React.MouseEvent) => void;
  }
  ```

- [ ] **Step 1: 实现 GridTile**

```tsx
import { useCallback } from 'react';
import { Pin, PinOff } from 'lucide-react';
import type { LauncherItem, LauncherItemId } from '@szybko/shared';
import { HighlightedText } from './HighlightedText';
import { ResultIcon } from './ResultIcon';

interface GridTileProps {
  item: LauncherItem;
  selected: boolean;
  suppressClick: boolean;
  onSelect: () => void;
  onExecute: (itemId: LauncherItemId) => void;
  onPinToggle: (itemId: LauncherItemId) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function GridTile({
  item,
  selected,
  suppressClick,
  onSelect,
  onExecute,
  onPinToggle,
  onContextMenu,
}: GridTileProps) {
  const handleClick = useCallback(() => {
    if (suppressClick) return;
    onExecute(item.id);
  }, [suppressClick, onExecute, item.id]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  const handlePinClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onPinToggle(item.id);
  }, [onPinToggle, item.id]);

  const handleContextMenuEvent = useCallback((e: React.MouseEvent) => {
    onContextMenu(e);
  }, [onContextMenu]);

  return (
    <div
      role="button"
      tabIndex={-1}
      className={`relative grid size-full cursor-pointer grid-rows-[1fr_auto] place-items-center gap-1.5 rounded-2xl border p-2 text-center text-inherit outline-none transition-[opacity,background-color,border-color] duration-150 ${
        selected
          ? 'border-primary/40 bg-primary/15 text-text'
          : 'border-transparent bg-transparent hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60'
      }`}
      data-interactive
      onClick={handleClick}
      onContextMenu={handleContextMenuEvent}
      onMouseEnter={onSelect}
      onKeyDown={handleKeyDown}
    >
      <ResultIcon icon={item.icon} title={item.title} />
      <HighlightedText text={item.title} ranges={item.matches?.title} />
      {item.capabilities.pin && (
        <button
          tabIndex={-1}
          type="button"
          className={`absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded text-[11px] transition-colors hover:bg-surface-hover ${
            item.state.pinned ? 'text-primary' : 'text-text-muted/40 hover:text-text-muted'
          }`}
          onClick={handlePinClick}
          title={item.state.pinned ? '取消固定' : '固定'}
        >
          {item.state.pinned ? <Pin size={12} /> : <PinOff size={12} />}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 实现 SortableGridTile**

```tsx
import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import type { GridTileProps } from './GridTile';
import { GridTile } from './GridTile';

export function SortableGridTile(props: GridTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isDropTarget } = useSortable({
    id: props.item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    pointerEvents: isDragging ? ('none' as const) : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        isDragging
          ? 'opacity-45 will-change-transform'
          : isDropTarget
            ? '[&>div]:border-primary/70'
            : ''
      }
      {...attributes}
      {...listeners}
    >
      <GridTile {...props} />
    </div>
  );
}
```

注意：`isDropTarget` 的样式通过 `[&>div]:border-primary/70` 应用到子级 `GridTile` 的 border 上，因为 `SortableGridTile` 的 `<div>` 不直接控制 GridTile 内部的 border 样式。或者也可以简单地在 GridTile 的 className 条件中增加 `isDropTarget`——但 GridTile 是纯展示组件，不应知道拖拽状态。这里的方案是 SortableGridTile 通过 CSS selector 修改子元素边框，保持 GridTile 的纯净。

> 如果 Tailwind v4 的 `[&>div]:` 语法在项目配置中不生效，可用行内 style 替代：在 SortableGridTile 的 `<div>` 上设置 `style={{ outline: isDropTarget ? '2px solid var(--color-primary)' : undefined, outlineOffset: -1 }}` 或直接在包装 div 上加 border。

- [ ] **Step 3: 验证编译**

```bash
pnpm --filter @szybko/shell build
```
Expected: TypeScript 编译无错误。

- [ ] **Step 4: Commit**

```bash
git add packages/shell/src/pages/shell/GridTile.tsx packages/shell/src/pages/shell/SortableGridTile.tsx
git commit -m "feat: add GridTile (pure presentational) and SortableGridTile (useSortable wrapper)"
```

---
### Task 4: 创建 Grid 统一网格组件

**Files:**
- Create: `packages/shell/src/pages/shell/Grid.tsx`

**Interfaces:**
- Consumes: `GridTile`, `SortableGridTile` from Task 3, `@dnd-kit/core` + `@dnd-kit/sortable`, `LauncherItem`/`LauncherItemId` from `@szybko/shared`
- Produces: `Grid` component with discriminated union props

```ts
type GridProps = GridStaticProps | GridDraggableProps;

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

interface GridStaticProps extends GridBaseProps {
  draggable: false;
  onReorder?: undefined;
}

interface GridDraggableProps extends GridBaseProps {
  draggable: true;
  onReorder: (itemId: LauncherItemId, toIndex: number) => void;
}
```

- [ ] **Step 1: 实现 Grid.tsx**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import type { LauncherItem, LauncherItemId } from '@szybko/shared';
import { GridTile } from './GridTile';
import { SortableGridTile } from './SortableGridTile';

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

interface GridStaticProps extends GridBaseProps {
  draggable: false;
  onReorder?: undefined;
}

interface GridDraggableProps extends GridBaseProps {
  draggable: true;
  onReorder: (itemId: LauncherItemId, toIndex: number) => void;
}

type GridProps = GridStaticProps | GridDraggableProps;

const SUPPRESS_DURATION_MS = 250;

export function Grid(props: GridProps) {
  const { items, startIndex, selectedIndex, columns, onSelect, onExecute, onPinToggle, onContextMenu } = props;
  const draggable = props.draggable;
  // discriminated: onReorder only available when draggable is true
  const onReorder = props.draggable ? props.onReorder : undefined;

  const [suppressClickId, setSuppressClickId] = useState<LauncherItemId | null>(null);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理 timer 在 unmount 时
  useEffect(() => {
    return () => {
      if (suppressTimerRef.current !== null) {
        clearTimeout(suppressTimerRef.current);
      }
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const itemIds = useMemo(() => items.map(i => i.id), [items]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const sourceId = event.active.id as LauncherItemId;

    // 无论 drop 在目标上、drop outside、还是 same item，都压制原 item 的点击
    setSuppressClickId(sourceId);
    if (suppressTimerRef.current !== null) {
      clearTimeout(suppressTimerRef.current);
    }
    suppressTimerRef.current = setTimeout(() => {
      setSuppressClickId(prev => prev === sourceId ? null : prev);
    }, SUPPRESS_DURATION_MS);

    if (!onReorder) return;

    const { over } = event;
    if (!over || sourceId === over.id) return;

    const oldIndex = itemIds.indexOf(sourceId);
    const newIndex = itemIds.indexOf(over.id as LauncherItemId);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(sourceId, newIndex);
  }, [onReorder, itemIds]);

  const handleSelect = useCallback((globalIndex: number) => {
    onSelect(globalIndex);
  }, [onSelect]);

  const handleExecute = useCallback((itemId: LauncherItemId) => {
    if (suppressClickId === itemId) return;
    onExecute(itemId);
  }, [suppressClickId, onExecute]);

  const handlePinToggle = useCallback((itemId: LauncherItemId) => {
    onPinToggle(itemId);
  }, [onPinToggle]);

  const handleContextMenu = useCallback((itemId: LauncherItemId, e: React.MouseEvent) => {
    onContextMenu(itemId, e);
  }, [onContextMenu]);

  if (items.length === 0) return null;

  const grid = (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: '82px' }}
    >
      {items.map((item, i) => {
        const globalIdx = startIndex + i;
        const selected = globalIdx === selectedIndex;
        const TileComponent = draggable ? SortableGridTile : GridTile;

        return (
          <TileComponent
            key={item.id}
            item={item}
            selected={selected}
            suppressClick={suppressClickId === item.id}
            onSelect={() => handleSelect(globalIdx)}
            onExecute={handleExecute}
            onPinToggle={handlePinToggle}
            onContextMenu={(e) => handleContextMenu(item.id, e)}
          />
        );
      })}
    </div>
  );

  if (!draggable) return grid;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm --filter @szybko/shell build
```
Expected: TypeScript 编译无错误。

- [ ] **Step 3: Commit**

```bash
git add packages/shell/src/pages/shell/Grid.tsx
git commit -m "feat: add unified Grid component with discriminated draggable prop and suppressClick"
```

---
### Task 5: 更新 SectionList + Shell（接入新组件 + 焦点锁定）

**Files:**
- Modify: `packages/shell/src/pages/shell/SectionList.tsx`
- Modify: `packages/shell/src/pages/shell/Shell.tsx`

**Interfaces:**
- Consumes: `Grid` from Task 4, `buildNavigationMap` from Task 1

- [ ] **Step 1: 更新 SectionList.tsx**

将旧的 `PinnedGrid` 和 `ResultGrid` 引用替换为 `Grid`，移除分支逻辑。

```tsx
import type { LauncherItem, LauncherItemId, ResultSection } from '@szybko/shared';
import { useMemo } from 'react';
import { Grid } from './Grid';
import { SectionHeader } from './SectionHeader';

const DEFAULT_ROWS = 2;
const DEFAULT_COLUMNS = 9;

interface SectionListProps {
  sections: ResultSection[];
  itemsById: Record<LauncherItemId, LauncherItem>;
  selectedIndex: number;
  expandedSectionIds: Set<string>;
  onSelect: (globalIndex: number) => void;
  onExecute: (itemId: LauncherItemId) => void;
  onPinToggle: (itemId: LauncherItemId) => void;
  onToggleExpand: (sectionId: string) => void;
  onReorder: (itemId: LauncherItemId, toIndex: number) => void;
  onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}

export function SectionList({
  sections,
  itemsById,
  selectedIndex,
  expandedSectionIds,
  onSelect,
  onExecute,
  onPinToggle,
  onToggleExpand,
  onReorder,
  onContextMenu,
}: SectionListProps) {
  // sectionOffsets 保持计算，同时传给 NavigationMap（Task 1 需要）
  const { sectionOffsets } = useMemo(() => {
    const offsets: Array<{ sectionId: string; start: number; length: number }> = [];
    let total = 0;
    for (const section of sections) {
      const expanded = expandedSectionIds.has(section.id);
      const visible = expanded ? section.itemIds.length : Math.min(section.itemIds.length, DEFAULT_ROWS * DEFAULT_COLUMNS);
      offsets.push({ sectionId: section.id, start: total, length: visible });
      total += visible;
    }
    return { sectionOffsets: offsets, visibleCount: total };
  }, [sections, expandedSectionIds]);

  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-2 pb-2">
      {sections.map((section) => {
        const offset = sectionOffsets.find(o => o.sectionId === section.id)!;
        const expanded = expandedSectionIds.has(section.id);
        const visibleIds = expanded
          ? section.itemIds
          : section.itemIds.slice(0, DEFAULT_ROWS * DEFAULT_COLUMNS);

        const items = visibleIds
          .map(id => itemsById[id])
          .filter((item): item is LauncherItem => item != null);

        const isPinned = section.source === 'pinned';

        return (
          <div key={section.id}>
            {section.source !== 'search' && (
              <SectionHeader
                title={section.title}
                shownCount={items.length}
                totalCount={section.totalCount}
                expanded={expanded}
                canExpand={section.hasMore || section.totalCount > DEFAULT_ROWS * DEFAULT_COLUMNS}
                layout={section.layout}
                onToggle={() => onToggleExpand(section.id)}
              />
            )}
            <Grid
              items={items}
              startIndex={offset.start}
              selectedIndex={selectedIndex}
              columns={DEFAULT_COLUMNS}
              draggable={isPinned}
              onReorder={isPinned ? onReorder : undefined}
              onSelect={onSelect}
              onExecute={onExecute}
              onPinToggle={onPinToggle}
              onContextMenu={onContextMenu}
            />
          </div>
        );
      })}
    </div>
  );
}
```

同时更新 `Shell.tsx` 中 `useMemo` 传给 `buildNavigationMap` 的调用，将 `sectionOffsets` 作为参数传入：

```tsx
// 在 Shell.tsx 中
const navigationMap = useMemo(() => {
  const counts = sections.map(s => ({
    sectionId: s.id,
    count: expandedSectionIds.has(s.id)
      ? s.itemIds.length
      : Math.min(s.itemIds.length, MAX_VISIBLE),
  }));
  // 计算 sectionOffsets（与 SectionList 中相同逻辑）
  let total = 0;
  const offsets = counts.map(c => {
    const start = total;
    total += c.count;
    return { sectionId: c.sectionId, start, length: c.count };
  });
  return buildNavigationMap(counts, DEFAULT_COLUMNS, selectedIndex, offsets);
}, [sections, expandedSectionIds, selectedIndex]);
```

- [ ] **Step 2: 更新 Shell.tsx — 添加焦点锁定**

在结果容器上添加 `onMouseDown` 和 `onFocusCapture`：

```tsx
// 在 Shell.tsx App 组件内部：

// 阻止点击结果项让搜索框失焦
function handleMouseDown(event: React.MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  event.preventDefault();
}

function handleFocusCapture(event: React.FocusEvent) {
  const target = event.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  event.preventDefault();
}
```

应用到结果容器 `<div>` 上：

```tsx
{state !== 'plugin' && (
  <div
    className="max-h-[424px] min-h-0 overflow-y-auto overscroll-contain"
    onMouseDown={handleMouseDown}
    onFocusCapture={handleFocusCapture}
  >
    {/* ... sections */}
  </div>
)}
```

- [ ] **Step 3: 验证编译**

```bash
pnpm --filter @szybko/shell build
```
Expected: TypeScript 编译无错误。

- [ ] **Step 4: 手动验证 — 拖拽后不触发执行**

1. `pnpm dev` 启动应用
2. 固定在 pinned 区有多于 1 个 item
3. 拖拽一个 pinned item 到新位置
4. 验证：item 没有因为拖拽结束而执行（之前会误触）
5. 验证：正常点击 item 仍然执行
6. 验证：拖拽目标槽有边框高亮
7. 验证：方向键导航在 section 边界正确跳转

- [ ] **Step 5: Commit**

```bash
git add packages/shell/src/pages/shell/SectionList.tsx packages/shell/src/pages/shell/Shell.tsx
git commit -m "refactor: use unified Grid in SectionList, add focus lock to Shell"
```

---
### Task 6: 清理旧文件

**Files:**
- Delete: `packages/shell/src/pages/shell/ResultTile.tsx`
- Delete: `packages/shell/src/pages/shell/ResultGrid.tsx`
- Delete: `packages/shell/src/pages/shell/PinnedGrid.tsx`

- [ ] **Step 1: 删除旧文件**

```bash
rm packages/shell/src/pages/shell/ResultTile.tsx
rm packages/shell/src/pages/shell/ResultGrid.tsx
rm packages/shell/src/pages/shell/PinnedGrid.tsx
```

- [ ] **Step 2: 验证无死引用**

```bash
pnpm --filter @szybko/shell build
```
Expected: 编译无错误，无 "module not found" 报错。

- [ ] **Step 3: 验证全量测试通过**

```bash
pnpm --filter @szybko/shell exec vitest run
```
Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove ResultTile, ResultGrid, PinnedGrid (replaced by Grid + GridTile)"
```
