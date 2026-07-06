import type { GridTileProps } from './GridTile';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GridTile } from './GridTile';

export function SortableGridTile(props: GridTileProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
        id: props.item.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        pointerEvents: isDragging ? ('none' as const) : undefined,
    };

    const stateClass = isDragging
        ? 'z-10 scale-105 bg-surface-card opacity-90 shadow-lg will-change-transform'
        : isOver
            ? 'ring-2 ring-accent/50 ring-inset'
            : '';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`rounded-xl transition-shadow duration-100 ${stateClass}`}
            {...attributes}
            {...listeners}
        >
            <GridTile {...props} />
        </div>
    );
}
