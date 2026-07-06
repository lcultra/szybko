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
