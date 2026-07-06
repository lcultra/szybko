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
        outline: isOver ? '2px solid var(--color-primary)' : undefined,
        outlineOffset: isOver ? -1 : undefined,
        borderRadius: isOver ? 16 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={isDragging ? 'opacity-45 will-change-transform' : ''}
            {...attributes}
            {...listeners}
        >
            <GridTile {...props} />
        </div>
    );
}
