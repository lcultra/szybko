import type { DragEndEvent } from '@dnd-kit/core';
import type { LauncherItem, LauncherItemId } from '@szybko/shared';
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GridTile } from './GridTile';
import { SortableGridTile } from './SortableGridTile';

interface GridProps {
    items: LauncherItem[];
    startIndex: number;
    selectedIndex: number;
    columns: number;
    /** 是否允许拖拽排序。为 true 时 items.length > 1 才实际启用 DndContext。 */
    draggable: boolean;
    onReorder?: (itemId: LauncherItemId, toIndex: number) => void;
    onExecute: (itemId: LauncherItemId) => void;
    onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}

const SUPPRESS_DURATION_MS = 250;

export function Grid({
    items,
    startIndex,
    selectedIndex,
    columns,
    draggable,
    onReorder,
    onExecute,
    onContextMenu,
}: GridProps) {
    const [suppressClickId, setSuppressClickId] = useState<LauncherItemId | null>(null);
    const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 用 ref 透传，避免 handleExecute 随 suppressClickId 变化而重建
    const suppressRef = useRef(suppressClickId);
    suppressRef.current = suppressClickId;

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
            setSuppressClickId(prev => (prev === sourceId ? null : prev));
        }, SUPPRESS_DURATION_MS);

        if (!onReorder)
            return;

        const { over } = event;
        if (!over || sourceId === over.id)
            return;

        const oldIndex = itemIds.indexOf(sourceId);
        const newIndex = itemIds.indexOf(over.id as LauncherItemId);
        if (oldIndex === -1 || newIndex === -1)
            return;

        onReorder(sourceId, newIndex);
    }, [onReorder, itemIds]);

    // 稳定引用，不随 suppressClickId 变化，避免所有子组件不必要重渲染
    const handleExecute = useCallback((itemId: LauncherItemId) => {
        if (suppressRef.current === itemId)
            return;
        onExecute(itemId);
    }, [onExecute]);

    if (items.length === 0)
        return null;

    // items.length > 1 时才真正需要 DnD 能力
    const canDrag = draggable && items.length > 1;

    const grid = (
        <div
            className="grid px-2"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: '89px' }}
        >
            {items.map((item, i) => {
                const globalIdx = startIndex + i;
                const selected = globalIdx === selectedIndex;
                const TileComponent = canDrag ? SortableGridTile : GridTile;

                return (
                    <TileComponent
                        key={item.id}
                        item={item}
                        selected={selected}
                        suppressClick={canDrag && suppressClickId === item.id}
                        onExecute={handleExecute}
                        onContextMenu={e => onContextMenu(item.id, e)}
                    />
                );
            })}
        </div>
    );

    if (!canDrag)
        return grid;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itemIds} strategy={rectSortingStrategy}>
                {grid}
            </SortableContext>
        </DndContext>
    );
}
