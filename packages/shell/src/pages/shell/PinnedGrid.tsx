import type { DragEndEvent } from '@dnd-kit/core';
import type { LauncherItem, LauncherItemId } from '@szybko/shared';
import {
    closestCenter,
    DndContext,

    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    rectSortingStrategy,
    SortableContext,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo } from 'react';
import { ResultTile } from './ResultTile';

interface PinnedGridProps {
    items: LauncherItem[];
    startIndex: number;
    selectedIndex: number;
    columns: number;
    onSelect: (globalIndex: number) => void;
    onExecute: (itemId: LauncherItemId) => void;
    onPinToggle: (itemId: LauncherItemId) => void;
    onReorder: (itemId: LauncherItemId, toIndex: number) => void;
    onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}

function SortableTile({
    item,
    selected,
    onSelect,
    onExecute,
    onPinToggle,
    onContextMenu,
}: {
    item: LauncherItem;
    selected: boolean;
    onSelect: () => void;
    onExecute: () => void;
    onPinToggle: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        pointerEvents: isDragging ? 'none' as const : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={isDragging ? 'opacity-45 will-change-transform' : ''}
            {...attributes}
            {...listeners}
        >
            <ResultTile
                item={item}
                selected={selected}
                onSelect={onSelect}
                onExecute={onExecute}
                onPinToggle={onPinToggle}
                onContextMenu={onContextMenu}
            />
        </div>
    );
}

export function PinnedGrid({
    items,
    startIndex,
    selectedIndex,
    columns,
    onSelect,
    onExecute,
    onPinToggle,
    onReorder,
    onContextMenu,
}: PinnedGridProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    );

    const itemIds = useMemo(() => items.map(i => i.id), [items]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id)
            return;

        const oldIndex = itemIds.indexOf(active.id as LauncherItemId);
        const newIndex = itemIds.indexOf(over.id as LauncherItemId);
        if (oldIndex === -1 || newIndex === -1)
            return;

        onReorder(active.id as LauncherItemId, newIndex);
    };

    if (items.length === 0)
        return null;

    // 只有一个 item 时不启用拖拽
    if (items.length === 1) {
        return (
            <div
                className="grid gap-2 px-2"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
            >
                {items.map((item, i) => (
                    <ResultTile
                        key={item.id}
                        item={item}
                        selected={startIndex + i === selectedIndex}
                        onSelect={() => onSelect(startIndex + i)}
                        onExecute={() => onExecute(item.id)}
                        onPinToggle={() => onPinToggle(item.id)}
                        onContextMenu={e => onContextMenu(item.id, e)}
                    />
                ))}
            </div>
        );
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itemIds} strategy={rectSortingStrategy}>
                <div
                    className="grid gap-2 px-2"
                    style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
                >
                    {items.map((item, i) => (
                        <SortableTile
                            key={item.id}
                            item={item}
                            selected={startIndex + i === selectedIndex}
                            onSelect={() => onSelect(startIndex + i)}
                            onExecute={() => onExecute(item.id)}
                            onPinToggle={() => onPinToggle(item.id)}
                            onContextMenu={e => onContextMenu(item.id, e)}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
