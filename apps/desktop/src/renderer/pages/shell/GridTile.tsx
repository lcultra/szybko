import type { LauncherItem, LauncherItemId } from '@szybko/shared';
import { useCallback } from 'react';
import { HighlightedText } from './HighlightedText';
import { ResultIcon } from './ResultIcon';

export interface GridTileProps {
    item: LauncherItem;
    selected: boolean;
    suppressClick: boolean;
    onSelect: () => void;
    onExecute: (itemId: LauncherItemId) => void;
    onContextMenu: (e: React.MouseEvent) => void;
}

export function GridTile({
    item,
    selected,
    suppressClick,
    onSelect,
    onExecute,
    onContextMenu,
}: GridTileProps) {
    const handleClick = useCallback(() => {
        if (suppressClick)
            return;
        onExecute(item.id);
    }, [suppressClick, onExecute, item.id]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
        }
    }, [handleClick]);

    return (
        <div
            role="button"
            tabIndex={-1}
            className={`group relative grid size-full cursor-pointer grid-rows-[1fr_auto] place-items-center gap-1 rounded-xl p-1.5 text-center transition-[background-color,box-shadow] duration-100 outline-none ${
                selected
                    ? 'bg-accent/12 ring-accent/30 dark:bg-accent/15 ring-1 ring-inset'
                    : 'bg-transparent hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60'
            }`}
            data-interactive
            onClick={handleClick}
            onContextMenu={onContextMenu}
            onMouseEnter={onSelect}
            onKeyDown={handleKeyDown}
        >
            <ResultIcon icon={item.icon} title={item.title} />
            <div className={`w-full truncate px-0.5 text-center text-xs leading-4 ${selected ? 'text-text' : 'text-text-muted group-hover:text-text'}`}>
                <HighlightedText text={item.title} ranges={item.matches?.title} />
            </div>
        </div>
    );
}
