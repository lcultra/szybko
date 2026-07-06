import { useCallback } from 'react';
import { Pin, PinOff } from 'lucide-react';
import type { LauncherItem, LauncherItemId } from '@szybko/shared';
import { HighlightedText } from './HighlightedText';
import { ResultIcon } from './ResultIcon';

export interface GridTileProps {
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
