import type { LauncherItem, LauncherItemId } from '@szybko/shared';
import clsx from 'clsx';
import { useCallback } from 'react';
import { HighlightedText } from './HighlightedText';
import { ResultIcon } from './ResultIcon';

export interface GridTileProps {
    item: LauncherItem;
    selected: boolean;
    suppressClick: boolean;
    onExecute: (itemId: LauncherItemId) => void;
    onContextMenu: (e: React.MouseEvent) => void;
}

export function GridTile({
    item,
    selected,
    suppressClick,
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
            className={clsx(
                'group relative flex size-full cursor-pointer flex-col items-center justify-end gap-1.5 rounded-xs px-1.5 py-2 text-center transition-[background-color,box-shadow] duration-100 outline-none',
                selected
                    ? 'bg-border'
                    : 'bg-transparent hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60',
            )}
            data-interactive
            onClick={handleClick}
            onContextMenu={onContextMenu}
            onKeyDown={handleKeyDown}
        >
            <ResultIcon icon={item.icon} title={item.title} />
            <div
                className={
                    clsx(
                        'w-full truncate px-1 text-center text-[12px] leading-4',
                        selected
                            ? 'text-text'
                            : 'text-text-muted group-hover:text-text',
                    )
                }
            >
                <HighlightedText
                    text={item.title}
                    ranges={item.matches?.title}
                />
            </div>
        </div>
    );
}
