import type { LauncherItem, LauncherItemId } from '@szybko/shared';
import { ResultTile } from './ResultTile';

interface ResultGridProps {
    items: LauncherItem[];
    startIndex: number;
    selectedIndex: number;
    columns: number;
    onSelect: (globalIndex: number) => void;
    onExecute: (itemId: LauncherItemId) => void;
    onPinToggle: (itemId: LauncherItemId) => void;
    onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}

export function ResultGrid({
    items,
    startIndex,
    selectedIndex,
    columns,
    onSelect,
    onExecute,
    onPinToggle,
    onContextMenu,
}: ResultGridProps) {
    if (items.length === 0)
        return null;

    return (
        <div
            className="grid gap-2 px-2"
            style={{
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
            }}
        >
            {items.map((item, i) => {
                const globalIdx = startIndex + i;
                return (
                    <ResultTile
                        key={item.id}
                        item={item}
                        selected={globalIdx === selectedIndex}
                        onSelect={() => onSelect(globalIdx)}
                        onExecute={() => onExecute(item.id)}
                        onPinToggle={() => onPinToggle(item.id)}
                        onContextMenu={e => onContextMenu(item.id, e)}
                    />
                );
            })}
        </div>
    );
}
