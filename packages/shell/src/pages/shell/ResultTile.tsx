import type { LauncherItem } from '@szybko/shared';
import { HighlightedText } from './HighlightedText';

interface ResultTileProps {
    item: LauncherItem;
    selected: boolean;
    onSelect: () => void;
    onExecute: () => void;
    onPinToggle: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * 网格单元格。
 * 交互按钮通过 item.capabilities 和 item.state 控制。
 */
export function ResultTile({ item, selected, onSelect, onExecute, onPinToggle, onContextMenu }: ResultTileProps) {
    return (
        <button
            onClick={onExecute}
            onMouseEnter={onSelect}
            onContextMenu={onContextMenu}
            className={`relative flex flex-col items-center justify-center rounded-2xl p-2 transition-all duration-150 focus:outline-none ${
                selected
                    ? 'border border-primary/40 bg-primary/15 text-text'
                    : 'border border-transparent bg-transparent hover:bg-surface-hover/60'
            }`}
            style={{ height: 82 }}
        >
            <div className="flex size-10 items-center justify-center overflow-hidden font-semibold text-sm text-text-muted">
                {item.icon?.type === 'emoji' && <span>{item.icon.value}</span>}
                {item.icon?.type === 'url' && <img src={item.icon.value} alt="" className="size-10 object-contain" />}
                {!item.icon && <span>📄</span>}
            </div>
            <div className="w-full truncate text-center font-medium text-xs leading-tight text-text">
                <HighlightedText text={item.title} ranges={item.matches?.title} />
            </div>

            {/* Pin 按钮：仅 capabilities.pin 时显示 */}
            {item.capabilities.pin && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onPinToggle();
                    }}
                    className={`absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded text-[11px] transition-colors hover:bg-surface-hover ${
                        item.state.pinned ? 'text-primary' : 'text-text-muted/40 hover:text-text-muted'
                    }`}
                    title={item.state.pinned ? '取消固定' : '固定'}
                >
                    {item.state.pinned ? '📌' : '📍'}
                </button>
            )}
        </button>
    );
}
