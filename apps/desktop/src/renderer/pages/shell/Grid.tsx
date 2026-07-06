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
    draggable: boolean;
    onReorder?: (itemId: LauncherItemId, toIndex: number) => void;
    onSelect: (globalIndex: number) => void;
    onExecute: (itemId: LauncherItemId) => void;
    onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}

const SUPPRESS_DURATION_MS = 250;

export function Grid(props: GridProps) {
    const { items, startIndex, selectedIndex, columns, onSelect, onExecute, onContextMenu } = props;
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

    const handleExecute = useCallback((itemId: LauncherItemId) => {
        if (suppressClickId === itemId)
            return;
        onExecute(itemId);
    }, [suppressClickId, onExecute]);

    const handleContextMenu = useCallback((itemId: LauncherItemId, e: React.MouseEvent) => {
        onContextMenu(itemId, e);
    }, [onContextMenu]);

    if (items.length === 0)
        return null;

    // For draggable grids with 0 or 1 items, skip DndContext overhead
    if (draggable && items.length <= 1) {
        return (
            <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: '76px' }}
            >
                {items.map((item, i) => (
                    <GridTile
                        key={item.id}
                        item={item}
                        selected={startIndex + i === selectedIndex}
                        suppressClick={false}
                        onSelect={() => onSelect(startIndex + i)}
                        onExecute={onExecute}
                        onContextMenu={e => onContextMenu(item.id, e)}
                    />
                ))}
            </div>
        );
    }

    const grid = (
        <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: '76px' }}
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
                        onSelect={() => onSelect(globalIdx)}
                        onExecute={handleExecute}
                        onContextMenu={e => handleContextMenu(item.id, e)}
                    />
                );
            })}
        </div>
    );

    if (!draggable)
        return grid;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itemIds} strategy={rectSortingStrategy}>
                {grid}
            </SortableContext>
        </DndContext>
    );
}
